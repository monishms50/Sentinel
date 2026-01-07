// =============================================================================
// SENTINEL UI - TYPE DEFINITIONS
// =============================================================================
// This file defines all TypeScript interfaces used throughout the UI.
// These types mirror the Go backend models (api/models.go) to ensure
// type safety between frontend and backend.
// =============================================================================

// =============================================================================
// POD STATUS TYPES
// =============================================================================

/**
 * PodStatus represents the health status of a pod based on its entropy score.
 * 
 * Status thresholds (from Go backend):
 * - healthy:     score >= 90
 * - good:        score >= 70
 * - warning:     score >= 50
 * - critical:    score >= 30
 * - compromised: score < 30
 */
export type PodStatus = 'healthy' | 'good' | 'warning' | 'critical' | 'compromised';

/**
 * DriftCategory represents the categories of drift events monitored by agents.
 * Each category has a configurable weight in the scoring algorithm.
 * 
 * Categories:
 * - filesystem:   Changes to files, configs, executables
 * - processes:    New or modified processes
 * - network:      New listening ports or connections
 * - packages:     Installed/removed packages
 * - permissions:  User/group changes
 */
export type DriftCategory = 'filesystem' | 'processes' | 'network' | 'packages' | 'permissions';

/**
 * Severity levels for drift events.
 * Higher severity = more points deducted from score.
 */
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * PurgeSpeed controls how aggressively the controller purges pods.
 * Configured via the PurgeConfig panel.
 */
export type PurgeSpeed = 'off' | 'conservative' | 'moderate' | 'aggressive';

// =============================================================================
// POD MODELS
// =============================================================================

/**
 * Pod represents a monitored Kubernetes pod.
 * 
 * Data source: GET /api/pods or WebSocket updates
 * Used by: Leaderboard, PodManager, PodDetail
 */
export interface Pod {
  /** Database ID */
  id: number;
  /** Pod name from Kubernetes */
  name: string;
  /** Kubernetes UID - unique identifier */
  uid: string;
  /** Kubernetes namespace */
  namespace: string;
  /** Node where pod is running */
  nodeName: string;
  /** Current health status based on score */
  status: PodStatus;
  /** Entropy score (0-100, higher is better) */
  score: number;
  /** Last time agent reported on this pod */
  lastSeen: string;
  /** When pod was first detected */
  createdAt: string;
  /** ID of associated baseline snapshot */
  baselineId?: number;
}

/**
 * PodDetail extends Pod with additional information.
 * Includes score breakdown and recent drift events.
 * 
 * Data source: GET /api/pods/:id
 * Used by: PodDetail component
 */
export interface PodDetail extends Pod {
  /** Breakdown of score by category */
  scoreBreakdown: ScoreBreakdown;
  /** Most recent drift events for this pod */
  recentEvents: DriftEvent[];
  /** Total number of drift events */
  eventCount: number;
}

// =============================================================================
// SCORING MODELS
// =============================================================================

/**
 * ScoreBreakdown shows how the final score was calculated.
 * Each category contributes to the total penalty based on its weight.
 * 
 * Formula: finalScore = 100 - totalPenalty
 */
export interface ScoreBreakdown {
  /** Final calculated score (0-100) */
  finalScore: number;
  /** Score breakdown per category */
  categoryScores: Record<DriftCategory, CategoryScore>;
  /** Sum of all category penalties */
  totalPenalty: number;
  /** Total number of drift events counted */
  eventCount: number;
  /** Highest severity event detected */
  highestSeverity: Severity;
}

/**
 * CategoryScore shows the score contribution for a single category.
 * 
 * Calculation:
 * - rawScore = 100 - (events * severityPoints)
 * - penalty = (100 - rawScore) * weight
 */
export interface CategoryScore {
  /** Raw score before weight applied (0-100) */
  rawScore: number;
  /** Weight factor for this category (0.0-1.0) */
  weight: number;
  /** Penalty contribution to total */
  penalty: number;
  /** Number of events in this category */
  events: number;
}

/**
 * ScoreHistoryPoint represents a single point in score history.
 * Used to render score trend charts.
 * 
 * Data source: GET /api/pods/:id/history
 * Used by: ScoreChart component
 */
export interface ScoreHistoryPoint {
  /** When this score was recorded */
  timestamp: string;
  /** Score at this time */
  score: number;
  /** Status at this time */
  status: PodStatus;
}

// =============================================================================
// LEADERBOARD
// =============================================================================

/**
 * LeaderboardEntry represents a pod in the leaderboard ranking.
 * Sorted by score (ascending - worst scores first).
 * 
 * Data source: GET /api/leaderboard
 * Used by: Leaderboard component
 */
export interface LeaderboardEntry {
  /** Position in leaderboard (1 = worst) */
  rank: number;
  /** Pod name */
  podName: string;
  /** Kubernetes namespace */
  namespace: string;
  /** Current score */
  score: number;
  /** Current status */
  status: PodStatus;
  /** Human-readable age (e.g., "2h 15m") */
  age: string;
  /** Last activity timestamp */
  lastSeen: string;
}

// =============================================================================
// BASELINE & DRIFT EVENTS
// =============================================================================

/**
 * Baseline represents the initial snapshot of a pod's state.
 * Captured when agent first detects a pod.
 * 
 * Data source: GET /api/pods/:id/baseline
 * Used by: PodDetail (baseline tab)
 */
