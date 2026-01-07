// =============================================================================
// SENTINEL UI - EVENTS FEED COMPONENT
// =============================================================================
// Displays real-time drift events across all monitored pods.
// Events are sorted by timestamp (newest first).
//
// Data Flow:
// - Source: GET /api/events + WebSocket drift_event messages
// - Hook: useRecentEvents() for initial load
// - Real-time: WebSocket pushes new events as they occur
// =============================================================================

import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  Info,
  XCircle,
  Zap,
  FileText,
  Terminal,
  Network,
  Package,
  Users,
  Clock,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { DriftEvent, DriftCategory, Severity } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface EventsFeedProps {
  /** Array of drift events */
  events: DriftEvent[];
  /** Loading state */
  loading?: boolean;
  /** Refresh callback */
  onRefresh?: () => void;
  /** Click handler for pod name */
  onPodClick?: (podUid: string) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Colors for severity levels */
const SEVERITY_COLORS: Record<Severity, string> = {
  info: '#4a5568',
  low: '#00d4ff',
  medium: '#fbbf24',
  high: '#ff6b6b',
  critical: '#ff4444',
};

/** Icons for severity levels */
const SEVERITY_ICONS: Record<Severity, typeof Info> = {
  info: Info,
  low: AlertCircle,
  medium: AlertTriangle,
  high: AlertTriangle,
  critical: XCircle,
};

/** Colors for drift categories */
const CATEGORY_COLORS: Record<DriftCategory, string> = {
  filesystem: '#00ff9f',
  processes: '#00d4ff',
  network: '#fbbf24',
  packages: '#a78bfa',
  permissions: '#f472b6',
};

/** Icons for drift categories */
const CATEGORY_ICONS: Record<DriftCategory, typeof FileText> = {
  filesystem: FileText,
  processes: Terminal,
  network: Network,
  packages: Package,
  permissions: Users,
};

/** Labels for drift categories */
const CATEGORY_LABELS: Record<DriftCategory, string> = {
  filesystem: 'Filesystem',
  processes: 'Processes',
  network: 'Network',
  packages: 'Packages',
  permissions: 'Permissions',
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format timestamp to relative time
 * 
 * @param timestamp - ISO date string
 * @returns Relative time string (e.g., "2m ago", "1h ago")
 */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 10) return `${seconds}s ago`;
  return 'just now';
}

/**
 * Format timestamp to full date/time
 */
function formatFullTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

// =============================================================================
// SEVERITY BADGE COMPONENT
// =============================================================================

/**
 * SeverityBadge - Displays event severity with icon and color
 */
interface SeverityBadgeProps {
  severity: Severity;
}

const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  const color = SEVERITY_COLORS[severity];
  const Icon = SEVERITY_ICONS[severity];
  
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full uppercase"
      style={{
        backgroundColor: `${color}20`,
        color: color,
      }}
    >
      <Icon className="w-3 h-3" />
      {severity}
    </span>
  );
};

// =============================================================================
// CATEGORY BADGE COMPONENT
// =============================================================================

/**
 * CategoryBadge - Displays drift category with icon
 */
interface CategoryBadgeProps {
  category: DriftCategory;
}

const CategoryBadge: React.FC<CategoryBadgeProps> = ({ category }) => {
  const color = CATEGORY_COLORS[category];
  const Icon = CATEGORY_ICONS[category];
  const label = CATEGORY_LABELS[category];
  
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded"
      style={{
        backgroundColor: `${color}15`,
        color: color,
      }}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
};

// =============================================================================
// EVENT CARD COMPONENT
// =============================================================================

/**
 * EventCard - Single event display card
 * 
 * Shows:
 * - Severity indicator
 * - Category badge
 * - Event description
 * - Pod name (clickable)
 * - Timestamp
 * - Expandable details
 */
