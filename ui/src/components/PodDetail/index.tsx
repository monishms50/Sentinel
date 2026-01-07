// =============================================================================
// SENTINEL UI - POD DETAIL COMPONENT
// =============================================================================
// Displays detailed information for a selected pod.
// Shows: Score breakdown, recent events, baseline info, score history chart.
//
// Data Flow:
// - Receives: podUid from Leaderboard selection
// - Fetches: GET /api/pods/:id for detail
// - Fetches: GET /api/pods/:id/baseline for baseline
// - Fetches: GET /api/pods/:id/history for score chart
// =============================================================================

import React, { useState } from 'react';
import {
  X,
  Shield,
  Activity,
  Clock,
  Server,
  AlertTriangle,
  FileText,
  Terminal,
  Network,
  Package,
  Users,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Eye,
} from 'lucide-react';
import {
  usePodDetail,
  usePodBaseline,
  usePodHistory,
  usePodActions,
} from '../../hooks';
import { ScoreChart } from '../Charts';
import type {
  PodDetail as PodDetailType,
  DriftCategory,
  Severity,
  Baseline,
  DriftEvent,
  PodStatus,
} from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PodDetailProps {
  /** UID of pod to display */
  podUid: string;
  /** Close callback */
  onClose: () => void;
}

type TabId = 'overview' | 'events' | 'baseline';

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

const CATEGORY_ICONS: Record<DriftCategory, typeof FileText> = {
  filesystem: FileText,
  processes: Terminal,
  network: Network,
  packages: Package,
  permissions: Users,
};

const CATEGORY_LABELS: Record<DriftCategory, string> = {
  filesystem: 'Filesystem',
  processes: 'Processes',
  network: 'Network',
  packages: 'Packages',
  permissions: 'Permissions',
};

const SEVERITY_COLORS: Record<Severity, string> = {
  info: '#4a5568',
  low: '#00d4ff',
  medium: '#fbbf24',
  high: '#ff6b6b',
  critical: '#ff4444',
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format age from ISO timestamp
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
 * Get color for score value
 */
function getScoreColor(score: number): string {
  if (score >= 90) return STATUS_COLORS.healthy;
  if (score >= 70) return STATUS_COLORS.good;
  if (score >= 50) return STATUS_COLORS.warning;
  if (score >= 30) return STATUS_COLORS.critical;
  return STATUS_COLORS.compromised;
}

// =============================================================================
// SCORE RING COMPONENT
// =============================================================================

/**
 * ScoreRing - Large circular score display
 */
interface ScoreRingProps {
  score: number;
  status: PodStatus;
}

const ScoreRing: React.FC<ScoreRingProps> = ({ score, status }) => {
  const color = STATUS_COLORS[status];
  const circumference = 2 * Math.PI * 54;
  const progress = (score / 100) * circumference;
  
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
        {/* Background */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="#1f2937"
          strokeWidth="8"
        />
        {/* Progress */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-xs text-sentinel-muted uppercase tracking-wider">
          Score
        </span>
      </div>
    </div>
  );
};

// =============================================================================
// CATEGORY BREAKDOWN COMPONENT
// =============================================================================

/**
 * CategoryBreakdown - Shows score per category
 */
interface CategoryBreakdownProps {
  categoryScores: Record<DriftCategory, { rawScore: number; weight: number; penalty: number; events: number }>;
}

const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({ categoryScores }) => {
  return (
    <div className="space-y-3">
      {(Object.entries(categoryScores) as [DriftCategory, { rawScore: number; weight: number; penalty: number; events: number }][]).map(
        ([category, data]) => {
          const Icon = CATEGORY_ICONS[category];
          const label = CATEGORY_LABELS[category];
          const color = getScoreColor(data.rawScore);
          
          return (
            <div key={category} className="flex items-center gap-3">
              {/* Category icon */}
              <div
                className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${color}15` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              
              {/* Progress bar */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-sentinel-text">{label}</span>
                  <span className="text-xs text-sentinel-muted">
                    {data.rawScore}/100 ({data.events} events)
                  </span>
                </div>
                <div className="h-1.5 bg-sentinel-border/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${data.rawScore}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        }
      )}
    </div>
  );
};

// =============================================================================
// EVENTS LIST COMPONENT
// =============================================================================

/**
 * EventsList - Recent events for this pod
 */
interface EventsListProps {
  events: DriftEvent[];
}

const EventsList: React.FC<EventsListProps> = ({ events }) => {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-sentinel-muted">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No drift events detected</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {events.map((event) => (
        <div
          key={event.eventId || event.id}
          className="p-3 bg-sentinel-bg/50 rounded-lg border-l-2"
          style={{ borderLeftColor: SEVERITY_COLORS[event.severity] }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase"
                  style={{
                    backgroundColor: `${SEVERITY_COLORS[event.severity]}20`,
                    color: SEVERITY_COLORS[event.severity],
                  }}
                >
                  {event.severity}
                </span>
                <span className="text-xs text-sentinel-muted">
                  {event.category}
                </span>
              </div>
              <p className="text-sm text-sentinel-text truncate">
                {event.description}
              </p>
            </div>
            <span className="text-xs text-sentinel-muted flex-shrink-0">
              {formatAge(event.timestamp)} ago
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// BASELINE VIEW COMPONENT
// =============================================================================

/**
 * BaselineView - Shows captured baseline snapshot
 */
interface BaselineViewProps {
  baseline: Baseline | null;
  loading: boolean;
}

const BaselineView: React.FC<BaselineViewProps> = ({ baseline, loading }) => {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  
  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-sentinel-border/50 rounded" />
        ))}
      </div>
    );
  }
  
  if (!baseline) {
    return (
      <div className="text-center py-8 text-sentinel-muted">
        <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No baseline captured yet</p>
      </div>
    );
  }
  
  const sections = [
    {
      id: 'filesystem',
      label: 'Filesystem',
      icon: FileText,
      data: baseline.snapshot.filesystem,
    },
    {
      id: 'processes',
      label: 'Processes',
      icon: Terminal,
      data: baseline.snapshot.processes,
    },
    {
      id: 'network',
      label: 'Network',
      icon: Network,
      data: baseline.snapshot.network,
    },
    {
      id: 'packages',
      label: 'Packages',
      icon: Package,
      data: baseline.snapshot.packages,
    },
    {
      id: 'permissions',
      label: 'Permissions',
      icon: Users,
      data: baseline.snapshot.permissions,
    },
  ];
  
  return (
    <div className="space-y-2">
      <div className="text-xs text-sentinel-muted mb-3">
        Captured: {new Date(baseline.capturedAt).toLocaleString()}
      </div>
      
      {sections.map(({ id, label, icon: Icon, data }) => (
        <div
          key={id}
          className="bg-sentinel-bg/50 rounded-lg overflow-hidden"
        >
          <button
            onClick={() => setExpandedSection(expandedSection === id ? null : id)}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-sentinel-border/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-sentinel-muted" />
              <span className="text-sm text-sentinel-text">{label}</span>
            </div>
            {expandedSection === id ? (
              <ChevronDown className="w-4 h-4 text-sentinel-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-sentinel-muted" />
            )}
          </button>
          
          {expandedSection === id && (
            <div className="px-3 pb-3">
              <pre className="text-xs font-mono text-sentinel-muted bg-sentinel-bg rounded p-2 overflow-x-auto max-h-[200px]">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// TAB NAVIGATION
// =============================================================================

interface TabProps {
  id: TabId;
  label: string;
  active: boolean;
  onClick: () => void;
}

const Tab: React.FC<TabProps> = ({ id, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`
      px-4 py-2 text-sm font-medium transition-colors relative
      ${active
        ? 'text-sentinel-accent'
        : 'text-sentinel-muted hover:text-sentinel-text'
      }
    `}
  >
    {label}
    {active && (
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sentinel-accent" />
    )}
  </button>
);

// =============================================================================
// MAIN POD DETAIL COMPONENT
// =============================================================================

/**
 * PodDetail - Detailed view of a single pod
 * 
 * Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  [X Close]                                              [Purge] │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  ┌─────────────┐   Pod Name                                    │
 * │  │    SCORE    │   namespace                                   │
 * │  │     85      │   Node: minikube                              │
 * │  │             │   Age: 2h 15m                                 │
 * │  └─────────────┘   Events: 5                                   │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  [Overview] [Events] [Baseline]                                │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │  {Tab Content}                                                  │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * Data Flow:
 * - Input: podUid from parent (selected in Leaderboard)
 * - Fetches:
 *   - usePodDetail(uid) → GET /api/pods/:id
 *   - usePodBaseline(uid) → GET /api/pods/:id/baseline
 *   - usePodHistory(uid) → GET /api/pods/:id/history
 * - Actions:
 *   - usePodActions().deletePod() → DELETE /api/pods/:id
 * 
 * @param podUid - UID of pod to display
 * @param onClose - Close callback (hides detail panel)
 */
export const PodDetail: React.FC<PodDetailProps> = ({ podUid, onClose }) => {
  // ==========================================================================
  // HOOKS
  // ==========================================================================
  
  const { data: pod, loading: podLoading, refetch } = usePodDetail(podUid);
  const { data: baseline, loading: baselineLoading } = usePodBaseline(podUid);
  const { deletePod } = usePodActions();
  
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isDeleting, setIsDeleting] = useState(false);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================
  
  /**
   * Handle pod purge action
   * 
   * Sends: DELETE /api/pods/:id to backend
   * Backend: Deletes pod from Kubernetes, triggers replacement
   */
  const handlePurge = async () => {
    if (!pod) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to purge "${pod.name}"? This will delete the pod and trigger its controller to create a replacement.`
    );
    
    if (!confirmed) return;
    
    setIsDeleting(true);
    try {
      await deletePod(podUid);
      onClose(); // Close panel after successful deletion
    } catch (error) {
      console.error('Failed to purge pod:', error);
      alert('Failed to purge pod. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // ==========================================================================
  // LOADING STATE
  // ==========================================================================
  
  if (podLoading) {
    return (
      <div className="bg-sentinel-card rounded-xl border border-sentinel-border overflow-hidden animate-pulse">
        <div className="p-4 border-b border-sentinel-border">
          <div className="h-6 w-32 bg-sentinel-border/50 rounded" />
        </div>
        <div className="p-6 space-y-4">
          <div className="h-32 w-32 bg-sentinel-border/50 rounded-full mx-auto" />
          <div className="h-4 w-48 bg-sentinel-border/50 rounded mx-auto" />
          <div className="h-4 w-32 bg-sentinel-border/50 rounded mx-auto" />
        </div>
      </div>
    );
  }

  // ==========================================================================
  // ERROR STATE
  // ==========================================================================
  
  if (!pod) {
    return (
      <div className="bg-sentinel-card rounded-xl border border-sentinel-border p-6 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto text-sentinel-warning mb-4" />
        <h3 className="text-lg font-medium text-sentinel-text mb-2">
          Pod not found
        </h3>
        <p className="text-sm text-sentinel-muted mb-4">
          The pod may have been deleted or removed.
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-sentinel-border text-sentinel-text rounded-lg hover:bg-sentinel-muted/30 transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  const scoreColor = STATUS_COLORS[pod.status];
  
  return (
    <div className="bg-sentinel-card rounded-xl border border-sentinel-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sentinel-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1 text-sentinel-muted hover:text-sentinel-text hover:bg-sentinel-border/50 rounded transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-sm font-semibold text-sentinel-text uppercase tracking-wider">
            Pod Details
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-sentinel-muted hover:text-sentinel-text hover:bg-sentinel-border/50 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handlePurge}
            disabled={isDeleting}
            className="px-3 py-1.5 text-xs font-medium bg-sentinel-danger/20 text-sentinel-danger rounded-lg hover:bg-sentinel-danger/30 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            {isDeleting ? 'Purging...' : 'Purge'}
          </button>
        </div>
      </div>

      {/* Pod info header */}
      <div className="p-4 border-b border-sentinel-border">
        <div className="flex items-start gap-4">
          {/* Score ring */}
          <ScoreRing score={pod.score} status={pod.status} />
          
          {/* Pod info */}
          <div className="flex-1 space-y-2">
            <div>
              <h3 className="text-lg font-semibold text-sentinel-text">
                {pod.name}
              </h3>
              <p className="text-sm text-sentinel-muted">
                {pod.namespace}
              </p>
            </div>
            
            <div className="flex flex-wrap gap-4 text-sm text-sentinel-muted">
              <div className="flex items-center gap-1">
                <Server className="w-3.5 h-3.5" />
                <span>Node: {pod.nodeName || 'unknown'}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Age: {formatAge(pod.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Activity className="w-3.5 h-3.5" />
                <span>{pod.eventCount} events</span>
              </div>
            </div>
            
            {/* Status badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium"
              style={{
                backgroundColor: `${scoreColor}20`,
                color: scoreColor,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: scoreColor }}
              />
              {pod.status.charAt(0).toUpperCase() + pod.status.slice(1)}
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-sentinel-border">
        <Tab
          id="overview"
          label="Overview"
          active={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
        />
        <Tab
          id="events"
          label={`Events (${pod.eventCount})`}
          active={activeTab === 'events'}
          onClick={() => setActiveTab('events')}
        />
        <Tab
          id="baseline"
          label="Baseline"
          active={activeTab === 'baseline'}
          onClick={() => setActiveTab('baseline')}
        />
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Score breakdown */}
            <div>
              <h4 className="text-xs uppercase tracking-wider text-sentinel-muted mb-3">
                Score Breakdown
              </h4>
              <CategoryBreakdown categoryScores={pod.scoreBreakdown.categoryScores} />
            </div>
            
            {/* Score history chart */}
            <div>
              <h4 className="text-xs uppercase tracking-wider text-sentinel-muted mb-3">
                Score History
              </h4>
              <ScoreChart podUid={podUid} />
            </div>
          </div>
        )}
        
        {activeTab === 'events' && (
          <EventsList events={pod.recentEvents} />
        )}
        
        {activeTab === 'baseline' && (
          <BaselineView baseline={baseline} loading={baselineLoading} />
        )}
      </div>
    </div>
  );
};

export default PodDetail;