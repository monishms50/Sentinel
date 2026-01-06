package reconciler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/sentinel/controller/pkg/purger"
)

// PurgeSpeed defines the aggressiveness of auto-purge
type PurgeSpeed string

const (
	PurgeSpeedOff          PurgeSpeed = "off"
	PurgeSpeedConservative PurgeSpeed = "conservative"
	PurgeSpeedModerate     PurgeSpeed = "moderate"
	PurgeSpeedAggressive   PurgeSpeed = "aggressive"
)

// Config holds the reconciler configuration
type Config struct {
	AutoPurgeEnabled bool       `json:"autoPurgeEnabled"`
	PurgeSpeed       PurgeSpeed `json:"purgeSpeed"`
	Threshold        int        `json:"threshold"`
	GracePeriod      int        `json:"gracePeriod"` // seconds
}

// DefaultConfigs for each purge speed
var DefaultConfigs = map[PurgeSpeed]Config{
	PurgeSpeedOff: {
		AutoPurgeEnabled: false,
		PurgeSpeed:       PurgeSpeedOff,
		Threshold:        0,
		GracePeriod:      0,
	},
	PurgeSpeedConservative: {
		AutoPurgeEnabled: true,
		PurgeSpeed:       PurgeSpeedConservative,
		Threshold:        30,
		GracePeriod:      300, // 5 minutes
	},
	PurgeSpeedModerate: {
		AutoPurgeEnabled: true,
		PurgeSpeed:       PurgeSpeedModerate,
		Threshold:        40,
		GracePeriod:      60, // 1 minute
	},
	PurgeSpeedAggressive: {
		AutoPurgeEnabled: true,
		PurgeSpeed:       PurgeSpeedAggressive,
		Threshold:        50,
		GracePeriod:      0, // immediate
	},
}

// PodScore represents a pod's score from the API
type PodScore struct {
	Name      string    `json:"name"`
	UID       string    `json:"uid"`
	Namespace string    `json:"namespace"`
	Score     int       `json:"score"`
	Status    string    `json:"status"`
	LastSeen  time.Time `json:"lastSeen"`
}

// PendingPurge tracks pods that are pending purge (in grace period)
type PendingPurge struct {
	Pod         PodScore
	DetectedAt  time.Time
	PurgeAfter  time.Time
	ScoreAtTime int
}

// Reconciler watches pod scores and triggers purges
type Reconciler struct {
	purger        *purger.Purger
	apiEndpoint   string
	config        Config
	pendingPurges map[string]*PendingPurge // key: podUID
	purgeHistory  map[string]time.Time     // key: podUID, value: last purge time
	mu            sync.RWMutex
	httpClient    *http.Client
}

