// =============================================================================
// SENTINEL UI - CLUSTER HEALTH COMPONENT
// =============================================================================
// Displays cluster-wide health statistics in a card layout.
// Shows: Total pods, healthy/warning/critical counts, average score.
//
// Data Flow:
// - Receives: stats (ClusterStats) from App.tsx
// - Source: GET /api/stats via useStats() or usePollingStats() hook
// - Updates: Every 5 seconds via polling OR via WebSocket real-time updates
// =============================================================================

import React from 'react';
import {
  Activity,
  Shield,
  AlertTriangle,
  XCircle,
  Trash2,
  TrendingUp,
  Server,
} from 'lucide-react';
import type { ClusterStats } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ClusterHealthProps {
  /** Cluster statistics data */
  stats: ClusterStats | null;
  /** Whether data is currently loading */
  loading?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Colors for different health states */
const COLORS = {
  healthy: '#00ff9f',
  warning: '#fbbf24',
  critical: '#ff6b6b',
  muted: '#4a5568',
  accent: '#00d4ff',
};

// =============================================================================
// STAT CARD COMPONENT
// =============================================================================

/**
 * StatCard - Individual statistic display card
 * 
 * Purpose: Displays a single metric with icon, value, and label
 * 
 * @param icon - Lucide React icon
 * @param label - Metric label text
 * @param value - Numeric or string value
 * @param color - Color for the value text
 * @param subtitle - Optional secondary text
 * @param loading - Show loading skeleton
 */
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color?: string;
  subtitle?: string;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  color = '#e2e8f0',
  subtitle,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="bg-sentinel-card rounded-xl p-4 border border-sentinel-border">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-sentinel-border/50 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-16 bg-sentinel-border/50 rounded animate-pulse" />
            <div className="h-6 w-12 bg-sentinel-border/50 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-sentinel-card rounded-xl p-4 border border-sentinel-border hover:border-sentinel-accent/30 transition-colors">
      <div className="flex items-start gap-3">
        {/* Icon container */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Label */}
          <p className="text-xs text-sentinel-muted uppercase tracking-wider mb-1">
            {label}
          </p>
          
          {/* Value */}
          <p
            className="text-2xl font-bold tabular-nums truncate"
            style={{ color }}
          >
            {value}
          </p>
          
          {/* Optional subtitle */}
          {subtitle && (
            <p className="text-xs text-sentinel-muted mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// HEALTH BAR COMPONENT
// =============================================================================

/**
 * HealthBar - Visual representation of pod health distribution
 * 
 * Purpose: Shows a horizontal bar divided into healthy/warning/critical segments
 * 
 * @param healthy - Count of healthy pods
 * @param warning - Count of warning pods
 * @param critical - Count of critical pods
 * @param total - Total pod count
 */
interface HealthBarProps {
  healthy: number;
  warning: number;
  critical: number;
  total: number;
}

const HealthBar: React.FC<HealthBarProps> = ({
  healthy,
  warning,
  critical,
  total,
}) => {
  // Calculate percentages
  const healthyPct = total > 0 ? (healthy / total) * 100 : 0;
  const warningPct = total > 0 ? (warning / total) * 100 : 0;
  const criticalPct = total > 0 ? (critical / total) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className="h-3 rounded-full overflow-hidden bg-sentinel-border/50 flex">
        {/* Healthy segment */}
        {healthyPct > 0 && (
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${healthyPct}%`,
              backgroundColor: COLORS.healthy,
            }}
            title={`Healthy: ${healthy} (${healthyPct.toFixed(1)}%)`}
          />
        )}
        
        {/* Warning segment */}
        {warningPct > 0 && (
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${warningPct}%`,
              backgroundColor: COLORS.warning,
            }}
            title={`Warning: ${warning} (${warningPct.toFixed(1)}%)`}
          />
        )}
        
        {/* Critical segment */}
        {criticalPct > 0 && (
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${criticalPct}%`,
              backgroundColor: COLORS.critical,
            }}
            title={`Critical: ${critical} (${criticalPct.toFixed(1)}%)`}
          />
        )}
      </div>
      
      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-sentinel-muted">
        <div className="flex items-center gap-4">
          <LegendItem color={COLORS.healthy} label="Healthy" value={healthy} />
          <LegendItem color={COLORS.warning} label="Warning" value={warning} />
          <LegendItem color={COLORS.critical} label="Critical" value={critical} />
        </div>
        <span className="text-sentinel-text font-medium">
          {total} total
        </span>
      </div>
    </div>
  );
};

/**
 * LegendItem - Single item in the health bar legend
 */
interface LegendItemProps {
  color: string;
  label: string;
  value: number;
}

const LegendItem: React.FC<LegendItemProps> = ({ color, label, value }) => (
  <div className="flex items-center gap-1.5">
    <span
      className="w-2 h-2 rounded-full"
      style={{ backgroundColor: color }}
    />
    <span>{label}:</span>
    <span className="font-medium text-sentinel-text">{value}</span>
  </div>
);

// =============================================================================
// AVERAGE SCORE GAUGE
// =============================================================================

/**
 * ScoreGauge - Circular gauge for average score
 * 
 * Purpose: Visual representation of cluster average score
 * 
 * @param score - Average score (0-100)
 */
interface ScoreGaugeProps {
  score: number;
}

const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score }) => {
  // Get color based on score
  const color = getScoreColor(score);
  
  // Calculate stroke dasharray for partial circle
  const circumference = 2 * Math.PI * 45; // radius = 45
  const progress = (score / 100) * circumference;
  
  return (
    <div className="relative w-28 h-28">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#1f2937"
          strokeWidth="8"
        />
        
        {/* Progress circle */}
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color }}
        >
          {Math.round(score)}
        </span>
        <span className="text-[10px] text-sentinel-muted uppercase">
          Avg Score
        </span>
      </div>
    </div>
  );
};

/**
 * Get color based on score value
 */
function getScoreColor(score: number): string {
  if (score >= 80) return COLORS.healthy;
  if (score >= 60) return COLORS.accent;
  if (score >= 40) return COLORS.warning;
  return COLORS.critical;
}

// =============================================================================
// MAIN CLUSTER HEALTH COMPONENT
// =============================================================================

/**
 * ClusterHealth - Main component displaying cluster health overview
 * 
 * Structure:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  CLUSTER HEALTH                                             │
 * ├─────────────────────────────────────────────────────────────┤
 * │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
 * │  │ Total   │  │ Healthy │  │ Warning │  │ Critical│        │
 * │  │ Pods    │  │ Pods    │  │ Pods    │  │ Pods    │        │
 * │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
 * │                                                             │
 * │  ┌─────────────────────────────────────┐  ┌─────────────┐  │
 * │  │         Health Distribution          │  │ Avg Score  │  │
 * │  │  ████████████░░░░░░                  │  │   [Gauge]  │  │
 * │  │  Healthy: 8  Warning: 3  Critical: 1 │  │            │  │
 * │  └─────────────────────────────────────┘  └─────────────┘  │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * Data Flow:
 * - Input: stats from usePollingStats(5000) hook in App.tsx
 * - Source: GET /api/stats endpoint
 * - Refresh: Every 5 seconds via polling
 * 
 * @param stats - Cluster statistics from API
 * @param loading - Loading state
 */
export const ClusterHealth: React.FC<ClusterHealthProps> = ({
  stats,
  loading = false,
}) => {
  // Handle loading state
  if (loading || !stats) {
    return (
      <div className="bg-sentinel-card/50 rounded-xl border border-sentinel-border p-6">
        <h2 className="text-sm font-semibold text-sentinel-text uppercase tracking-wider mb-4">
          Cluster Health
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <StatCard
              key={i}
              icon={<Server className="w-5 h-5" />}
              label="Loading"
              value={0}
              loading={true}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-sentinel-card/50 rounded-xl border border-sentinel-border p-6 space-y-6">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-sentinel-text uppercase tracking-wider">
          Cluster Health
        </h2>
        <span className="text-xs text-sentinel-muted">
          Last updated: {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Pods */}
        <StatCard
          icon={<Server className="w-5 h-5" />}
          label="Total Pods"
          value={stats.totalPods}
          color={COLORS.accent}
          subtitle="Being monitored"
        />
        
        {/* Healthy Pods */}
        <StatCard
          icon={<Shield className="w-5 h-5" />}
          label="Healthy"
          value={stats.healthyPods}
          color={COLORS.healthy}
          subtitle={`${stats.totalPods > 0 ? Math.round((stats.healthyPods / stats.totalPods) * 100) : 0}% of cluster`}
        />
        
        {/* Warning Pods */}
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="Warning"
          value={stats.warningPods}
          color={COLORS.warning}
          subtitle="Need attention"
        />
        
        {/* Critical Pods */}
        <StatCard
          icon={<XCircle className="w-5 h-5" />}
          label="Critical"
          value={stats.criticalPods}
          color={COLORS.critical}
          subtitle="At risk"
        />
      </div>

      {/* Health distribution and score gauge */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        {/* Health distribution bar - takes 2 columns */}
        <div className="md:col-span-2 bg-sentinel-bg/50 rounded-lg p-4">
          <h3 className="text-xs text-sentinel-muted uppercase tracking-wider mb-3">
            Health Distribution
          </h3>
          <HealthBar
            healthy={stats.healthyPods}
            warning={stats.warningPods}
            critical={stats.criticalPods}
            total={stats.totalPods}
          />
        </div>
        
        {/* Score gauge - takes 1 column */}
        <div className="flex flex-col items-center justify-center bg-sentinel-bg/50 rounded-lg p-4">
          <ScoreGauge score={stats.averageScore} />
          
          {/* Purged today indicator */}
          {stats.purgedToday > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-sentinel-danger">
              <Trash2 className="w-3 h-3" />
              <span>{stats.purgedToday} purged today</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusterHealth;