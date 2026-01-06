package monitor

import (
	"fmt"
	"time"

	"github.com/sentinel/agent/pkg/baseline"
)

// DriftEvent represents a detected change from baseline
type DriftEvent struct {
	ID          string    `json:"id"`
	PodName     string    `json:"podName"`
	PodUID      string    `json:"podUID"`
	Namespace   string    `json:"namespace"`
	Container   string    `json:"container"`
	Timestamp   time.Time `json:"timestamp"`
	Category    Category  `json:"category"`
	Severity    Severity  `json:"severity"`
	EventType   string    `json:"eventType"`
	Description string    `json:"description"`
	Details     string    `json:"details,omitempty"`
}

// Category represents the entropy category
type Category string

const (
	CategoryFilesystem  Category = "filesystem"
	CategoryProcesses   Category = "processes"
	CategoryNetwork     Category = "network"
	CategoryPackages    Category = "packages"
	CategoryPermissions Category = "permissions"
)

// Severity represents event severity level
type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityLow      Severity = "low"
	SeverityMedium   Severity = "medium"
	SeverityHigh     Severity = "high"
	SeverityCritical Severity = "critical"
)

// DriftReport contains all drift events from a scan
type DriftReport struct {
	PodName     string       `json:"podName"`
	PodUID      string       `json:"podUID"`
	Namespace   string       `json:"namespace"`
	Container   string       `json:"container"`
	ScannedAt   time.Time    `json:"scannedAt"`
	BaselineAt  time.Time    `json:"baselineAt"`
	Events      []DriftEvent `json:"events"`
	TotalEvents int          `json:"totalEvents"`
}

// Monitor handles drift detection
type Monitor struct {
	eventCounter int
}

// NewMonitor creates a new drift monitor
func NewMonitor() *Monitor {
	return &Monitor{
		eventCounter: 0,
	}
}

// Compare compares current snapshot against baseline and returns drift events
func (m *Monitor) Compare(base, current *baseline.Snapshot) *DriftReport {
	report := &DriftReport{
		PodName:    current.PodName,
		PodUID:     current.PodUID,
		Namespace:  current.Namespace,
		Container:  current.Container,
		ScannedAt:  current.CapturedAt,
		BaselineAt: base.CapturedAt,
		Events:     []DriftEvent{},
	}

	// Compare filesystem
	m.compareFilesystem(base, current, report)

	// Compare processes
	m.compareProcesses(base, current, report)

	// Compare network
	m.compareNetwork(base, current, report)

	// Compare packages
	m.comparePackages(base, current, report)

	// Compare permissions
	m.comparePermissions(base, current, report)

	report.TotalEvents = len(report.Events)
	return report
}

// compareFilesystem detects filesystem drift
func (m *Monitor) compareFilesystem(base, current *baseline.Snapshot, report *DriftReport) {
	// Check for new executables
	for path, hash := range current.Filesystem.ExecutableHashes {
		baseHash, exists := base.Filesystem.ExecutableHashes[path]
		if !exists {
			// New executable file
			severity := SeverityHigh
			eventType := "new_executable"
			
			// Critical if in sensitive directories
			if isSensitivePath(path) {
				severity = SeverityCritical
				eventType = "new_system_binary"
			}
			
			report.Events = append(report.Events, m.createEvent(
				current, CategoryFilesystem, severity, eventType,
				fmt.Sprintf("New executable file: %s", path),
				fmt.Sprintf("hash: %s", hash),
			))
		} else if baseHash != hash {
			// Modified executable
			severity := SeverityCritical
			report.Events = append(report.Events, m.createEvent(
				current, CategoryFilesystem, severity, "modified_system_binary",
				fmt.Sprintf("Modified executable: %s", path),
				fmt.Sprintf("old_hash: %s, new_hash: %s", baseHash, hash),
			))
		}
	}

	// Check for modified config files
	for path, hash := range current.Filesystem.ConfigHashes {
		baseHash, exists := base.Filesystem.ConfigHashes[path]
		if exists && baseHash != hash {
			severity := SeverityMedium
			if path == "/etc/passwd" || path == "/etc/shadow" {
				severity = SeverityHigh
			}
			report.Events = append(report.Events, m.createEvent(
				current, CategoryFilesystem, severity, "config_modified",
				fmt.Sprintf("Config file modified: %s", path),
				fmt.Sprintf("old_hash: %s, new_hash: %s", baseHash, hash),
			))
		}
	}

	// Check for new files in /tmp (potential malware staging)
	baseTmpFiles := make(map[string]bool)
	for _, f := range base.Filesystem.TmpFiles {
		baseTmpFiles[f] = true
	}
	
	for _, f := range current.Filesystem.TmpFiles {
		if !baseTmpFiles[f] {
			severity := SeverityMedium
			// Higher severity for executable-looking files
			if isExecutableName(f) {
				severity = SeverityHigh
			}
			report.Events = append(report.Events, m.createEvent(
				current, CategoryFilesystem, severity, "new_tmp_file",
				fmt.Sprintf("New file in /tmp: %s", f),
				"",
			))
		}
	}
}

