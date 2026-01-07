// =============================================================================
// SENTINEL UI - LEADERBOARD COMPONENT
// =============================================================================
// Displays pods ranked by entropy score (worst scores at top).
// Clicking a row triggers pod detail view.
//
// Data Flow:
// - Receives: pods array from App.tsx (via useRealtimePods hook)
// - Source: GET /api/leaderboard + WebSocket real-time updates
// - Output: selectedPodUid when row is clicked
// =============================================================================

import React, { useState, useMemo } from 'react';
import {
  Trophy,
  Medal,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Server,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import type { Pod, PodStatus } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardProps {
  /** Array of pods to display */
  pods: Pod[];
  /** Currently selected pod UID (for highlighting) */
  selectedPodUid: string | null;
  /** Callback when a pod is selected */
  onSelectPod: (uid: string) => void;
  /** Whether data is loading */
  loading?: boolean;
  /** Callback to refresh data */
  onRefresh?: () => void;
}

/** Sort direction */
type SortDirection = 'asc' | 'desc';

/** Sortable columns */
type SortColumn = 'rank' | 'name' | 'score' | 'status' | 'age';

// =============================================================================
// CONSTANTS
// =============================================================================

const STATUS_COLORS: Record<PodStatus, string> = {
  healthy: '#00ff9f',
  good: '#00d4ff',
  warning: '#fbbf24',
  critical: '#ff6b6b',
  compromised: '#ff4444',
};

const STATUS_LABELS: Record<PodStatus, string> = {
  healthy: 'Healthy',
  good: 'Good',
  warning: 'Warning',
  critical: 'Critical',
  compromised: 'Compromised',
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format age from ISO timestamp to human-readable string
 * 
 * @param timestamp - ISO date string
 * @returns Human-readable age (e.g., "2h 15m")
 */
function formatAge(timestamp: string): string {
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/**
 * Get rank icon based on position
 * 
 * @param rank - Position in leaderboard (1 = worst)
 * @returns Icon component or null
 */
function getRankIcon(rank: number): React.ReactNode {
  // Note: rank 1-3 are the WORST pods (lowest scores)
  // So we show warning icons, not trophy icons
  if (rank === 1) {
    return <AlertTriangle className="w-4 h-4 text-sentinel-danger" />;
  }
  if (rank === 2) {
    return <AlertTriangle className="w-4 h-4 text-sentinel-warning" />;
  }
  if (rank === 3) {
    return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  }
  return null;
}

// =============================================================================
// SCORE BADGE COMPONENT
// =============================================================================

/**
 * ScoreBadge - Displays pod score with color coding
 * 
 * @param score - Pod entropy score (0-100)
 * @param status - Pod status for coloring
 */
interface ScoreBadgeProps {
  score: number;
  status: PodStatus;
}

const ScoreBadge: React.FC<ScoreBadgeProps> = ({ score, status }) => {
  const color = STATUS_COLORS[status];
  
  return (
    <span
      className="inline-flex items-center justify-center min-w-[3rem] px-2 py-1 text-sm font-bold rounded tabular-nums"
      style={{
        backgroundColor: `${color}20`,
        color: color,
      }}
    >
      {score}
    </span>
  );
};

// =============================================================================
// STATUS BADGE COMPONENT
// =============================================================================

/**
 * StatusBadge - Displays pod status with icon and label
 * 
 * @param status - Pod health status
 */
interface StatusBadgeProps {
  status: PodStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const color = STATUS_COLORS[status];
  
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full"
      style={{
        backgroundColor: `${color}15`,
        color: color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {STATUS_LABELS[status]}
    </span>
  );
};

// =============================================================================
// TABLE HEADER COMPONENT
// =============================================================================

/**
 * SortableHeader - Clickable column header for sorting
 * 
 * @param column - Column identifier
 * @param label - Display label
 * @param currentSort - Currently sorted column
 * @param direction - Current sort direction
 * @param onSort - Sort callback
 */
interface SortableHeaderProps {
  column: SortColumn;
  label: string;
  currentSort: SortColumn;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  column,
  label,
  currentSort,
  direction,
  onSort,
  className = '',
}) => {
  const isActive = currentSort === column;
  
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium text-sentinel-muted uppercase tracking-wider cursor-pointer hover:text-sentinel-text transition-colors select-none ${className}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {isActive && (
          direction === 'asc' ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )
        )}
      </div>
    </th>
  );
};

// =============================================================================
// EMPTY STATE COMPONENT
// =============================================================================

/**
 * EmptyState - Shown when no pods match filters
 */
const EmptyState: React.FC<{ hasFilter: boolean }> = ({ hasFilter }) => (
  <div className="text-center py-12">
    <Server className="w-12 h-12 mx-auto text-sentinel-muted/30 mb-4" />
    <h3 className="text-lg font-medium text-sentinel-text mb-2">
      {hasFilter ? 'No matching pods' : 'No pods detected'}
    </h3>
    <p className="text-sm text-sentinel-muted max-w-sm mx-auto">
      {hasFilter
        ? 'Try adjusting your search or filter criteria.'
        : 'Pods will appear here once agents start reporting.'}
    </p>
  </div>
);

// =============================================================================
// LOADING SKELETON
// =============================================================================

/**
 * LoadingSkeleton - Placeholder while data loads
 */
const LoadingSkeleton: React.FC = () => (
  <div className="animate-pulse">
    {[1, 2, 3, 4, 5].map((i) => (
      <div
        key={i}
        className="flex items-center gap-4 px-4 py-4 border-b border-sentinel-border/50"
      >
        <div className="w-8 h-8 bg-sentinel-border/50 rounded" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-sentinel-border/50 rounded w-1/3" />
          <div className="h-3 bg-sentinel-border/50 rounded w-1/4" />
        </div>
        <div className="w-12 h-6 bg-sentinel-border/50 rounded" />
        <div className="w-20 h-6 bg-sentinel-border/50 rounded-full" />
      </div>
    ))}
  </div>
);

// =============================================================================
// MAIN LEADERBOARD COMPONENT
// =============================================================================

/**
 * Leaderboard - Main pod ranking component
 * 
 * Features:
 * - Sortable columns (click header to sort)
 * - Search by pod name
 * - Filter by status
 * - Click row to view pod details
 * - Real-time updates via WebSocket
 * 
 * Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  POD LEADERBOARD                              [Search] [Filter] │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  Rank │ Pod Name        │ Score │ Status   │ Age    │ Actions  │
 * ├───────┼─────────────────┼───────┼──────────┼────────┼──────────┤
 * │  ⚠ 1  │ web-frontend-x  │  22   │ Critical │ 2h 15m │ [View]   │
 * │  ⚠ 2  │ api-service-y   │  38   │ Critical │ 5h 42m │ [View]   │
 * │    3  │ worker-job-z    │  54   │ Warning  │ 45m    │ [View]   │
 * │  ...  │ ...             │  ...  │ ...      │ ...    │ ...      │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * Data Flow:
 * - Input: pods[] from useRealtimePods() hook
 * - pods come from: GET /api/leaderboard + WebSocket updates
 * - Output: onSelectPod(uid) → opens PodDetail panel
 * 
 * @param pods - Array of pods from API
 * @param selectedPodUid - Currently selected pod (for highlighting)
 * @param onSelectPod - Callback when pod row is clicked
 * @param loading - Loading state
 * @param onRefresh - Optional refresh callback
 */
export const Leaderboard: React.FC<LeaderboardProps> = ({
  pods,
  selectedPodUid,
  onSelectPod,
  loading = false,
  onRefresh,
}) => {
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  /** Search query for filtering by name */
  const [searchQuery, setSearchQuery] = useState('');
  
  /** Status filter */
  const [statusFilter, setStatusFilter] = useState<PodStatus | 'all'>('all');
  
  /** Sort column */
  const [sortColumn, setSortColumn] = useState<SortColumn>('score');
  
  /** Sort direction */
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // ==========================================================================
  // COMPUTED DATA
  // ==========================================================================
  
  /**
   * Filter and sort pods based on current settings
   */
  const filteredAndSortedPods = useMemo(() => {
    let result = [...pods];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (pod) =>
          pod.name.toLowerCase().includes(query) ||
          pod.namespace.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((pod) => pod.status === statusFilter);
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortColumn) {
        case 'score':
          comparison = a.score - b.score;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'age':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        default:
          comparison = a.score - b.score;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [pods, searchQuery, statusFilter, sortColumn, sortDirection]);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================
  
  /**
   * Handle column sort click
   */
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <div className="bg-sentinel-card rounded-xl border border-sentinel-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-sentinel-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Title */}
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-sentinel-accent" />
            <h2 className="text-sm font-semibold text-sentinel-text uppercase tracking-wider">
              Pod Leaderboard
            </h2>
            <span className="text-xs text-sentinel-muted">
              ({filteredAndSortedPods.length} of {pods.length})
            </span>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sentinel-muted" />
              <input
                type="text"
                placeholder="Search pods..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-sm bg-sentinel-bg border border-sentinel-border rounded-lg focus:outline-none focus:border-sentinel-accent/50 text-sentinel-text placeholder:text-sentinel-muted w-48"
              />
            </div>
            
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PodStatus | 'all')}
              className="px-3 py-1.5 text-sm bg-sentinel-bg border border-sentinel-border rounded-lg focus:outline-none focus:border-sentinel-accent/50 text-sentinel-text"
            >
              <option value="all">All Status</option>
              <option value="healthy">Healthy</option>
              <option value="good">Good</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
              <option value="compromised">Compromised</option>
            </select>
            
            {/* Refresh button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="p-2 text-sentinel-muted hover:text-sentinel-text hover:bg-sentinel-border/50 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <LoadingSkeleton />
      ) : filteredAndSortedPods.length === 0 ? (
        <EmptyState hasFilter={searchQuery !== '' || statusFilter !== 'all'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-sentinel-bg/50">
              <tr>
                <SortableHeader
                  column="rank"
                  label="Rank"
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-16"
                />
                <SortableHeader
                  column="name"
                  label="Pod Name"
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  column="score"
                  label="Score"
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-24"
                />
                <SortableHeader
                  column="status"
                  label="Status"
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-32"
                />
                <SortableHeader
                  column="age"
                  label="Age"
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={handleSort}
                  className="w-24"
                />
                <th className="px-4 py-3 text-left text-xs font-medium text-sentinel-muted uppercase tracking-wider w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sentinel-border/50">
              {filteredAndSortedPods.map((pod, index) => {
                const rank = index + 1;
                const isSelected = pod.uid === selectedPodUid;
                
                return (
                  <tr
                    key={pod.uid}
                    onClick={() => onSelectPod(pod.uid)}
                    className={`
                      cursor-pointer transition-colors
                      ${isSelected
                        ? 'bg-sentinel-accent/10'
                        : 'hover:bg-sentinel-border/30'
                      }
                    `}
                  >
                    {/* Rank */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {getRankIcon(rank)}
                        <span className="text-sm font-medium text-sentinel-text tabular-nums">
                          {rank}
                        </span>
                      </div>
                    </td>
                    
                    {/* Pod name */}
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-sentinel-text truncate max-w-[200px]">
                          {pod.name}
                        </p>
                        <p className="text-xs text-sentinel-muted">
                          {pod.namespace}
                        </p>
                      </div>
                    </td>
                    
                    {/* Score */}
                    <td className="px-4 py-4">
                      <ScoreBadge score={pod.score} status={pod.status} />
                    </td>
                    
                    {/* Status */}
                    <td className="px-4 py-4">
                      <StatusBadge status={pod.status} />
                    </td>
                    
                    {/* Age */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1 text-sm text-sentinel-muted">
                        <Clock className="w-3 h-3" />
                        {formatAge(pod.createdAt)}
                      </div>
                    </td>
                    
                    {/* Actions */}
                    <td className="px-4 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPod(pod.uid);
                        }}
                        className="px-3 py-1 text-xs font-medium text-sentinel-accent bg-sentinel-accent/10 rounded hover:bg-sentinel-accent/20 transition-colors"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Footer */}
      <div className="px-4 py-3 bg-sentinel-bg/30 border-t border-sentinel-border">
        <p className="text-xs text-sentinel-muted">
          💡 Lower scores indicate more drift from baseline. Click a row to view details.
        </p>
      </div>
    </div>
  );
};

export default Leaderboard;