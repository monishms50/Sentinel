import React, { useState, useMemo } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Server,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Filter,
} from 'lucide-react';
import { usePodActions } from '../../hooks';
import type { Pod, PodStatus } from '../../types';

// ============================================================================
// TYPES
// ============================================================================

interface PodManagerProps {
  pods: Pod[];
  onRefresh: () => void;
  loading?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_COLORS: Record<PodStatus, string> = {
  healthy: '#00ff9f',
  good: '#00d4ff',
  warning: '#fbbf24',
  critical: '#ff6b6b',
  compromised: '#ff4444',
};

// ============================================================================
// COMPONENT
// ============================================================================

export const PodManager: React.FC<PodManagerProps> = ({
  pods,
  onRefresh,
  loading = false,
}) => {
  const [selectedPods, setSelectedPods] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<PodStatus | 'all'>('all');
  const [isDeleting, setIsDeleting] = useState(false);
  const { deletePod } = usePodActions();

  // Filter pods by status
  const filteredPods = useMemo(() => {
    if (statusFilter === 'all') return pods;
    return pods.filter((pod) => pod.status === statusFilter);
  }, [pods, statusFilter]);

  // Pod stats
  const stats = useMemo(() => {
    const byStatus = pods.reduce((acc, pod) => {
      acc[pod.status] = (acc[pod.status] || 0) + 1;
      return acc;
    }, {} as Record<PodStatus, number>);

    return {
      total: pods.length,
      ...byStatus,
    };
  }, [pods]);

  // Toggle pod selection
  const togglePod = (uid: string) => {
    setSelectedPods((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  };

  // Select all filtered pods
  const selectAll = () => {
    if (selectedPods.size === filteredPods.length) {
      setSelectedPods(new Set());
    } else {
      setSelectedPods(new Set(filteredPods.map((p) => p.uid)));
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedPods.size === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to purge ${selectedPods.size} pod(s)? This action cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    const errors: string[] = [];

    for (const uid of selectedPods) {
      try {
        await deletePod(uid);
      } catch (err) {
        const pod = pods.find((p) => p.uid === uid);
        errors.push(pod?.name || uid);
      }
    }

    setIsDeleting(false);
    setSelectedPods(new Set());
    onRefresh();

    if (errors.length > 0) {
      alert(`Failed to purge: ${errors.join(', ')}`);
    }
  };

  // Single pod delete
  const handleDeletePod = async (uid: string, name: string) => {
    if (!window.confirm(`Are you sure you want to purge ${name}?`)) return;

    try {
      await deletePod(uid);
      onRefresh();
    } catch (err) {
      alert(`Failed to purge ${name}`);
    }
  };

  return (
    <div className="bg-sentinel-surface border border-sentinel-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sentinel-border bg-sentinel-bg/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-sentinel-accent" />
            <h2 className="font-semibold text-sentinel-text">Pod Manager</h2>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded hover:bg-sentinel-border text-sentinel-muted hover:text-sentinel-text transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2 py-1 rounded transition-colors ${
              statusFilter === 'all'
                ? 'bg-sentinel-accent/20 text-sentinel-accent'
                : 'text-sentinel-muted hover:text-sentinel-text'
            }`}
          >
            All ({stats.total})
          </button>
          {(['healthy', 'warning', 'critical'] as PodStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                statusFilter === status
                  ? 'bg-sentinel-accent/20 text-sentinel-accent'
                  : 'text-sentinel-muted hover:text-sentinel-text'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              {status.charAt(0).toUpperCase() + status.slice(1)} ({stats[status] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {selectedPods.size > 0 && (
        <div className="px-4 py-2 bg-sentinel-accent/10 border-b border-sentinel-border flex items-center justify-between">
          <span className="text-sm text-sentinel-accent">
            {selectedPods.size} pod(s) selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedPods(new Set())}
              className="px-3 py-1 text-xs rounded bg-sentinel-border text-sentinel-text hover:bg-sentinel-muted/30 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="px-3 py-1 text-xs rounded bg-sentinel-danger/20 text-sentinel-danger hover:bg-sentinel-danger/30 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              {isDeleting ? 'Purging...' : 'Purge Selected'}
            </button>
          </div>
        </div>
      )}

      {/* Pod list */}
      <div className="max-h-[400px] overflow-y-auto">
        {/* Select all header */}
        <div className="px-4 py-2 bg-sentinel-bg/30 border-b border-sentinel-border flex items-center gap-3 text-xs text-sentinel-muted">
          <input
            type="checkbox"
            checked={selectedPods.size === filteredPods.length && filteredPods.length > 0}
            onChange={selectAll}
            className="w-4 h-4 rounded border-sentinel-border bg-sentinel-bg accent-sentinel-accent"
          />
          <span>Select all ({filteredPods.length})</span>
        </div>

        {filteredPods.length === 0 ? (
          <div className="px-4 py-8 text-center text-sentinel-muted">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No pods match the current filter</p>
          </div>
        ) : (
          filteredPods.map((pod) => (
            <div
              key={pod.uid}
              className={`
                px-4 py-3 border-b border-sentinel-border/50 flex items-center gap-3
                hover:bg-sentinel-border/20 transition-colors
                ${selectedPods.has(pod.uid) ? 'bg-sentinel-accent/5' : ''}
              `}
            >
              <input
                type="checkbox"
                checked={selectedPods.has(pod.uid)}
                onChange={() => togglePod(pod.uid)}
                className="w-4 h-4 rounded border-sentinel-border bg-sentinel-bg accent-sentinel-accent"
              />

              {/* Status indicator */}
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: STATUS_COLORS[pod.status] }}
              />

              {/* Pod info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-sentinel-text font-medium truncate">
                  {pod.name}
                </p>
                <p className="text-xs text-sentinel-muted">
                  {pod.namespace} • Score: {pod.score}
                </p>
              </div>

              {/* Score badge */}
              <span
                className="px-2 py-0.5 text-xs font-medium rounded tabular-nums"
                style={{
                  backgroundColor: `${STATUS_COLORS[pod.status]}20`,
                  color: STATUS_COLORS[pod.status],
                }}
              >
                {pod.score}
              </span>

              {/* Delete button */}
              <button
                onClick={() => handleDeletePod(pod.uid, pod.name)}
                className="p-1.5 rounded text-sentinel-muted hover:text-sentinel-danger hover:bg-sentinel-danger/10 transition-colors"
                title="Purge pod"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer info */}
      <div className="px-4 py-2 bg-sentinel-bg/30 border-t border-sentinel-border">
        <p className="text-xs text-sentinel-muted">
          💡 Purged pods will be automatically recreated by their controllers
        </p>
      </div>
    </div>
  );
};

export default PodManager;
