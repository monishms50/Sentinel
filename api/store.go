package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/sentinel/api/models"
)

// Store handles all database operations
type Store struct {
	db *sql.DB
	mu sync.RWMutex
}

// NewStore creates a new SQLite store
func NewStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &Store{db: db}
	if err := store.initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}

	return store, nil
}

// initialize creates the database schema
func (s *Store) initialize() error {
	schema := `
	-- Pods table
	CREATE TABLE IF NOT EXISTS pods (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		uid TEXT UNIQUE NOT NULL,
		namespace TEXT NOT NULL,
		node_name TEXT,
		status TEXT DEFAULT 'healthy',
		score INTEGER DEFAULT 100,
		last_seen TIMESTAMP,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_pods_uid ON pods(uid);
	CREATE INDEX IF NOT EXISTS idx_pods_namespace ON pods(namespace);
	CREATE INDEX IF NOT EXISTS idx_pods_score ON pods(score);

	-- Baselines table
	CREATE TABLE IF NOT EXISTS baselines (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		pod_uid TEXT NOT NULL,
		pod_name TEXT NOT NULL,
		namespace TEXT NOT NULL,
		container TEXT NOT NULL,
		node_name TEXT,
		captured_at TIMESTAMP,
		snapshot TEXT,
		FOREIGN KEY (pod_uid) REFERENCES pods(uid)
	);
	CREATE INDEX IF NOT EXISTS idx_baselines_pod_uid ON baselines(pod_uid);

	-- Drift events table
	CREATE TABLE IF NOT EXISTS drift_events (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		event_id TEXT UNIQUE,
		pod_uid TEXT NOT NULL,
		pod_name TEXT NOT NULL,
		namespace TEXT NOT NULL,
		container TEXT,
		timestamp TIMESTAMP,
		category TEXT,
		severity TEXT,
		event_type TEXT,
		description TEXT,
		details TEXT,
		FOREIGN KEY (pod_uid) REFERENCES pods(uid)
	);
	CREATE INDEX IF NOT EXISTS idx_drift_events_pod_uid ON drift_events(pod_uid);
	CREATE INDEX IF NOT EXISTS idx_drift_events_timestamp ON drift_events(timestamp);
	CREATE INDEX IF NOT EXISTS idx_drift_events_severity ON drift_events(severity);

	-- Score history table
	CREATE TABLE IF NOT EXISTS score_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		pod_uid TEXT NOT NULL,
		pod_name TEXT NOT NULL,
		namespace TEXT NOT NULL,
		score INTEGER,
		status TEXT,
		timestamp TIMESTAMP,
		breakdown TEXT,
		FOREIGN KEY (pod_uid) REFERENCES pods(uid)
	);
	CREATE INDEX IF NOT EXISTS idx_score_history_pod_uid ON score_history(pod_uid);
	CREATE INDEX IF NOT EXISTS idx_score_history_timestamp ON score_history(timestamp);

	-- Purge log table
	CREATE TABLE IF NOT EXISTS purge_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		pod_uid TEXT NOT NULL,
		pod_name TEXT NOT NULL,
		namespace TEXT NOT NULL,
		purged_at TIMESTAMP,
		reason TEXT,
		final_score INTEGER
	);

	-- Configuration table
	CREATE TABLE IF NOT EXISTS config (
		key TEXT PRIMARY KEY,
		value TEXT
	);

	-- Agent heartbeats table
	CREATE TABLE IF NOT EXISTS agent_heartbeats (
		node_name TEXT PRIMARY KEY,
		last_heartbeat TIMESTAMP,
		status TEXT
	);
	`

	_, err := s.db.Exec(schema)
	return err
}

// Close closes the database connection
func (s *Store) Close() error {
	return s.db.Close()
}

// ============ Pod Operations ============

// UpsertPod creates or updates a pod
func (s *Store) UpsertPod(pod *models.Pod) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	query := `
		INSERT INTO pods (name, uid, namespace, node_name, status, score, last_seen, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(uid) DO UPDATE SET
			name = excluded.name,
			node_name = excluded.node_name,
			status = excluded.status,
			score = excluded.score,
			last_seen = excluded.last_seen
	`
	_, err := s.db.Exec(query,
		pod.Name, pod.UID, pod.Namespace, pod.NodeName,
		pod.Status, pod.Score, pod.LastSeen, pod.CreatedAt)
	return err
}

