import React, { useMemo } from 'react';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { Pod, PodStatus } from '../../types';
import { MiniScoreChart } from '../Charts';

// ============================================================================
// TYPES
// ============================================================================

interface LeaderboardProps {
  pods: Pod[];
  onSelectPod: (uid: string) => void;
  selectedPodUid: string | null;
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

const STATUS_ICONS: Record<PodStatus, typeof CheckCircle> = {
  healthy: CheckCircle,
  good: CheckCircle,
  warning: AlertTriangle,
  critical: XCircle,
  compromised: XCircle,
};

const getScoreColor = (score: number): string => {
  if (score >= 90) return STATUS_COLORS.healthy;
  if (score >= 70) return STATUS_COLORS.good;
  if (score >= 50) return STATUS_COLORS.warning;
  if (score >= 30) return STATUS_COLORS.critical;
  return STATUS_COLORS.compromised;
};

// ============================================================================
// COMPONENT
// ============================================================================

export const Leaderboard: React.FC<LeaderboardProps> = ({
  pods,
  onSelectPod,
  selectedPodUid,
}) => {
  // Sort pods by score (descending) and add ranking
  const rankedPods = useMemo(() => {
    return [...pods]
      .sort((a, b) => b.score - a.score)
      .map((pod, index) => ({
        ...pod,
        rank: index + 1,
      }));
  }, [pods]);

  // Get top 3 for special styling
  const topThree = rankedPods.slice(0, 3);
  const rest = rankedPods.slice(3);

  return (
    <div className="bg-sentinel-surface border border-sentinel-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sentinel-border bg-sentinel-bg/50">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-sentinel-accent" />
          <h2 className="font-semibold text-sentinel-text">Pod Leaderboard</h2>
          <span className="ml-auto text-xs text-sentinel-muted">
            {pods.length} pod{pods.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Top 3 Podium */}
      {topThree.length > 0 && (
        <div className="px-4 py-4 border-b border-sentinel-border bg-gradient-to-b from-sentinel-bg/50 to-transparent">
          <div className="grid grid-cols-3 gap-3">
            {topThree.map((pod, index) => {
              const position = index + 1;
              const isSelected = selectedPodUid === pod.uid;
              const scoreColor = getScoreColor(pod.score);
              const StatusIcon = STATUS_ICONS[pod.status];

              return (
                <button
                  key={pod.uid}
                  onClick={() => onSelectPod(pod.uid)}
                  className={`
                    relative p-3 rounded-lg border-2 transition-all text-left
                    ${isSelected
                      ? 'border-sentinel-accent bg-sentinel-accent/10'
                      : 'border-sentinel-border hover:border-sentinel-muted bg-sentinel-bg/50'
                    }
                  `}
                >
                  {/* Rank badge */}
                  <div
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: scoreColor,
                      color: '#0a0e14',
                    }}
                  >
                    {position}
                  </div>

                  {/* Pod info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <StatusIcon
                        className="w-3.5 h-3.5"
                        style={{ color: scoreColor }}
                      />
                      <span className="text-xs font-medium text-sentinel-text truncate">
                        {pod.name}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-2xl font-bold tabular-nums"
                        style={{ color: scoreColor }}
                      >
                        {pod.score}
                      </span>
                      <span className="text-[10px] text-sentinel-muted">/100</span>
                    </div>
                    <p className="text-[10px] text-sentinel-muted truncate">
                      {pod.namespace}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rest of the leaderboard */}
      <div className="max-h-[500px] overflow-y-auto">
        {rest.length === 0 && topThree.length === 0 && (
          <div className="px-4 py-8 text-center text-sentinel-muted">
            <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No pods to display</p>
          </div>
        )}

        {rest.map((pod) => {
          const isSelected = selectedPodUid === pod.uid;
          const scoreColor = getScoreColor(pod.score);
          const StatusIcon = STATUS_ICONS[pod.status];

          return (
            <button
              key={pod.uid}
              onClick={() => onSelectPod(pod.uid)}
              className={`
                w-full px-4 py-3 border-b border-sentinel-border/50 flex items-center gap-3
                hover:bg-sentinel-border/20 transition-colors text-left
                ${isSelected ? 'bg-sentinel-accent/5' : ''}
              `}
            >
              {/* Rank */}
              <div className="flex-shrink-0 w-8 text-center">
                <span className="text-xs text-sentinel-muted tabular-nums">
                  #{pod.rank}
                </span>
              </div>

              {/* Status indicator */}
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: scoreColor }}
              />

              {/* Pod info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusIcon
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: scoreColor }}
                  />
                  <span className="text-sm font-medium text-sentinel-text truncate">
                    {pod.name}
                  </span>
                </div>
                <p className="text-xs text-sentinel-muted truncate">
                  {pod.namespace} • {pod.nodeName || 'unknown node'}
                </p>
              </div>

              {/* Score */}
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* Mini chart placeholder - in real implementation, you'd pass score history */}
                <div className="hidden sm:block">
                  <div className="w-16 h-6 flex items-center justify-center">
                    <span
                      className="text-xs font-medium tabular-nums"
                      style={{ color: scoreColor }}
                    >
                      {pod.score}
                    </span>
                  </div>
                </div>
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: scoreColor }}
                >
                  {pod.score}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Leaderboard;
