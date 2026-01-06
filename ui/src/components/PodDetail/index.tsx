import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Trash2,
  Clock,
  Server,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  HardDrive,
  Cpu,
  Globe,
  Package,
  Users,
  Activity,
} from 'lucide-react';
import { usePodDetail, usePodActions } from '../../hooks';
import type { DriftCategory, DriftEvent, Severity } from '../../types';
import { ScoreChart } from '../Charts';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface PodDetailProps {
  podUid: string;
  onClose: () => void;
}

const CATEGORY_ICONS: Record<DriftCategory, typeof HardDrive> = {
  filesystem: HardDrive,
  processes: Cpu,
  network: Globe,
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

const getScoreColor = (score: number): string => {
  if (score >= 90) return '#00ff9f';
  if (score >= 70) return '#00d4ff';
  if (score >= 50) return '#fbbf24';
  if (score >= 30) return '#ff6b6b';
  return '#ff4444';
};

const formatAge = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
};

const formatTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

// ============================================================================
// EVENT ROW COMPONENT
// ============================================================================

const EventRow: React.FC<{ event: DriftEvent }> = ({ event }) => {
  const Icon = CATEGORY_ICONS[event.category] || AlertTriangle;
  const severityColor = SEVERITY_COLORS[event.severity];

  return (
    <div className="px-4 py-2 border-t border-sentinel-border/50 hover:bg-sentinel-border/20 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className="p-1.5 rounded"
          style={{ backgroundColor: `${severityColor}20` }}
        >
          <Icon className="w-3 h-3" style={{ color: severityColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase"
              style={{
                backgroundColor: `${severityColor}20`,
                color: severityColor,
              }}
            >
              {event.severity}
            </span>
            <span className="text-xs text-sentinel-text font-medium">
              {event.eventType.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-sentinel-muted mt-1 truncate">
            {event.description}
          </p>
        </div>
        <span className="text-[10px] text-sentinel-muted whitespace-nowrap">
          {formatTime(event.timestamp)}
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const PodDetail: React.FC<PodDetailProps> = ({ podUid, onClose }) => {
  const { data: pod, loading, error, refetch } = usePodDetail(podUid);
  const { deletePod, isDeleting } = usePodActions();
  const [showEvents, setShowEvents] = useState(true);
  const [showChart, setShowChart] = useState(true);

  const handlePurge = async () => {
    if (!pod) return;
    if (!window.confirm(`Are you sure you want to purge ${pod.name}? This will delete the pod.`)) {
      return;
    }
    try {
      await deletePod(podUid);
      onClose();
    } catch (err) {
      console.error('Failed to purge pod:', err);
      alert('Failed to purge pod. Please try again.');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-sentinel-surface border border-sentinel-border rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-sentinel-border rounded w-1/2" />
          <div className="h-24 bg-sentinel-border rounded" />
          <div className="h-40 bg-sentinel-border rounded" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !pod) {
    return (
      <div className="bg-sentinel-surface border border-sentinel-border rounded-lg p-6">
        <div className="text-center text-sentinel-danger">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="mb-3">Failed to load pod details</p>
          <button
            onClick={refetch}
            className="text-sm text-sentinel-accent hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const scoreColor = getScoreColor(pod.score);
  const breakdown = pod.scoreBreakdown;

  return (
    <div className="bg-sentinel-surface border border-sentinel-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sentinel-border bg-sentinel-bg/50 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold text-sentinel-text truncate" title={pod.name}>
            {pod.name}
          </h3>
          <p className="text-xs text-sentinel-muted">{pod.namespace}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refetch}
            className="p-1.5 rounded hover:bg-sentinel-border text-sentinel-muted hover:text-sentinel-text transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-sentinel-border text-sentinel-muted hover:text-sentinel-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Score display */}
      <div className="p-4 border-b border-sentinel-border">
        <div className="flex items-center gap-6">
          {/* Score circle */}
          <div className="relative flex-shrink-0">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="6"
                fill="transparent"
                className="text-sentinel-border"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke={scoreColor}
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={`${(pod.score / 100) * 251.2} 251.2`}
                strokeLinecap="round"
                className="transition-all duration-500"
                style={{ filter: `drop-shadow(0 0 6px ${scoreColor}40)` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color: scoreColor }}
              >
                {pod.score}
              </span>
              <span className="text-[10px] text-sentinel-muted uppercase">Score</span>
            </div>
          </div>

          {/* Pod metadata */}
          <div className="flex-1 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-sentinel-muted">
              <Clock className="w-3.5 h-3.5" />
              <span>Age: {formatAge(pod.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-sentinel-muted">
              <Server className="w-3.5 h-3.5" />
              <span>Node: {pod.nodeName || 'unknown'}</span>
            </div>
            <div className="flex items-center gap-2 text-sentinel-muted">
              <Activity className="w-3.5 h-3.5" />
              <span>{pod.eventCount} drift events</span>
            </div>
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      {breakdown && (
        <div className="p-4 border-b border-sentinel-border">
          <h4 className="text-xs uppercase tracking-wider text-sentinel-muted mb-3">
            Score Breakdown
          </h4>
          <div className="space-y-2">
            {(Object.entries(breakdown.categoryScores) as [DriftCategory, { rawScore: number; weight: number }][]).map(
              ([category, data]) => {
                const Icon = CATEGORY_ICONS[category] || AlertTriangle;
                const label = CATEGORY_LABELS[category] || category;
                const categoryScore = Math.max(0, 100 - data.rawScore);
                const barColor = getScoreColor(categoryScore);

                return (
                  <div key={category} className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-sentinel-muted flex-shrink-0" />
                    <span className="text-xs text-sentinel-text w-20 flex-shrink-0">
                      {label}
                    </span>
                    <div className="flex-1 h-1.5 bg-sentinel-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${categoryScore}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <span
                      className="text-xs tabular-nums w-8 text-right flex-shrink-0"
                      style={{ color: barColor }}
                    >
                      {categoryScore}%
                    </span>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* Score history chart */}
      <div className="border-b border-sentinel-border">
        <button
          onClick={() => setShowChart(!showChart)}
          className="w-full px-4 py-2 flex items-center justify-between text-xs uppercase tracking-wider text-sentinel-muted hover:bg-sentinel-border/20 transition-colors"
        >
          <span>Score History</span>
          {showChart ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showChart && (
          <div className="px-4 pb-4">
            <ScoreChart podUid={podUid} />
          </div>
        )}
      </div>

      {/* Recent events */}
      <div className="border-b border-sentinel-border">
        <button
          onClick={() => setShowEvents(!showEvents)}
          className="w-full px-4 py-2 flex items-center justify-between text-xs uppercase tracking-wider text-sentinel-muted hover:bg-sentinel-border/20 transition-colors"
        >
          <span>Recent Events ({pod.recentEvents?.length || 0})</span>
          {showEvents ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showEvents && pod.recentEvents && pod.recentEvents.length > 0 && (
          <div className="max-h-48 overflow-y-auto">
            {pod.recentEvents.slice(0, 10).map((event, i) => (
              <EventRow key={event.eventId || i} event={event} />
            ))}
          </div>
        )}
        {showEvents && (!pod.recentEvents || pod.recentEvents.length === 0) && (
          <div className="px-4 py-6 text-center text-sentinel-muted text-sm">
            No drift events detected
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4">
        <button
          onClick={handlePurge}
          disabled={isDeleting}
          className={`
            w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
            text-sm font-medium transition-all
            ${isDeleting
              ? 'bg-sentinel-border text-sentinel-muted cursor-not-allowed'
              : 'bg-sentinel-danger/20 text-sentinel-danger hover:bg-sentinel-danger/30 border border-sentinel-danger/30'
            }
          `}
        >
          <Trash2 className="w-4 h-4" />
          {isDeleting ? 'Purging...' : 'Purge Pod'}
        </button>
      </div>
    </div>
  );
};

export default PodDetail;
