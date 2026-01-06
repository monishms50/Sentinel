// =============================================================================
// SENTINEL UI - TypeScript Type Definitions
// =============================================================================

// ============================================================================
// API RESPONSE
// ============================================================================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ============================================================================
// POD TYPES
// ============================================================================

export type PodStatus = 'healthy' | 'good' | 'warning' | 'critical' | 'compromised';

export interface Pod {
  uid: string;
  name: string;
  namespace: string;
  nodeName?: string;
  status: PodStatus;
  score: number;
  createdAt: string;
  lastSeen: string;
  eventCount?: number;
}

export interface PodDetail extends Pod {
  scoreBreakdown?: ScoreBreakdown;
  recentEvents?: DriftEvent[];
  baseline?: Baseline;
}

export interface ScoreBreakdown {
  categoryScores: Record<DriftCategory, CategoryScore>;
  totalPenalty: number;
  finalScore: number;
}

export interface CategoryScore {
  rawScore: number;
  weight: number;
  cappedScore: number;
}

// ============================================================================
// DRIFT EVENT TYPES
// ============================================================================

export type DriftCategory = 'filesystem' | 'processes' | 'network' | 'packages' | 'permissions';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface DriftEvent {
  eventId: string;
  podUID: string;
  podName: string;
  namespace: string;
  container?: string;
  timestamp: string;
  category: DriftCategory;
  severity: Severity;
  eventType: string;
  description: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// BASELINE TYPES
// ============================================================================

export interface Baseline {
  podUID: string;
  podName: string;
  namespace: string;
  container: string;
  nodeName?: string;
  capturedAt: string;
  snapshot: BaselineSnapshot;
}

export interface BaselineSnapshot {
  filesystem: FilesystemState;
  processes: ProcessState;
  network: NetworkState;
  packages: PackageState;
  permissions: PermissionsState;
}

export interface FilesystemState {
  executableHashes: Record<string, string>;
  configHashes: Record<string, string>;
  tmpFiles: string[];
}

export interface ProcessState {
  processes: ProcessInfo[];
}

export interface ProcessInfo {
  pid: number;
  user: string;
  command: string;
  args?: string[];
}

export interface NetworkState {
  listeningPorts: PortInfo[];
}

export interface PortInfo {
  port: number;
  protocol: string;
  process?: string;
}

export interface PackageState {
  packages: string[];
}

export interface PermissionsState {
  users: string[];
  groups: string[];
}

// ============================================================================
// LEADERBOARD TYPES
// ============================================================================

export interface LeaderboardEntry {
  rank: number;
  pod: Pod;
  trend?: 'up' | 'down' | 'stable';
  change?: number;
}

// ============================================================================
// CLUSTER STATS TYPES
// ============================================================================

export interface ClusterStats {
  totalPods: number;
  healthyPods: number;
  warningPods: number;
  criticalPods: number;
  averageScore: number;
  totalEvents: number;
  recentEvents: number;
}

// ============================================================================
// CONFIG TYPES
// ============================================================================

export type PurgeSpeed = 'off' | 'conservative' | 'moderate' | 'aggressive';

export interface PurgeConfig {
  autoPurgeEnabled: boolean;
  purgeSpeed: PurgeSpeed;
  thresholdConservative?: number;
  thresholdModerate?: number;
  thresholdAggressive?: number;
  gracePeriodConservative?: number;
  gracePeriodModerate?: number;
  gracePeriodAggressive?: number;
}

// ============================================================================
// SCORE HISTORY TYPES
// ============================================================================

export interface ScoreHistoryPoint {
  timestamp: string;
  score: number;
  status: PodStatus;
  breakdown?: ScoreBreakdown;
}

// ============================================================================
// WEBSOCKET MESSAGE TYPES
// ============================================================================

export interface WSMessage {
  type: 'score_update' | 'drift_event' | 'pod_added' | 'pod_removed' | 'ping' | 'pong';
  payload?: unknown;
}

export interface ScoreUpdatePayload {
  podUID: string;
  podName: string;
  namespace: string;
  score: number;
  status: PodStatus;
  timestamp: string;
}

export interface PodEventPayload {
  podUID: string;
  podName: string;
  namespace: string;
  timestamp: string;
}
