import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { usePodHistory, useStats } from '../../hooks';
import type { ClusterStats } from '../../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  accent: '#00ff9f',
  blue: '#00d4ff',
  warning: '#fbbf24',
  danger: '#ff6b6b',
  critical: '#ff4444',
  muted: '#4a5568',
  border: '#1f2937',
  bg: '#0a0e14',
};

const getScoreColor = (score: number): string => {
  if (score >= 90) return COLORS.accent;
  if (score >= 70) return COLORS.blue;
  if (score >= 50) return COLORS.warning;
  if (score >= 30) return COLORS.danger;
  return COLORS.critical;
};

// ============================================================================
// SCORE CHART (Line chart for pod history)
// ============================================================================

interface ScoreChartProps {
  podUid: string;
}

export const ScoreChart: React.FC<ScoreChartProps> = ({ podUid }) => {
  const { data: history, loading } = usePodHistory(podUid);

  if (loading) {
    return (
      <div className="h-32 flex items-center justify-center">
        <div className="animate-pulse text-sentinel-muted text-sm">Loading...</div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-sentinel-muted text-sm">
        No history data available
      </div>
    );
  }

  // Format data for chart
  const chartData = history.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    score: point.score,
  }));

  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
          <XAxis
            dataKey="time"
            stroke={COLORS.muted}
            fontSize={10}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            stroke={COLORS.muted}
            fontSize={10}
            tickLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: COLORS.muted }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke={COLORS.accent}
            strokeWidth={2}
            fill="url(#scoreGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// CLUSTER HEALTH CHART (Donut chart for pod status distribution)
// ============================================================================

interface ClusterHealthChartProps {
  stats: ClusterStats | null;
}

export const ClusterHealthChart: React.FC<ClusterHealthChartProps> = ({ stats }) => {
  if (!stats) return null;

  const data = [
    { name: 'Healthy', value: stats.healthyPods, color: COLORS.accent },
    { name: 'Warning', value: stats.warningPods, color: COLORS.warning },
    { name: 'Critical', value: stats.criticalPods, color: COLORS.danger },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    data.push({ name: 'No pods', value: 1, color: COLORS.muted });
  }

  const total = stats.totalPods;
  const healthyPercent = total > 0 ? Math.round((stats.healthyPods / total) * 100) : 0;

  return (
    <div className="relative h-40">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={60}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold" style={{ color: getScoreColor(healthyPercent) }}>
          {healthyPercent}%
        </span>
        <span className="text-xs text-sentinel-muted">Healthy</span>
      </div>
    </div>
  );
};

// ============================================================================
// SCORE DISTRIBUTION CHART (Bar chart)
// ============================================================================

interface ScoreDistributionChartProps {
  pods: Array<{ score: number }>;
}

export const ScoreDistributionChart: React.FC<ScoreDistributionChartProps> = ({ pods }) => {
  // Create distribution buckets
  const buckets = [
    { range: '0-20', min: 0, max: 20, count: 0, color: COLORS.critical },
    { range: '21-40', min: 21, max: 40, count: 0, color: COLORS.danger },
    { range: '41-60', min: 41, max: 60, count: 0, color: COLORS.warning },
    { range: '61-80', min: 61, max: 80, count: 0, color: COLORS.blue },
    { range: '81-100', min: 81, max: 100, count: 0, color: COLORS.accent },
  ];

  pods.forEach((pod) => {
    const bucket = buckets.find((b) => pod.score >= b.min && pod.score <= b.max);
    if (bucket) bucket.count++;
  });

  return (
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
          <XAxis
            dataKey="range"
            stroke={COLORS.muted}
            fontSize={10}
            tickLine={false}
          />
          <YAxis
            stroke={COLORS.muted}
            fontSize={10}
            tickLine={false}
            width={20}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: COLORS.muted }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {buckets.map((bucket, index) => (
              <Cell key={`cell-${index}`} fill={bucket.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// REAL-TIME SCORE LINE (Simple mini chart)
// ============================================================================

interface MiniScoreChartProps {
  scores: number[];
}

export const MiniScoreChart: React.FC<MiniScoreChartProps> = ({ scores }) => {
  const data = scores.map((score, index) => ({ index, score }));
  const currentScore = scores[scores.length - 1] || 0;

  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="score"
            stroke={getScoreColor(currentScore)}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// CATEGORY BREAKDOWN CHART (Horizontal bars)
// ============================================================================

interface CategoryBreakdownChartProps {
  categories: Record<string, { rawScore: number; weight: number }>;
}

export const CategoryBreakdownChart: React.FC<CategoryBreakdownChartProps> = ({
  categories,
}) => {
  const data = Object.entries(categories).map(([name, data]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    score: Math.max(0, 100 - data.rawScore),
    weight: data.weight * 100,
  }));

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 5, bottom: 5, left: 70 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            stroke={COLORS.muted}
            fontSize={10}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke={COLORS.muted}
            fontSize={10}
            tickLine={false}
            width={65}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="score" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default {
  ScoreChart,
  ClusterHealthChart,
  ScoreDistributionChart,
  MiniScoreChart,
  CategoryBreakdownChart,
};