interface EventCardProps {
  event: DriftEvent;
  onPodClick?: (podUid: string) => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, onPodClick }) => {
  const [expanded, setExpanded] = useState(false);
  const severityColor = SEVERITY_COLORS[event.severity];
  
  return (
    <div
      className="bg-sentinel-card/50 rounded-lg border border-sentinel-border/50 overflow-hidden hover:border-sentinel-border transition-colors"
      style={{ borderLeftColor: severityColor, borderLeftWidth: '3px' }}
    >
      {/* Main content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Severity icon */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${severityColor}20` }}
          >
            {React.createElement(SEVERITY_ICONS[event.severity], {
              className: 'w-4 h-4',
              style: { color: severityColor },
            })}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <SeverityBadge severity={event.severity} />
              <CategoryBadge category={event.category} />
              
              {/* Pod name - clickable */}
              <button
                onClick={() => onPodClick?.(event.podUID)}
                className="text-xs text-sentinel-accent hover:underline"
              >
                {event.podName}
              </button>
            </div>
            
            {/* Description */}
            <p className="text-sm text-sentinel-text">
              {event.description}
            </p>
            
            {/* Event type */}
            <p className="text-xs text-sentinel-muted mt-1">
              Type: {event.eventType}
            </p>
          </div>
          
          {/* Timestamp and expand */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span
              className="text-xs text-sentinel-muted"
              title={formatFullTime(event.timestamp)}
            >
              {formatRelativeTime(event.timestamp)}
            </span>
            
            {event.details && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-sentinel-muted hover:text-sentinel-text transition-colors flex items-center gap-1"
              >
                {expanded ? (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    Details
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Expandable details */}
      {expanded && event.details && (
        <div className="px-4 pb-4 pt-0">
          <div className="bg-sentinel-bg/50 rounded p-3 text-xs font-mono text-sentinel-muted overflow-x-auto">
            <pre className="whitespace-pre-wrap">{event.details}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// FILTER BAR COMPONENT
// =============================================================================

/**
 * FilterBar - Controls for filtering events
 */
interface FilterBarProps {
  severityFilter: Severity | 'all';
  categoryFilter: DriftCategory | 'all';
  onSeverityChange: (severity: Severity | 'all') => void;
  onCategoryChange: (category: DriftCategory | 'all') => void;
}

const FilterBar: React.FC<FilterBarProps> = ({
  severityFilter,
  categoryFilter,
  onSeverityChange,
  onCategoryChange,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Severity filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-sentinel-muted" />
        <select
          value={severityFilter}
          onChange={(e) => onSeverityChange(e.target.value as Severity | 'all')}
          className="px-2 py-1 text-xs bg-sentinel-bg border border-sentinel-border rounded focus:outline-none focus:border-sentinel-accent/50 text-sentinel-text"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
      </div>
      
      {/* Category filter */}
      <select
        value={categoryFilter}
        onChange={(e) => onCategoryChange(e.target.value as DriftCategory | 'all')}
        className="px-2 py-1 text-xs bg-sentinel-bg border border-sentinel-border rounded focus:outline-none focus:border-sentinel-accent/50 text-sentinel-text"
      >
        <option value="all">All Categories</option>
        <option value="filesystem">Filesystem</option>
        <option value="processes">Processes</option>
        <option value="network">Network</option>
        <option value="packages">Packages</option>
        <option value="permissions">Permissions</option>
      </select>
    </div>
  );
};

// =============================================================================
// EMPTY STATE
// =============================================================================

const EmptyState: React.FC<{ hasFilter: boolean }> = ({ hasFilter }) => (
  <div className="text-center py-12">
    <Activity className="w-12 h-12 mx-auto text-sentinel-muted/30 mb-4" />
    <h3 className="text-lg font-medium text-sentinel-text mb-2">
      {hasFilter ? 'No matching events' : 'No drift events yet'}
    </h3>
    <p className="text-sm text-sentinel-muted max-w-sm mx-auto">
      {hasFilter
        ? 'Try adjusting your filter criteria.'
        : 'Events will appear here as agents detect drift from baseline.'}
    </p>
  </div>
);

// =============================================================================
// LOADING SKELETON
// =============================================================================

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        className="bg-sentinel-card/50 rounded-lg border border-sentinel-border/50 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-sentinel-border/50 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-sentinel-border/50 rounded-full" />
              <div className="h-5 w-20 bg-sentinel-border/50 rounded" />
            </div>
            <div className="h-4 w-3/4 bg-sentinel-border/50 rounded" />
          </div>
          <div className="h-4 w-16 bg-sentinel-border/50 rounded" />
        </div>
      </div>
    ))}
  </div>
);

// =============================================================================
// MAIN EVENTS FEED COMPONENT
// =============================================================================

/**
 * EventsFeed - Main component for displaying drift events
 * 
 * Features:
 * - Filter by severity and category
 * - Expandable event details
 * - Click pod name to view pod details
 * - Real-time updates via WebSocket
 * 
 * Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  DRIFT EVENTS                          [Severity▼] [Category▼] │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  ┌─────────────────────────────────────────────────────────┐   │
 * │  │ ⚠ CRITICAL | Filesystem | web-frontend-x      | 2m ago │   │
 * │  │   New executable file detected: /tmp/backdoor           │   │
 * │  │   Type: file_created                       [Details ▶]  │   │
 * │  └─────────────────────────────────────────────────────────┘   │
 * │  ┌─────────────────────────────────────────────────────────┐   │
 * │  │ ⚠ HIGH | Processes | api-service-y           | 5m ago │   │
 * │  │   Unexpected process started: /usr/bin/curl             │   │
 * │  └─────────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * Data Flow:
 * - Input: events[] from useRecentEvents() hook
 * - Source: GET /api/events endpoint
 * - Real-time: WebSocket drift_event messages add to list
 * - Output: onPodClick(uid) → navigate to pod details
 * 
 * @param events - Array of drift events from API
 * @param loading - Loading state
 * @param onRefresh - Refresh callback
 * @param onPodClick - Callback when pod name is clicked
 */
export const EventsFeed: React.FC<EventsFeedProps> = ({
  events,
  loading = false,
  onRefresh,
  onPodClick,
}) => {
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<DriftCategory | 'all'>('all');

  // ==========================================================================
  // COMPUTED DATA
  // ==========================================================================
  
  const filteredEvents = useMemo(() => {
    let result = [...events];
    
    if (severityFilter !== 'all') {
      result = result.filter((e) => e.severity === severityFilter);
    }
    
    if (categoryFilter !== 'all') {
      result = result.filter((e) => e.category === categoryFilter);
    }
    
    // Sort by timestamp (newest first)
    result.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return result;
  }, [events, severityFilter, categoryFilter]);

  // Stats
  const stats = useMemo(() => {
    const bySeverity = events.reduce((acc, e) => {
      acc[e.severity] = (acc[e.severity] || 0) + 1;
      return acc;
    }, {} as Record<Severity, number>);
    
    return {
      total: events.length,
      critical: bySeverity.critical || 0,
      high: bySeverity.high || 0,
    };
  }, [events]);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <div className="bg-sentinel-card rounded-xl border border-sentinel-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-sentinel-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Title and stats */}
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-sentinel-warning" />
            <h2 className="text-sm font-semibold text-sentinel-text uppercase tracking-wider">
              Drift Events
            </h2>
            <span className="text-xs text-sentinel-muted">
              ({filteredEvents.length} of {stats.total})
            </span>
            
            {/* Critical/High count badges */}
            {stats.critical > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-sentinel-danger/20 text-sentinel-danger">
                {stats.critical} critical
              </span>
            )}
            {stats.high > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-sentinel-warning/20 text-sentinel-warning">
                {stats.high} high
              </span>
            )}
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-3">
            <FilterBar
              severityFilter={severityFilter}
              categoryFilter={categoryFilter}
              onSeverityChange={setSeverityFilter}
              onCategoryChange={setCategoryFilter}
            />
            
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="p-2 text-sentinel-muted hover:text-sentinel-text hover:bg-sentinel-border/50 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh events"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Events list */}
      <div className="p-4 max-h-[600px] overflow-y-auto">
        {loading ? (
          <LoadingSkeleton />
        ) : filteredEvents.length === 0 ? (
          <EmptyState hasFilter={severityFilter !== 'all' || categoryFilter !== 'all'} />
        ) : (
          <div className="space-y-3">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.eventId || event.id}
                event={event}
                onPodClick={onPodClick}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="px-4 py-3 bg-sentinel-bg/30 border-t border-sentinel-border">
        <p className="text-xs text-sentinel-muted">
          💡 Events update in real-time via WebSocket. Click pod name to view details.
        </p>
      </div>
    </div>
  );
};

export default EventsFeed;