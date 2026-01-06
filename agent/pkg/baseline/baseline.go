package baseline

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// Snapshot represents the baseline state of a container
type Snapshot struct {
	PodName     string    `json:"podName"`
	PodUID      string    `json:"podUID"`
	Namespace   string    `json:"namespace"`
	Container   string    `json:"container"`
	CapturedAt  time.Time `json:"capturedAt"`
	
	Filesystem  FilesystemState  `json:"filesystem"`
	Processes   ProcessState     `json:"processes"`
	Network     NetworkState     `json:"network"`
	Packages    PackageState     `json:"packages"`
	Permissions PermissionsState `json:"permissions"`
}

// FilesystemState tracks executable files and configs
type FilesystemState struct {
	ExecutableHashes map[string]string `json:"executableHashes"` // path -> sha256
	ConfigHashes     map[string]string `json:"configHashes"`     // path -> sha256
	TmpFiles         []string          `json:"tmpFiles"`         // files in /tmp
}

// ProcessState tracks running processes
type ProcessState struct {
	Processes []ProcessInfo `json:"processes"`
}

// ProcessInfo represents a single process
type ProcessInfo struct {
	PID     string `json:"pid"`
	User    string `json:"user"`
	Command string `json:"cmd"`
	Args    string `json:"args"`
}

// NetworkState tracks network configuration
type NetworkState struct {
	ListeningPorts []PortInfo `json:"listeningPorts"`
}

// PortInfo represents a listening port
type PortInfo struct {
	Port     string `json:"port"`
	Protocol string `json:"protocol"`
	Process  string `json:"process"`
}

// PackageState tracks installed packages
type PackageState struct {
	Packages []string `json:"packages"`
}

// PermissionsState tracks users and permissions
type PermissionsState struct {
	Users  []string `json:"users"`
	Groups []string `json:"groups"`
}

// Capturer handles baseline capture operations
type Capturer struct {
	execFunc ExecFunc // Function to execute commands in containers
}

// ExecFunc is a function type for executing commands in a container
// Returns stdout, stderr, error
type ExecFunc func(namespace, pod, container string, command []string) (string, string, error)

// NewCapturer creates a new baseline capturer
func NewCapturer(execFunc ExecFunc) *Capturer {
	return &Capturer{
		execFunc: execFunc,
	}
}

// CaptureBaseline captures the full baseline snapshot of a container
func (c *Capturer) CaptureBaseline(namespace, pod, container, podUID string) (*Snapshot, error) {
	snapshot := &Snapshot{
		PodName:    pod,
		PodUID:     podUID,
		Namespace:  namespace,
		Container:  container,
		CapturedAt: time.Now().UTC(),
	}

	var captureErrors []string

	// Capture filesystem state
	fs, err := c.captureFilesystem(namespace, pod, container)
	if err != nil {
		captureErrors = append(captureErrors, fmt.Sprintf("filesystem: %v", err))
	}
	snapshot.Filesystem = fs

	// Capture process state
	ps, err := c.captureProcesses(namespace, pod, container)
	if err != nil {
		captureErrors = append(captureErrors, fmt.Sprintf("processes: %v", err))
	}
	snapshot.Processes = ps

	// Capture network state
	net, err := c.captureNetwork(namespace, pod, container)
	if err != nil {
		captureErrors = append(captureErrors, fmt.Sprintf("network: %v", err))
	}
	snapshot.Network = net

	// Capture package state
	pkg, err := c.capturePackages(namespace, pod, container)
	if err != nil {
		captureErrors = append(captureErrors, fmt.Sprintf("packages: %v", err))
	}
	snapshot.Packages = pkg

	// Capture permissions state
	perm, err := c.capturePermissions(namespace, pod, container)
	if err != nil {
		captureErrors = append(captureErrors, fmt.Sprintf("permissions: %v", err))
	}
	snapshot.Permissions = perm

	// Log any errors but don't fail completely
	if len(captureErrors) > 0 {
		fmt.Printf("[WARN] Partial baseline capture for %s/%s: %s\n", 
			namespace, pod, strings.Join(captureErrors, "; "))
	}

	return snapshot, nil
}

// captureFilesystem captures hashes of executables and config files
func (c *Capturer) captureFilesystem(namespace, pod, container string) (FilesystemState, error) {
	state := FilesystemState{
		ExecutableHashes: make(map[string]string),
		ConfigHashes:     make(map[string]string),
		TmpFiles:         []string{},
	}

	// Capture executable hashes from key directories
	// Using find + sha256sum (works on most containers)
	execDirs := []string{"/bin", "/usr/bin", "/sbin", "/usr/sbin"}
	
	for _, dir := range execDirs {
		cmd := []string{"sh", "-c", fmt.Sprintf(
			"find %s -type f -executable 2>/dev/null | head -100 | xargs -r sha256sum 2>/dev/null || true",
			dir,
		)}
		
		stdout, _, err := c.execFunc(namespace, pod, container, cmd)
		if err != nil {
			continue // Directory might not exist
		}
		
		// Parse sha256sum output: "hash  filename"
		for _, line := range strings.Split(stdout, "\n") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				hash := parts[0]
				path := parts[1]
				state.ExecutableHashes[path] = hash
			}
		}
	}

	// Capture config file hashes
	configFiles := []string{
		"/etc/passwd",
		"/etc/shadow",
		"/etc/group",
		"/etc/hosts",
		"/etc/resolv.conf",
	}
	
	for _, file := range configFiles {
		cmd := []string{"sh", "-c", fmt.Sprintf("sha256sum %s 2>/dev/null || true", file)}
		stdout, _, err := c.execFunc(namespace, pod, container, cmd)
		if err != nil {
			continue
		}
		
		parts := strings.Fields(stdout)
		if len(parts) >= 2 {
			state.ConfigHashes[file] = parts[0]
		}
	}

	// Capture files in /tmp
	cmd := []string{"sh", "-c", "find /tmp -type f 2>/dev/null | head -50 || true"}
	stdout, _, _ := c.execFunc(namespace, pod, container, cmd)
	for _, line := range strings.Split(stdout, "\n") {
		if line = strings.TrimSpace(line); line != "" {
			state.TmpFiles = append(state.TmpFiles, line)
		}
	}

	return state, nil
}