// compareProcesses detects process drift
func (m *Monitor) compareProcesses(base, current *baseline.Snapshot, report *DriftReport) {
	// Build map of baseline processes by command
	baseProcs := make(map[string]bool)
	for _, p := range base.Processes.Processes {
		key := p.Command
		baseProcs[key] = true
	}

	// Check for new processes
	for _, p := range current.Processes.Processes {
		key := p.Command
		if !baseProcs[key] {
			severity := SeverityMedium
			eventType := "new_process"
			
			// Check for suspicious processes
			if isSuspiciousProcess(p.Command) {
				severity = SeverityCritical
				eventType = "suspicious_process"
			} else if isCryptoMiner(p.Command, p.Args) {
				severity = SeverityCritical
				eventType = "crypto_mining_signature"
			}
			
			report.Events = append(report.Events, m.createEvent(
				current, CategoryProcesses, severity, eventType,
				fmt.Sprintf("New process: %s", p.Command),
				fmt.Sprintf("pid: %s, user: %s, args: %s", p.PID, p.User, p.Args),
			))
		}
	}
}

// compareNetwork detects network drift
func (m *Monitor) compareNetwork(base, current *baseline.Snapshot, report *DriftReport) {
	// Build map of baseline ports
	basePorts := make(map[string]bool)
	for _, p := range base.Network.ListeningPorts {
		basePorts[p.Port] = true
	}

	// Check for new listening ports
	for _, p := range current.Network.ListeningPorts {
		if !basePorts[p.Port] {
			severity := SeverityMedium
			eventType := "new_listening_port"
			
			// Common attack ports
			if isSuspiciousPort(p.Port) {
				severity = SeverityHigh
			}
			
			report.Events = append(report.Events, m.createEvent(
				current, CategoryNetwork, severity, eventType,
				fmt.Sprintf("New listening port: %s/%s", p.Port, p.Protocol),
				fmt.Sprintf("process: %s", p.Process),
			))
		}
	}
}

// comparePackages detects package drift
func (m *Monitor) comparePackages(base, current *baseline.Snapshot, report *DriftReport) {
	// Build map of baseline packages
	basePkgs := make(map[string]bool)
	for _, p := range base.Packages.Packages {
		basePkgs[p] = true
	}

	// Check for new packages
	for _, p := range current.Packages.Packages {
		if !basePkgs[p] {
			report.Events = append(report.Events, m.createEvent(
				current, CategoryPackages, SeverityMedium, "new_package",
				fmt.Sprintf("New package installed: %s", p),
				"",
			))
		}
	}
}

