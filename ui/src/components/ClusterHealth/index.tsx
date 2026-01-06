import React from 'react';
import { Activity, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { ClusterHealthChart } from '../Charts';
import type { ClusterStats } from '../../types';

// ============================================================================
// TYPES
// ============================================================================

interface ClusterHealthProps {
  stats: ClusterStats | null;
  loading?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ClusterHealth: React.FC<ClusterHealthProps> = ({ stats, loading }) => {
  if (loading) {
    return (
      <div className="bg-sentinel-surface border border-sentinel-border rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-sentinel-border rounded w-1/3" />
          <div className="h-32 bg-sentinel-border rounded" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-sentinel-surface border border-sentinel-border rounded-lg p-6 text-center text-sentinel-muted">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>No cluster statistics available</p>
      </div>
    );
  }

  const healthyPercent =
    stats.totalPods > 0
      ? Math.round((stats.healthyPods / stats.totalPods) * 100)
      : 0;

  const getHealthColor = (percent: number): string => {
    if (percent >= 90) return '#00ff9f';
    if (percent >= 70) return '#00d4ff';
    if (percent >= 50) return '#fbbf24';
    if (percent >= 30) return '#ff6b6b';
    return '#ff4444';
  };

  const healthColor = getHealthColor(healthyPercent);

  return (
    <div className="bg-sentinel-surface border border-sentinel-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sentinel-border bg-sentinel-bg/50">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-sentinel-accent" />
          <h2 className="font-semibold text-sentinel-text">Cluster Health</h2>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <div className="lg:col-span-1">
            <ClusterHealthChart stats={stats} />
          </div>

          {/* Stats Grid */}
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total Pods */}
            <div className="bg-sentinel-bg/50 rounded-lg p-4 border border-sentinel-border">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-sentinel-muted" />
                <span className="text-xs text-sentinel-muted uppercase tracking-wider">
                  Total
                </span>
              </div>
              <div className="text-2xl font-bold text-sentinel-text tabular-nums">
                {stats.totalPods}
              </div>
            </div>

            {/* Healthy Pods */}
            <div className="bg-sentinel-bg/50 rounded-lg p-4 border border-sentinel-border">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4" style={{ color: '#00ff9f' }} />
                <span className="text-xs text-sentinel-muted uppercase tracking-wider">
                  Healthy
                </span>
              </div>
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: '#00ff9f' }}
              >
                {stats.healthyPods}
              </div>
            </div>

            {/* Warning Pods */}
            <div className="bg-sentinel-bg/50 rounded-lg p-4 border border-sentinel-border">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4" style={{ color: '#fbbf24' }} />
                <span className="text-xs text-sentinel-muted uppercase tracking-wider">
                  Warning
                </span>
              </div>
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: '#fbbf24' }}
              >
                {stats.warningPods}
              </div>
            </div>

            {/* Critical Pods */}
            <div className="bg-sentinel-bg/50 rounded-lg p-4 border border-sentinel-border">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4" style={{ color: '#ff6b6b' }} />
                <span className="text-xs text-sentinel-muted uppercase tracking-wider">
                  Critical
                </span>
              </div>
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: '#ff6b6b' }}
              >
                {stats.criticalPods}
              </div>
            </div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Average Score */}
          <div className="bg-sentinel-bg/50 rounded-lg p-4 border border-sentinel-border">
            <div className="text-xs text-sentinel-muted uppercase tracking-wider mb-2">
              Average Score
            </div>
            <div
              className="text-3xl font-bold tabular-nums"
              style={{ color: healthColor }}
            >
              {stats.averageScore.toFixed(1)}
            </div>
            <div className="text-xs text-sentinel-muted mt-1">out of 100</div>
          </div>

          {/* Total Events */}
          <div className="bg-sentinel-bg/50 rounded-lg p-4 border border-sentinel-border">
            <div className="text-xs text-sentinel-muted uppercase tracking-wider mb-2">
              Total Events
            </div>
            <div className="text-3xl font-bold text-sentinel-text tabular-nums">
              {stats.totalEvents}
            </div>
            <div className="text-xs text-sentinel-muted mt-1">all time</div>
          </div>

          {/* Recent Events */}
          <div className="bg-sentinel-bg/50 rounded-lg p-4 border border-sentinel-border">
            <div className="text-xs text-sentinel-muted uppercase tracking-wider mb-2">
              Recent Events
            </div>
            <div className="text-3xl font-bold text-sentinel-text tabular-nums">
              {stats.recentEvents}
            </div>
            <div className="text-xs text-sentinel-muted mt-1">last 24h</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClusterHealth;