// captureProcesses captures the list of running processes
func (c *Capturer) captureProcesses(namespace, pod, container string) (ProcessState, error) {
	state := ProcessState{
		Processes: []ProcessInfo{},
	}

	// Use ps to get process list (works on most containers)
	cmd := []string{"sh", "-c", "ps aux 2>/dev/null || ps -ef 2>/dev/null || true"}
	stdout, _, err := c.execFunc(namespace, pod, container, cmd)
	if err != nil {
		return state, err
	}

	lines := strings.Split(stdout, "\n")
	for i, line := range lines {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue // Skip header
		}
		
		fields := strings.Fields(line)
		if len(fields) >= 4 {
			proc := ProcessInfo{
				User: fields[0],
				PID:  fields[1],
			}
			
			// Command is usually the last field(s)
			if len(fields) >= 11 {
				proc.Command = fields[10]
				if len(fields) > 11 {
					proc.Args = strings.Join(fields[11:], " ")
				}
			} else {
				proc.Command = fields[len(fields)-1]
			}
			
			state.Processes = append(state.Processes, proc)
		}
	}

	return state, nil
}

// captureNetwork captures listening ports
func (c *Capturer) captureNetwork(namespace, pod, container string) (NetworkState, error) {
	state := NetworkState{
		ListeningPorts: []PortInfo{},
	}

	// Try ss first (modern), fall back to netstat
	cmd := []string{"sh", "-c", "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || true"}
	stdout, _, err := c.execFunc(namespace, pod, container, cmd)
	if err != nil {
		return state, err
	}

	lines := strings.Split(stdout, "\n")
	for _, line := range lines {
		if strings.Contains(line, "LISTEN") {
			fields := strings.Fields(line)
			if len(fields) >= 4 {
				// Extract port from address (e.g., "0.0.0.0:80" or "*:80")
				addr := fields[3]
				if strings.Contains(addr, ":") {
					parts := strings.Split(addr, ":")
					port := parts[len(parts)-1]
					
					info := PortInfo{
						Port:     port,
						Protocol: "tcp",
					}
					
					// Try to get process name if available
					if len(fields) >= 6 {
						info.Process = fields[5]
					}
					
					state.ListeningPorts = append(state.ListeningPorts, info)
				}
			}
		}
	}

	return state, nil
}

// capturePackages captures installed packages
func (c *Capturer) capturePackages(namespace, pod, container string) (PackageState, error) {
	state := PackageState{
		Packages: []string{},
	}

	// Try different package managers
	// Alpine: apk
	// Debian/Ubuntu: dpkg
	// RHEL/CentOS: rpm
	
	cmd := []string{"sh", "-c", `
		if command -v apk >/dev/null 2>&1; then
			apk list --installed 2>/dev/null | cut -d' ' -f1
		elif command -v dpkg >/dev/null 2>&1; then
			dpkg --get-selections 2>/dev/null | awk '{print $1}'
		elif command -v rpm >/dev/null 2>&1; then
			rpm -qa 2>/dev/null
		fi | head -200
	`}
	
	stdout, _, err := c.execFunc(namespace, pod, container, cmd)
	if err != nil {
		return state, err
	}

	for _, line := range strings.Split(stdout, "\n") {
		if pkg := strings.TrimSpace(line); pkg != "" {
			state.Packages = append(state.Packages, pkg)
		}
	}

	sort.Strings(state.Packages)
	return state, nil
}

// capturePermissions captures users and groups
func (c *Capturer) capturePermissions(namespace, pod, container string) (PermissionsState, error) {
	state := PermissionsState{
		Users:  []string{},
		Groups: []string{},
	}

	// Get users from /etc/passwd
	cmd := []string{"sh", "-c", "cat /etc/passwd 2>/dev/null | cut -d: -f1 || true"}
	stdout, _, _ := c.execFunc(namespace, pod, container, cmd)
	for _, line := range strings.Split(stdout, "\n") {
		if user := strings.TrimSpace(line); user != "" {
			state.Users = append(state.Users, user)
		}
	}

	// Get groups from /etc/group
	cmd = []string{"sh", "-c", "cat /etc/group 2>/dev/null | cut -d: -f1 || true"}
	stdout, _, _ = c.execFunc(namespace, pod, container, cmd)
	for _, line := range strings.Split(stdout, "\n") {
		if group := strings.TrimSpace(line); group != "" {
			state.Groups = append(state.Groups, group)
		}
	}

	return state, nil
}

// Hash generates a unique hash for the snapshot (for comparison)
func (s *Snapshot) Hash() string {
	data, _ := json.Marshal(s)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// ToJSON serializes the snapshot to JSON
func (s *Snapshot) ToJSON() ([]byte, error) {
	return json.MarshalIndent(s, "", "  ")
}
