import React from 'react';
import {
  AlertTriangle,
  HardDrive,
  Cpu,
  Globe,
  Package,
  Users,
  Clock,
} from 'lucide-react';
import { useRealtimeEvents } from '../../hooks';
import type { DriftCategory, DriftEvent, Severity } from '../../types';

// ============================================================================
// CONSTANTS
// ============================================================================

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

const formatTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
};

// ============================================================================
// EVENT ITEM COMPONENT
// ============================================================================

const EventItem: React.FC<{ event: DriftEvent }> = ({ event }) => {
  const Icon = CATEGORY_ICONS[event.category] || AlertTriangle;
  const severityColor = SEVERITY_COLORS[event.severity];
  const categoryLabel = CATEGORY_LABELS[event.category] || event.category;

  return (
    <div className="px-4 py-3 border-b border-sentinel-border/50 hover:bg-sentinel-border/20 transition-colors">
      <div className="flex items-start gap-3">
        {/* Category icon */}
        <div
          className="p-2 rounded-lg flex-shrink-0"
          style={{ backgroundColor: `${severityColor}20` }}
        >
          <Icon className="w-4 h-4" style={{ color: severityColor }} />
        </div>

        {/* Event details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase"
              style={{
                backgroundColor: `${severityColor}20`,
                color: severityColor,
              }}
            >
              {event.severity}
            </span>
            <span className="text-xs text-sentinel-muted">{categoryLabel}</span>
            <span className="text-xs text-sentinel-text font-medium truncate">
              {event.podName}
            </span>
          </div>
          <p className="text-xs text-sentinel-text mb-1">
            {event.eventType.replace(/_/g, ' ')}
          </p>
          <p className="text-xs text-sentinel-muted line-clamp-2">
            {event.description}
          </p>
        </div>

        {/* Timestamp */}
        <div className="flex-shrink-0 text-right">
          <div className="flex items-center gap-1 text-[10px] text-sentinel-muted mb-1">
            <Clock className="w-3 h-3" />
            <span>{formatTime(event.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const EventsFeed: React.FC = () => {
  const { events, loading, error } = useRealtimeEvents(50);

  return (
    <div className="bg-sentinel-surface border border-sentinel-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sentinel-border bg-sentinel-bg/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-sentinel-accent" />
            <h2 className="font-semibold text-sentinel-text">Drift Events</h2>
          </div>
          {events.length > 0 && (
            <span className="text-xs text-sentinel-muted">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[600px] overflow-y-auto">
        {loading && (
          <div className="px-4 py-8 text-center">
            <div className="animate-pulse text-sentinel-muted text-sm">
              Loading events...
            </div>
          </div>
        )}

        {error && (
          <div className="px-4 py-8 text-center text-sentinel-danger">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Failed to load events</p>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="px-4 py-8 text-center text-sentinel-muted">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No drift events detected</p>
            <p className="text-xs mt-1">Events will appear here when detected</p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div>
            {events.map((event, index) => (
              <EventItem key={event.eventId || `event-${index}`} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventsFeed;