export interface Baseline {
  id: number;
  podUID: string;
  podName: string;
  namespace: string;
  container: string;
  nodeName: string;
  capturedAt: string;
  snapshot: BaselineSnapshot;
}

/**
 * BaselineSnapshot contains the actual baseline data.
 * Categories match the drift detection categories.
 */
export interface BaselineSnapshot {
  filesystem: FilesystemState;
  processes: ProcessState;
  network: NetworkState;
  packages: PackageState;
  permissions: PermissionsState;
}

/** Filesystem baseline state */
export interface FilesystemState {
  executableHashes: Record<string, string>;
  configHashes: Record<string, string>;
  tmpFiles: string[];
}

/** Process baseline state */
export interface ProcessState {
  processes: ProcessInfo[];
}

export interface ProcessInfo {
  pid: string;
  user: string;
  command: string;
  args?: string;
}

/** Network baseline state */
export interface NetworkState {
  listeningPorts: PortInfo[];
}

export interface PortInfo {
  port: string;
  protocol: string;
  process?: string;
}

/** Package baseline state */
export interface PackageState {
  packages: string[];
}

/** Permissions baseline state */
export interface PermissionsState {
  users: string[];
  groups: string[];
}

/**
 * DriftEvent represents a detected deviation from baseline.
 * 
 * Data source: GET /api/events or GET /api/pods/:id/events
 * Used by: EventsFeed, PodDetail (events tab)
 */
export interface DriftEvent {
  /** Database ID */
  id: number;
  /** Unique event identifier */
  eventId: string;
  /** Pod this event belongs to */
  podUID: string;
  podName: string;
  namespace: string;
  container: string;
  /** When drift was detected */
  timestamp: string;
  /** Category of drift */
  category: DriftCategory;
  /** Severity level */
  severity: Severity;
  /** Type of event (e.g., "file_created", "process_started") */
  eventType: string;
  /** Human-readable description */
  description: string;
  /** Additional details (JSON string) */
  details?: string;
}

// =============================================================================
// CLUSTER STATS
// =============================================================================

/**
 * ClusterStats represents overall cluster health metrics.
 * Displayed in ClusterHealth component.
 * 
 * Data source: GET /api/stats
 * Used by: ClusterHealth, Header
 */
export interface ClusterStats {
  /** Total number of monitored pods */
  totalPods: number;
  /** Pods with score >= 70 */
  healthyPods: number;
  /** Pods with score 50-69 */
  warningPods: number;
  /** Pods with score < 50 */
  criticalPods: number;
  /** Average score across all pods */
  averageScore: number;
  /** Number of pods purged today */
  purgedToday: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * PurgeConfig controls the automatic purge behavior.
 * 
 * Data source: GET/PUT /api/config
 * Used by: PurgeConfig component
 */
export interface PurgeConfig {
  /** Whether auto-purge is enabled */
  autoPurgeEnabled: boolean;
  /** Purge aggressiveness level */
  purgeSpeed: PurgeSpeed;
  /** Score threshold for purging */
  threshold: number;
  /** Grace period in seconds before purging */
  gracePeriod: number;
}

// =============================================================================
// API RESPONSE WRAPPER
// =============================================================================

/**
 * APIResponse is the standard wrapper for all API responses.
 * Backend always returns this structure.
 */
export interface APIResponse<T = unknown> {
  /** Whether request succeeded */
  success: boolean;
  /** Optional success message */
  message?: string;
  /** Response data (on success) */
  data?: T;
  /** Error message (on failure) */
  error?: string;
}

// =============================================================================
// WEBSOCKET MESSAGES
// =============================================================================

/**
 * WSMessage is the structure of WebSocket messages.
 * 
 * Message types:
 * - score_update: Pod score changed
 * - drift_event:  New drift event detected
 * - pod_added:    New pod being monitored
 * - pod_removed:  Pod removed from monitoring
 */
export interface WSMessage<T = unknown> {
  type: 'score_update' | 'drift_event' | 'pod_added' | 'pod_removed' | 'pong' | 'subscribed';
  payload?: T;
}

/**
 * Payload for score_update WebSocket messages.
 */
export interface ScoreUpdatePayload {
  podUID: string;
  podName: string;
  namespace: string;
  score: number;
  status: PodStatus;
  timestamp: string;
}

/**
 * Payload for pod_added/pod_removed WebSocket messages.
 */
export interface PodEventPayload {
  podUID: string;
  podName: string;
  namespace: string;
  timestamp: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Color mapping for pod statuses.
 * Used for consistent styling across components.
 */
export const STATUS_COLORS: Record<PodStatus, string> = {
  healthy: '#00ff9f',
  good: '#00d4ff',
  warning: '#fbbf24',
  critical: '#ff6b6b',
  compromised: '#ff4444',
};

/**
 * Get color for a score value.
 */
export function getScoreColor(score: number): string {
  if (score >= 90) return STATUS_COLORS.healthy;
  if (score >= 70) return STATUS_COLORS.good;
  if (score >= 50) return STATUS_COLORS.warning;
  if (score >= 30) return STATUS_COLORS.critical;
  return STATUS_COLORS.compromised;
}

/**
 * Get status from score value.
 */
export function getStatusFromScore(score: number): PodStatus {
  if (score >= 90) return 'healthy';
  if (score >= 70) return 'good';
  if (score >= 50) return 'warning';
  if (score >= 30) return 'critical';
  return 'compromised';
}