// GetPod retrieves a pod by UID
func (s *Store) GetPod(uid string) (*models.Pod, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT id, name, uid, namespace, node_name, status, score, last_seen, created_at
			  FROM pods WHERE uid = ?`
	
	pod := &models.Pod{}
	err := s.db.QueryRow(query, uid).Scan(
		&pod.ID, &pod.Name, &pod.UID, &pod.Namespace, &pod.NodeName,
		&pod.Status, &pod.Score, &pod.LastSeen, &pod.CreatedAt)
	
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return pod, err
}

// GetPodByName retrieves a pod by name and namespace
func (s *Store) GetPodByName(namespace, name string) (*models.Pod, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT id, name, uid, namespace, node_name, status, score, last_seen, created_at
			  FROM pods WHERE namespace = ? AND name = ?`
	
	pod := &models.Pod{}
	err := s.db.QueryRow(query, namespace, name).Scan(
		&pod.ID, &pod.Name, &pod.UID, &pod.Namespace, &pod.NodeName,
		&pod.Status, &pod.Score, &pod.LastSeen, &pod.CreatedAt)
	
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return pod, err
}

// ListPods returns all pods
func (s *Store) ListPods() ([]models.Pod, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT id, name, uid, namespace, node_name, status, score, last_seen, created_at
			  FROM pods ORDER BY score ASC`
	
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pods []models.Pod
	for rows.Next() {
		var pod models.Pod
		err := rows.Scan(&pod.ID, &pod.Name, &pod.UID, &pod.Namespace, &pod.NodeName,
			&pod.Status, &pod.Score, &pod.LastSeen, &pod.CreatedAt)
		if err != nil {
			return nil, err
		}
		pods = append(pods, pod)
	}
	return pods, nil
}

// ListPodsByNamespace returns pods in a namespace
func (s *Store) ListPodsByNamespace(namespace string) ([]models.Pod, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT id, name, uid, namespace, node_name, status, score, last_seen, created_at
			  FROM pods WHERE namespace = ? ORDER BY score ASC`
	
	rows, err := s.db.Query(query, namespace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pods []models.Pod
	for rows.Next() {
		var pod models.Pod
		err := rows.Scan(&pod.ID, &pod.Name, &pod.UID, &pod.Namespace, &pod.NodeName,
			&pod.Status, &pod.Score, &pod.LastSeen, &pod.CreatedAt)
		if err != nil {
			return nil, err
		}
		pods = append(pods, pod)
	}
	return pods, nil
}

// UpdatePodScore updates a pod's score and status
func (s *Store) UpdatePodScore(uid string, score int, status string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	query := `UPDATE pods SET score = ?, status = ?, last_seen = ? WHERE uid = ?`
	_, err := s.db.Exec(query, score, status, time.Now(), uid)
	return err
}

// DeletePod removes a pod
func (s *Store) DeletePod(uid string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`DELETE FROM pods WHERE uid = ?`, uid)
	return err
}

// ============ Baseline Operations ============

// SaveBaseline saves a new baseline
func (s *Store) SaveBaseline(baseline *models.Baseline) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	snapshotJSON, err := json.Marshal(baseline.Snapshot)
	if err != nil {
		return fmt.Errorf("failed to marshal snapshot: %w", err)
	}

	// Delete old baseline for this pod
	_, err = s.db.Exec(`DELETE FROM baselines WHERE pod_uid = ?`, baseline.PodUID)
	if err != nil {
		return err
	}

	query := `INSERT INTO baselines (pod_uid, pod_name, namespace, container, node_name, captured_at, snapshot)
			  VALUES (?, ?, ?, ?, ?, ?, ?)`
	_, err = s.db.Exec(query,
		baseline.PodUID, baseline.PodName, baseline.Namespace, baseline.Container,
		baseline.NodeName, baseline.CapturedAt, string(snapshotJSON))
	return err
}

// GetBaseline retrieves the baseline for a pod
func (s *Store) GetBaseline(podUID string) (*models.Baseline, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT id, pod_uid, pod_name, namespace, container, node_name, captured_at, snapshot
			  FROM baselines WHERE pod_uid = ?`
	
	var baseline models.Baseline
	var snapshotJSON string
	
	err := s.db.QueryRow(query, podUID).Scan(
		&baseline.ID, &baseline.PodUID, &baseline.PodName, &baseline.Namespace,
		&baseline.Container, &baseline.NodeName, &baseline.CapturedAt, &snapshotJSON)
	
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal([]byte(snapshotJSON), &baseline.Snapshot); err != nil {
		return nil, fmt.Errorf("failed to unmarshal snapshot: %w", err)
	}

	return &baseline, nil
}

// ============ Drift Event Operations ============

// SaveDriftEvent saves a drift event
func (s *Store) SaveDriftEvent(event *models.DriftEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	query := `INSERT OR IGNORE INTO drift_events 
			  (event_id, pod_uid, pod_name, namespace, container, timestamp, category, severity, event_type, description, details)
			  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_, err := s.db.Exec(query,
		event.EventID, event.PodUID, event.PodName, event.Namespace, event.Container,
		event.Timestamp, event.Category, event.Severity, event.EventType,
		event.Description, event.Details)
	return err
}

