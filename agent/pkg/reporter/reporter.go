package reporter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/monishms50/Sentinel/agent/pkg/baseline"
	"github.com/monishms50/Sentinel/agent/pkg/monitor"
	"github.com/monishms50/Sentinel/agent/pkg/scoring"
)

// Reporter handles communication with the Sentinel API
type Reporter struct {
	apiEndpoint string
	httpClient  *http.Client
	nodeName    string
}

// NewReporter creates a new API reporter
func NewReporter(apiEndpoint, nodeName string) *Reporter {
	return &Reporter{
		apiEndpoint: apiEndpoint,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		nodeName: nodeName,
	}
}

// PodReport is the full report sent to the API
type PodReport struct {
	PodName     string                 `json:"podName"`
	PodUID      string                 `json:"podUID"`
	Namespace   string                 `json:"namespace"`
	Container   string                 `json:"container"`
	NodeName    string                 `json:"nodeName"`
	Timestamp   time.Time              `json:"timestamp"`
	Score       int                    `json:"score"`
	Status      string                 `json:"status"`
	ScoreResult scoring.ScoreResult    `json:"scoreResult"`
	DriftReport *monitor.DriftReport   `json:"driftReport,omitempty"`
	Baseline    *baseline.Snapshot     `json:"baseline,omitempty"`
}

// ReportBaseline sends a new baseline to the API
func (r *Reporter) ReportBaseline(snap *baseline.Snapshot) error {
	payload := BaselinePayload{
		PodName:    snap.PodName,
		PodUID:     snap.PodUID,
		Namespace:  snap.Namespace,
		Container:  snap.Container,
		NodeName:   r.nodeName,
		CapturedAt: snap.CapturedAt,
		Snapshot:   snap,
	}

	return r.post("/api/baselines", payload)
}

// BaselinePayload is sent when a new baseline is captured
type BaselinePayload struct {
	PodName    string             `json:"podName"`
	PodUID     string             `json:"podUID"`
	Namespace  string             `json:"namespace"`
	Container  string             `json:"container"`
	NodeName   string             `json:"nodeName"`
	CapturedAt time.Time          `json:"capturedAt"`
	Snapshot   *baseline.Snapshot `json:"snapshot"`
}

// ReportDrift sends drift events and score to the API
func (r *Reporter) ReportDrift(report *monitor.DriftReport, scoreResult scoring.ScoreResult) error {
	payload := DriftPayload{
		PodName:     report.PodName,
		PodUID:      report.PodUID,
		Namespace:   report.Namespace,
		Container:   report.Container,
		NodeName:    r.nodeName,
		ScannedAt:   report.ScannedAt,
		Score:       scoreResult.FinalScore,
		Status:      scoring.GetStatus(scoreResult.FinalScore),
		ScoreResult: scoreResult,
		Events:      report.Events,
		TotalEvents: report.TotalEvents,
	}

	return r.post("/api/drift", payload)
}

// DriftPayload is sent when drift is detected
type DriftPayload struct {
	PodName     string               `json:"podName"`
	PodUID      string               `json:"podUID"`
	Namespace   string               `json:"namespace"`
	Container   string               `json:"container"`
	NodeName    string               `json:"nodeName"`
	ScannedAt   time.Time            `json:"scannedAt"`
	Score       int                  `json:"score"`
	Status      string               `json:"status"`
	ScoreResult scoring.ScoreResult  `json:"scoreResult"`
	Events      []monitor.DriftEvent `json:"events"`
	TotalEvents int                  `json:"totalEvents"`
}

// ReportScore sends just the current score (heartbeat)
func (r *Reporter) ReportScore(podName, podUID, namespace, container string, scoreResult scoring.ScoreResult) error {
	payload := ScorePayload{
		PodName:     podName,
		PodUID:      podUID,
		Namespace:   namespace,
		Container:   container,
		NodeName:    r.nodeName,
		Timestamp:   time.Now().UTC(),
		Score:       scoreResult.FinalScore,
		Status:      scoring.GetStatus(scoreResult.FinalScore),
		ScoreResult: scoreResult,
	}

	return r.post("/api/scores", payload)
}

// ScorePayload is the periodic score update
type ScorePayload struct {
	PodName     string              `json:"podName"`
	PodUID      string              `json:"podUID"`
	Namespace   string              `json:"namespace"`
	Container   string              `json:"container"`
	NodeName    string              `json:"nodeName"`
	Timestamp   time.Time           `json:"timestamp"`
	Score       int                 `json:"score"`
	Status      string              `json:"status"`
	ScoreResult scoring.ScoreResult `json:"scoreResult"`
}

// ReportPodRemoved notifies the API that a pod was removed
func (r *Reporter) ReportPodRemoved(podName, podUID, namespace string) error {
	payload := PodRemovedPayload{
		PodName:   podName,
		PodUID:    podUID,
		Namespace: namespace,
		NodeName:  r.nodeName,
		RemovedAt: time.Now().UTC(),
	}

	return r.post("/api/pods/removed", payload)
}

// PodRemovedPayload is sent when a pod is deleted
type PodRemovedPayload struct {
	PodName   string    `json:"podName"`
	PodUID    string    `json:"podUID"`
	Namespace string    `json:"namespace"`
	NodeName  string    `json:"nodeName"`
	RemovedAt time.Time `json:"removedAt"`
}

// Heartbeat sends a heartbeat to the API
func (r *Reporter) Heartbeat() error {
	payload := HeartbeatPayload{
		NodeName:  r.nodeName,
		Timestamp: time.Now().UTC(),
		Status:    "healthy",
	}

	return r.post("/api/agents/heartbeat", payload)
}

// HeartbeatPayload is the agent heartbeat
type HeartbeatPayload struct {
	NodeName  string    `json:"nodeName"`
	Timestamp time.Time `json:"timestamp"`
	Status    string    `json:"status"`
}

// post sends a POST request to the API
func (r *Reporter) post(path string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	url := r.apiEndpoint + path
	req, err := http.NewRequest("POST", url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-Node", r.nodeName)

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request to %s: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// FetchConfig fetches configuration from the API
func (r *Reporter) FetchConfig() (*AgentConfig, error) {
	url := r.apiEndpoint + "/api/config"
	
	resp, err := r.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch config: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("config fetch failed with status %d", resp.StatusCode)
	}

	var config AgentConfig
	if err := json.NewDecoder(resp.Body).Decode(&config); err != nil {
		return nil, fmt.Errorf("failed to decode config: %w", err)
	}

	return &config, nil
}

// AgentConfig is configuration received from the API
type AgentConfig struct {
	ScanInterval         int                     `json:"scanInterval"`
	MonitoredNamespaces  []string                `json:"monitoredNamespaces"`
	Weights              scoring.CategoryWeights `json:"weights"`
	SeverityPoints       scoring.SeverityPoints  `json:"severityPoints"`
}

// HealthCheck checks if the API is reachable
func (r *Reporter) HealthCheck() error {
	url := r.apiEndpoint + "/health"
	
	resp, err := r.httpClient.Get(url)
	if err != nil {
		return fmt.Errorf("API health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API unhealthy, status: %d", resp.StatusCode)
	}

	return nil
}
