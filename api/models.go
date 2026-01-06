package models

import (
	"time"
)

// Pod represents a monitored pod
type Pod struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	UID         string    `json:"uid"`
	Namespace   string    `json:"namespace"`
	NodeName    string    `json:"nodeName"`
	Status      string    `json:"status"`       // healthy, warning, critical, compromised
	Score       int       `json:"score"`        // 0-100
	LastSeen    time.Time `json:"lastSeen"`
	CreatedAt   time.Time `json:"createdAt"`
	BaselineID  int64     `json:"baselineId,omitempty"`
}

// PodDetail includes pod info plus events and score breakdown
type PodDetail struct {
	Pod
	ScoreBreakdown  ScoreBreakdown `json:"scoreBreakdown"`
	RecentEvents    []DriftEvent   `json:"recentEvents"`
	EventCount      int            `json:"eventCount"`
}

// Baseline represents a captured baseline snapshot
type Baseline struct {
	ID          int64           `json:"id"`
	PodUID      string          `json:"podUID"`
	PodName     string          `json:"podName"`
	Namespace   string          `json:"namespace"`
	Container   string          `json:"container"`
	NodeName    string          `json:"nodeName"`
	CapturedAt  time.Time       `json:"capturedAt"`
	Snapshot    BaselineSnapshot `json:"snapshot"`
}

// BaselineSnapshot is the actual baseline data
type BaselineSnapshot struct {
	Filesystem  FilesystemState  `json:"filesystem"`
	Processes   ProcessState     `json:"processes"`
	Network     NetworkState     `json:"network"`
	Packages    PackageState     `json:"packages"`
	Permissions PermissionsState `json:"permissions"`
}

// FilesystemState tracks executable files and configs
type FilesystemState struct {
	ExecutableHashes map[string]string `json:"executableHashes"`
	ConfigHashes     map[string]string `json:"configHashes"`
	TmpFiles         []string          `json:"tmpFiles"`
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

// DriftEvent represents a detected drift event
type DriftEvent struct {
	ID          int64     `json:"id"`
	EventID     string    `json:"eventId"`
	PodUID      string    `json:"podUID"`
	PodName     string    `json:"podName"`
	Namespace   string    `json:"namespace"`
	Container   string    `json:"container"`
	Timestamp   time.Time `json:"timestamp"`
	Category    string    `json:"category"`    // filesystem, processes, network, packages, permissions
	Severity    string    `json:"severity"`    // info, low, medium, high, critical
	EventType   string    `json:"eventType"`
	Description string    `json:"description"`
	Details     string    `json:"details,omitempty"`
}

// ScoreRecord represents a score update
type ScoreRecord struct {
	ID             int64          `json:"id"`
	PodUID         string         `json:"podUID"`
	PodName        string         `json:"podName"`
	Namespace      string         `json:"namespace"`
	Score          int            `json:"score"`
	Status         string         `json:"status"`
	Timestamp      time.Time      `json:"timestamp"`
	ScoreBreakdown ScoreBreakdown `json:"scoreBreakdown"`
}

// ScoreBreakdown shows the score breakdown by category
type ScoreBreakdown struct {
	FinalScore      int                      `json:"finalScore"`
	CategoryScores  map[string]CategoryScore `json:"categoryScores"`
	TotalPenalty    float64                  `json:"totalPenalty"`
	EventCount      int                      `json:"eventCount"`
	HighestSeverity string                   `json:"highestSeverity"`
}

// CategoryScore shows the score for a single category
type CategoryScore struct {
	RawScore int     `json:"rawScore"`
	Weight   float64 `json:"weight"`
	Penalty  float64 `json:"penalty"`
	Events   int     `json:"events"`
}

// LeaderboardEntry represents a pod in the leaderboard
type LeaderboardEntry struct {
	Rank      int       `json:"rank"`
	PodName   string    `json:"podName"`
	Namespace string    `json:"namespace"`
	Score     int       `json:"score"`
	Status    string    `json:"status"`
	Age       string    `json:"age"`
	LastSeen  time.Time `json:"lastSeen"`
}

// PurgeConfig represents the purge controller configuration
type PurgeConfig struct {
	AutoPurgeEnabled bool   `json:"autoPurgeEnabled"`
	PurgeSpeed       string `json:"purgeSpeed"` // off, conservative, moderate, aggressive
	Threshold        int    `json:"threshold"`
	GracePeriod      int    `json:"gracePeriod"` // seconds
}

// ClusterStats represents overall cluster health stats
type ClusterStats struct {
	TotalPods     int     `json:"totalPods"`
	HealthyPods   int     `json:"healthyPods"`
	WarningPods   int     `json:"warningPods"`
	CriticalPods  int     `json:"criticalPods"`
	AverageScore  float64 `json:"averageScore"`
	PurgedToday   int     `json:"purgedToday"`
}

// AgentHeartbeat represents an agent health check
type AgentHeartbeat struct {
	NodeName  string    `json:"nodeName"`
	Timestamp time.Time `json:"timestamp"`
	Status    string    `json:"status"`
}

// WebSocketMessage is the message format for WebSocket updates
type WebSocketMessage struct {
	Type    string      `json:"type"` // score_update, drift_event, pod_added, pod_removed
	Payload interface{} `json:"payload"`
}

// ScoreUpdate is sent via WebSocket when a score changes
type ScoreUpdate struct {
	PodUID    string    `json:"podUID"`
	PodName   string    `json:"podName"`
	Namespace string    `json:"namespace"`
	Score     int       `json:"score"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
}

// API Request/Response types

// BaselineRequest is sent by agents when capturing a baseline
type BaselineRequest struct {
	PodName    string           `json:"podName"`
	PodUID     string           `json:"podUID"`
	Namespace  string           `json:"namespace"`
	Container  string           `json:"container"`
	NodeName   string           `json:"nodeName"`
	CapturedAt time.Time        `json:"capturedAt"`
	Snapshot   BaselineSnapshot `json:"snapshot"`
}

// DriftRequest is sent by agents when drift is detected
type DriftRequest struct {
	PodName     string         `json:"podName"`
	PodUID      string         `json:"podUID"`
	Namespace   string         `json:"namespace"`
	Container   string         `json:"container"`
	NodeName    string         `json:"nodeName"`
	ScannedAt   time.Time      `json:"scannedAt"`
	Score       int            `json:"score"`
	Status      string         `json:"status"`
	ScoreResult ScoreBreakdown `json:"scoreResult"`
	Events      []DriftEvent   `json:"events"`
	TotalEvents int            `json:"totalEvents"`
}

// ScoreRequest is sent by agents for periodic score updates
type ScoreRequest struct {
	PodName     string         `json:"podName"`
	PodUID      string         `json:"podUID"`
	Namespace   string         `json:"namespace"`
	Container   string         `json:"container"`
	NodeName    string         `json:"nodeName"`
	Timestamp   time.Time      `json:"timestamp"`
	Score       int            `json:"score"`
	Status      string         `json:"status"`
	ScoreResult ScoreBreakdown `json:"scoreResult"`
}

// PodRemovedRequest is sent when a pod is deleted
type PodRemovedRequest struct {
	PodName   string    `json:"podName"`
	PodUID    string    `json:"podUID"`
	Namespace string    `json:"namespace"`
	NodeName  string    `json:"nodeName"`
	RemovedAt time.Time `json:"removedAt"`
}

// APIResponse is a generic API response
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}