// SaveDriftEvents saves multiple drift events
func (s *Store) SaveDriftEvents(events []models.DriftEvent) error {
	for _, event := range events {
		if err := s.SaveDriftEvent(&event); err != nil {
			return err
		}
	}
	return nil
}

// GetDriftEvents retrieves drift events for a pod
func (s *Store) GetDriftEvents(podUID string, limit int) ([]models.DriftEvent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT id, event_id, pod_uid, pod_name, namespace, container, timestamp, 
			  category, severity, event_type, description, details
			  FROM drift_events WHERE pod_uid = ? ORDER BY timestamp DESC LIMIT ?`
	
	rows, err := s.db.Query(query, podUID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.DriftEvent
	for rows.Next() {
		var event models.DriftEvent
		err := rows.Scan(&event.ID, &event.EventID, &event.PodUID, &event.PodName,
			&event.Namespace, &event.Container, &event.Timestamp, &event.Category,
			&event.Severity, &event.EventType, &event.Description, &event.Details)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

// GetRecentDriftEvents retrieves recent drift events across all pods
func (s *Store) GetRecentDriftEvents(limit int) ([]models.DriftEvent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT id, event_id, pod_uid, pod_name, namespace, container, timestamp, 
			  category, severity, event_type, description, details
			  FROM drift_events ORDER BY timestamp DESC LIMIT ?`
	
	rows, err := s.db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []models.DriftEvent
	for rows.Next() {
		var event models.DriftEvent
		err := rows.Scan(&event.ID, &event.EventID, &event.PodUID, &event.PodName,
			&event.Namespace, &event.Container, &event.Timestamp, &event.Category,
			&event.Severity, &event.EventType, &event.Description, &event.Details)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

// CountDriftEvents counts events for a pod
func (s *Store) CountDriftEvents(podUID string) (int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM drift_events WHERE pod_uid = ?`, podUID).Scan(&count)
	return count, err
}

// ============ Score History Operations ============

// SaveScoreRecord saves a score record
func (s *Store) SaveScoreRecord(record *models.ScoreRecord) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	breakdownJSON, err := json.Marshal(record.ScoreBreakdown)
	if err != nil {
		return fmt.Errorf("failed to marshal breakdown: %w", err)
	}

	query := `INSERT INTO score_history (pod_uid, pod_name, namespace, score, status, timestamp, breakdown)
			  VALUES (?, ?, ?, ?, ?, ?, ?)`
	_, err = s.db.Exec(query,
		record.PodUID, record.PodName, record.Namespace, record.Score,
		record.Status, record.Timestamp, string(breakdownJSON))
	return err
}

// GetScoreHistory retrieves score history for a pod
func (s *Store) GetScoreHistory(podUID string, limit int) ([]models.ScoreRecord, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT id, pod_uid, pod_name, namespace, score, status, timestamp, breakdown
			  FROM score_history WHERE pod_uid = ? ORDER BY timestamp DESC LIMIT ?`
	
	rows, err := s.db.Query(query, podUID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []models.ScoreRecord
	for rows.Next() {
		var record models.ScoreRecord
		var breakdownJSON string
		err := rows.Scan(&record.ID, &record.PodUID, &record.PodName, &record.Namespace,
			&record.Score, &record.Status, &record.Timestamp, &breakdownJSON)
		if err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(breakdownJSON), &record.ScoreBreakdown)
		records = append(records, record)
	}
	return records, nil
}

// ============ Leaderboard Operations ============

// GetLeaderboard returns pods sorted by score
func (s *Store) GetLeaderboard(limit int) ([]models.LeaderboardEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT name, namespace, score, status, last_seen, created_at
			  FROM pods ORDER BY score ASC LIMIT ?`
	
	rows, err := s.db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.LeaderboardEntry
	rank := 1
	for rows.Next() {
		var entry models.LeaderboardEntry
		var createdAt time.Time
		err := rows.Scan(&entry.PodName, &entry.Namespace, &entry.Score,
			&entry.Status, &entry.LastSeen, &createdAt)
		if err != nil {
			return nil, err
		}
		entry.Rank = rank
		entry.Age = formatAge(createdAt)
		entries = append(entries, entry)
		rank++
	}
	return entries, nil
}

// ============ Stats Operations ============

// GetClusterStats returns cluster-wide statistics
func (s *Store) GetClusterStats() (*models.ClusterStats, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := &models.ClusterStats{}

	// Total pods
	s.db.QueryRow(`SELECT COUNT(*) FROM pods`).Scan(&stats.TotalPods)

	// Pods by status
	s.db.QueryRow(`SELECT COUNT(*) FROM pods WHERE score >= 90`).Scan(&stats.HealthyPods)
	s.db.QueryRow(`SELECT COUNT(*) FROM pods WHERE score >= 50 AND score < 90`).Scan(&stats.WarningPods)
	s.db.QueryRow(`SELECT COUNT(*) FROM pods WHERE score < 50`).Scan(&stats.CriticalPods)

	// Average score
	s.db.QueryRow(`SELECT COALESCE(AVG(score), 100) FROM pods`).Scan(&stats.AverageScore)

	// Purged today
	today := time.Now().Truncate(24 * time.Hour)
	s.db.QueryRow(`SELECT COUNT(*) FROM purge_log WHERE purged_at >= ?`, today).Scan(&stats.PurgedToday)

	return stats, nil
}

// ============ Config Operations ============

// GetConfig retrieves a config value
func (s *Store) GetConfig(key string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var value string
	err := s.db.QueryRow(`SELECT value FROM config WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

// SetConfig saves a config value
func (s *Store) SetConfig(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	query := `INSERT INTO config (key, value) VALUES (?, ?)
			  ON CONFLICT(key) DO UPDATE SET value = excluded.value`
	_, err := s.db.Exec(query, key, value)
	return err
}

// GetPurgeConfig retrieves the purge configuration
func (s *Store) GetPurgeConfig() (*models.PurgeConfig, error) {
	config := &models.PurgeConfig{
		AutoPurgeEnabled: true,
		PurgeSpeed:       "moderate",
		Threshold:        40,
		GracePeriod:      60,
	}

	if val, _ := s.GetConfig("auto_purge_enabled"); val == "false" {
		config.AutoPurgeEnabled = false
	}
	if val, _ := s.GetConfig("purge_speed"); val != "" {
		config.PurgeSpeed = val
	}
	// Set threshold based on speed
	switch config.PurgeSpeed {
	case "conservative":
		config.Threshold = 30
		config.GracePeriod = 300
	case "moderate":
		config.Threshold = 40
		config.GracePeriod = 60
	case "aggressive":
		config.Threshold = 50
		config.GracePeriod = 0
	}

	return config, nil
}

// SavePurgeConfig saves the purge configuration
func (s *Store) SavePurgeConfig(config *models.PurgeConfig) error {
	if err := s.SetConfig("auto_purge_enabled", fmt.Sprintf("%t", config.AutoPurgeEnabled)); err != nil {
		return err
	}
	if err := s.SetConfig("purge_speed", config.PurgeSpeed); err != nil {
		return err
	}
	return nil
}

// ============ Agent Heartbeat Operations ============

// SaveAgentHeartbeat saves an agent heartbeat
func (s *Store) SaveAgentHeartbeat(nodeName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	query := `INSERT INTO agent_heartbeats (node_name, last_heartbeat, status) VALUES (?, ?, 'healthy')
			  ON CONFLICT(node_name) DO UPDATE SET last_heartbeat = excluded.last_heartbeat, status = 'healthy'`
	_, err := s.db.Exec(query, nodeName, time.Now())
	return err
}

// ============ Purge Log Operations ============

// LogPurge logs a pod purge
func (s *Store) LogPurge(podUID, podName, namespace, reason string, finalScore int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	query := `INSERT INTO purge_log (pod_uid, pod_name, namespace, purged_at, reason, final_score)
			  VALUES (?, ?, ?, ?, ?, ?)`
	_, err := s.db.Exec(query, podUID, podName, namespace, time.Now(), reason, finalScore)
	return err
}

// ============ Cleanup Operations ============

// CleanupOldData removes old data based on retention settings
func (s *Store) CleanupOldData(retentionHours int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-time.Duration(retentionHours) * time.Hour)

	// Delete old drift events
	_, err := s.db.Exec(`DELETE FROM drift_events WHERE timestamp < ?`, cutoff)
	if err != nil {
		return err
	}

	// Delete old score history
	_, err = s.db.Exec(`DELETE FROM score_history WHERE timestamp < ?`, cutoff)
	return err
}

// Helper functions

func formatAge(t time.Time) string {
	d := time.Since(t)
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh %dm", int(d.Hours()), int(d.Minutes())%60)
	}
	return fmt.Sprintf("%dd %dh", int(d.Hours()/24), int(d.Hours())%24)
}