// NewReconciler creates a new reconciler
func NewReconciler(purger *purger.Purger, apiEndpoint string) *Reconciler {
	return &Reconciler{
		purger:        purger,
		apiEndpoint:   apiEndpoint,
		config:        DefaultConfigs[PurgeSpeedModerate],
		pendingPurges: make(map[string]*PendingPurge),
		purgeHistory:  make(map[string]time.Time),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SetConfig updates the reconciler configuration
func (r *Reconciler) SetConfig(config Config) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.config = config
	fmt.Printf("⚙️  Config updated: speed=%s, threshold=%d, grace=%ds, enabled=%t\n",
		config.PurgeSpeed, config.Threshold, config.GracePeriod, config.AutoPurgeEnabled)
}

// GetConfig returns the current configuration
func (r *Reconciler) GetConfig() Config {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.config
}

// FetchConfig fetches configuration from the API
func (r *Reconciler) FetchConfig(ctx context.Context) error {
	url := fmt.Sprintf("%s/api/config", r.apiEndpoint)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var result struct {
		Success bool   `json:"success"`
		Data    Config `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	if result.Success {
		r.SetConfig(result.Data)
	}

	return nil
}

// FetchPodScores fetches all pod scores from the API
func (r *Reconciler) FetchPodScores(ctx context.Context) ([]PodScore, error) {
	url := fmt.Sprintf("%s/api/pods", r.apiEndpoint)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var result struct {
		Success bool       `json:"success"`
		Data    []PodScore `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result.Data, nil
}

// Reconcile performs one reconciliation loop
func (r *Reconciler) Reconcile(ctx context.Context) error {
	r.mu.RLock()
	config := r.config
	r.mu.RUnlock()

	// If auto-purge is disabled, do nothing
	if !config.AutoPurgeEnabled || config.PurgeSpeed == PurgeSpeedOff {
		return nil
	}

	// Fetch current pod scores
	pods, err := r.FetchPodScores(ctx)
	if err != nil {
		return fmt.Errorf("failed to fetch pod scores: %w", err)
	}

	now := time.Now()

	for _, pod := range pods {
		// Check if score is below threshold
		if pod.Score < config.Threshold {
			r.handleLowScorePod(ctx, pod, config, now)
		} else {
			// Score recovered - remove from pending purges
			r.mu.Lock()
			if pending, exists := r.pendingPurges[pod.UID]; exists {
				fmt.Printf("✅ Pod %s/%s score recovered (%d → %d), canceling purge\n",
					pod.Namespace, pod.Name, pending.ScoreAtTime, pod.Score)
				delete(r.pendingPurges, pod.UID)
			}
			r.mu.Unlock()
		}
	}

	// Process pending purges that have passed their grace period
	r.processPendingPurges(ctx, now)

	return nil
}

// handleLowScorePod handles a pod with a score below threshold
func (r *Reconciler) handleLowScorePod(ctx context.Context, pod PodScore, config Config, now time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Check if already pending
	if pending, exists := r.pendingPurges[pod.UID]; exists {
		// Update the score if it got worse
		if pod.Score < pending.ScoreAtTime {
			pending.ScoreAtTime = pod.Score
		}
		return
	}

	// Check if recently purged (prevent purge loops)
	if lastPurge, exists := r.purgeHistory[pod.UID]; exists {
		if now.Sub(lastPurge) < 5*time.Minute {
			return // Don't purge same pod within 5 minutes
		}
	}

	// Add to pending purges
	purgeAfter := now.Add(time.Duration(config.GracePeriod) * time.Second)
	
	r.pendingPurges[pod.UID] = &PendingPurge{
		Pod:         pod,
		DetectedAt:  now,
		PurgeAfter:  purgeAfter,
		ScoreAtTime: pod.Score,
	}

	if config.GracePeriod > 0 {
		fmt.Printf("⚠️  Pod %s/%s score %d < %d, scheduled for purge in %ds\n",
			pod.Namespace, pod.Name, pod.Score, config.Threshold, config.GracePeriod)
	} else {
		fmt.Printf("⚠️  Pod %s/%s score %d < %d, immediate purge\n",
			pod.Namespace, pod.Name, pod.Score, config.Threshold)
	}
}

// processPendingPurges processes pods that have passed their grace period
func (r *Reconciler) processPendingPurges(ctx context.Context, now time.Time) {
	r.mu.Lock()
	// Collect pods to purge
	var toPurge []*PendingPurge
	for uid, pending := range r.pendingPurges {
		if now.After(pending.PurgeAfter) {
			toPurge = append(toPurge, pending)
			delete(r.pendingPurges, uid)
		}
	}
	r.mu.Unlock()

	// Purge pods outside the lock
	for _, pending := range toPurge {
		// Re-check score before purging (it might have recovered)
		currentScore, err := r.getCurrentScore(ctx, pending.Pod.UID)
		if err != nil {
			fmt.Printf("⚠️  Could not verify score for %s/%s, proceeding with purge\n",
				pending.Pod.Namespace, pending.Pod.Name)
		} else if currentScore >= r.config.Threshold {
			fmt.Printf("✅ Pod %s/%s score recovered to %d, skipping purge\n",
				pending.Pod.Namespace, pending.Pod.Name, currentScore)
			continue
		}

		// Execute purge
		reason := fmt.Sprintf("Score %d below threshold %d", pending.ScoreAtTime, r.config.Threshold)
		result := r.purger.PurgePod(ctx, pending.Pod.Namespace, pending.Pod.Name, reason, pending.ScoreAtTime)

		if result.Success {
			// Record in purge history
			r.mu.Lock()
			r.purgeHistory[pending.Pod.UID] = now
			r.mu.Unlock()

			// Notify API
			r.notifyPurge(ctx, result)
		} else {
			fmt.Printf("❌ Failed to purge %s/%s: %v\n",
				pending.Pod.Namespace, pending.Pod.Name, result.Error)
		}
	}
}

// getCurrentScore fetches the current score for a pod
func (r *Reconciler) getCurrentScore(ctx context.Context, podUID string) (int, error) {
	pods, err := r.FetchPodScores(ctx)
	if err != nil {
		return 0, err
	}

	for _, pod := range pods {
		if pod.UID == podUID {
			return pod.Score, nil
		}
	}

	return 0, fmt.Errorf("pod not found")
}

// notifyPurge notifies the API about a purge
func (r *Reconciler) notifyPurge(ctx context.Context, result *purger.PurgeResult) {
	// The API will be notified when the pod deletion is detected by the agent
	// This is just for logging/metrics
	fmt.Printf("📊 Purge recorded: %s/%s (score: %d, reason: %s)\n",
		result.Namespace, result.PodName, result.Score, result.Reason)
}

// GetPendingPurges returns the list of pods pending purge
func (r *Reconciler) GetPendingPurges() []PendingPurge {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]PendingPurge, 0, len(r.pendingPurges))
	for _, p := range r.pendingPurges {
		result = append(result, *p)
	}
	return result
}

// GetStats returns reconciler statistics
func (r *Reconciler) GetStats() map[string]interface{} {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return map[string]interface{}{
		"pendingPurges":   len(r.pendingPurges),
		"totalPurges":     len(r.purgeHistory),
		"config":          r.config,
		"autoPurgeActive": r.config.AutoPurgeEnabled && r.config.PurgeSpeed != PurgeSpeedOff,
	}
}

// ClearHistory clears the purge history (useful for testing)
func (r *Reconciler) ClearHistory() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.purgeHistory = make(map[string]time.Time)
	r.pendingPurges = make(map[string]*PendingPurge)
}