// comparePermissions detects permission/user drift
func (m *Monitor) comparePermissions(base, current *baseline.Snapshot, report *DriftReport) {
	// Build maps of baseline users and groups
	baseUsers := make(map[string]bool)
	for _, u := range base.Permissions.Users {
		baseUsers[u] = true
	}
	
	baseGroups := make(map[string]bool)
	for _, g := range base.Permissions.Groups {
		baseGroups[g] = true
	}

	// Check for new users
	for _, u := range current.Permissions.Users {
		if !baseUsers[u] {
			report.Events = append(report.Events, m.createEvent(
				current, CategoryPermissions, SeverityCritical, "new_user",
				fmt.Sprintf("New user created: %s", u),
				"",
			))
		}
	}

	// Check for new groups
	for _, g := range current.Permissions.Groups {
		if !baseGroups[g] {
			report.Events = append(report.Events, m.createEvent(
				current, CategoryPermissions, SeverityHigh, "new_group",
				fmt.Sprintf("New group created: %s", g),
				"",
			))
		}
	}
}

// createEvent creates a drift event with proper ID
func (m *Monitor) createEvent(snap *baseline.Snapshot, category Category, severity Severity, eventType, description, details string) DriftEvent {
	m.eventCounter++
	return DriftEvent{
		ID:          fmt.Sprintf("%s-%d-%d", snap.PodUID, time.Now().UnixNano(), m.eventCounter),
		PodName:     snap.PodName,
		PodUID:      snap.PodUID,
		Namespace:   snap.Namespace,
		Container:   snap.Container,
		Timestamp:   time.Now().UTC(),
		Category:    category,
		Severity:    severity,
		EventType:   eventType,
		Description: description,
		Details:     details,
	}
}

// Helper functions

func isSensitivePath(path string) bool {
	sensitiveDirs := []string{"/bin/", "/sbin/", "/usr/bin/", "/usr/sbin/"}
	for _, dir := range sensitiveDirs {
		if len(path) >= len(dir) && path[:len(dir)] == dir {
			return true
		}
	}
	return false
}

func isExecutableName(path string) bool {
	suspiciousExtensions := []string{".sh", ".py", ".pl", ".rb", ".elf"}
	for _, ext := range suspiciousExtensions {
		if len(path) >= len(ext) && path[len(path)-len(ext):] == ext {
			return true
		}
	}
	return false
}

func isSuspiciousProcess(cmd string) bool {
	suspicious := []string{
		"nc", "netcat", "ncat",      // Network tools often used for shells
		"wget", "curl",               // Download tools (after baseline)
		"chmod", "chown",             // Permission changes
		"useradd", "adduser",         // User creation
		"/tmp/",                      // Execution from /tmp
	}
	for _, s := range suspicious {
		if cmd == s || (len(cmd) > len(s) && cmd[:len(s)] == s) {
			return true
		}
	}
	return false
}

func isCryptoMiner(cmd, args string) bool {
	minerSignatures := []string{
		"xmrig", "minerd", "minergate",
		"stratum+tcp", "pool.minexmr",
		"cryptonight", "randomx",
	}
	combined := cmd + " " + args
	for _, sig := range minerSignatures {
		if containsIgnoreCase(combined, sig) {
			return true
		}
	}
	return false
}

func isSuspiciousPort(port string) bool {
	// Common ports used in attacks
	suspiciousPorts := []string{
		"4444", "4445", "5555", "6666", "6667", // Common reverse shell ports
		"1337", "31337",                         // "Elite" ports
		"3389",                                   // RDP
	}
	for _, p := range suspiciousPorts {
		if port == p {
			return true
		}
	}
	return false
}

func containsIgnoreCase(s, substr string) bool {
	s = toLowerCase(s)
	substr = toLowerCase(substr)
	return contains(s, substr)
}

func toLowerCase(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			result[i] = c + 32
		} else {
			result[i] = c
		}
	}
	return string(result)
}

func contains(s, substr string) bool {
	if len(substr) > len(s) {
		return false
	}
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
