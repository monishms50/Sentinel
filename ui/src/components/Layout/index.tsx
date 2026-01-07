// =============================================================================
// SENTINEL UI - LAYOUT COMPONENT
// =============================================================================
// Main layout wrapper for the application.
// Provides: Header, main content area, and footer.
//
// Data Flow:
// - Receives: stats (ClusterStats), isConnected (WebSocket status), config state
// - From: App.tsx via props
// - To: Children rendered in main content area
// =============================================================================

import React from 'react';
import {
  Shield,
  Settings,
  Wifi,
  WifiOff,
  Activity,
  ExternalLink,
} from 'lucide-react';
import type { ClusterStats } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * HeaderProps - Configuration for the header section
 */
interface HeaderProps {
  /** Cluster statistics for quick stats display */
  stats: ClusterStats | null;
  /** WebSocket connection status */
  isConnected: boolean;
  /** Whether config panel is visible */
  showConfig: boolean;
  /** Toggle config panel visibility */
  onToggleConfig: () => void;
}

/**
 * LayoutProps - Main layout component props
 */
interface LayoutProps {
  /** Header configuration */
  header: HeaderProps;
  /** Child components (main content) */
  children: React.ReactNode;
}

// =============================================================================
// HEADER COMPONENT
// =============================================================================

/**
 * Header - Top navigation bar
 * 
 * Displays:
 * - Sentinel branding/logo
 * - WebSocket connection indicator
 * - Quick cluster stats
 * - Settings toggle button
 * 
 * @param props - HeaderProps
 */
const Header: React.FC<HeaderProps> = ({
  stats,
  isConnected,
  showConfig,
  onToggleConfig,
}) => {
  return (
    <header className="bg-sentinel-card border-b border-sentinel-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Logo and branding */}
          <div className="flex items-center gap-3">
            {/* Logo icon with glow effect */}
            <div className="relative">
              <Shield className="w-8 h-8 text-sentinel-accent" />
              {/* Animated glow ring */}
              <div className="absolute inset-0 animate-ping-slow">
                <Shield className="w-8 h-8 text-sentinel-accent opacity-30" />
              </div>
            </div>
            
            {/* Brand text */}
            <div>
              <h1 className="text-lg font-bold text-sentinel-text tracking-tight">
                SENTINEL
              </h1>
              <p className="text-[10px] text-sentinel-muted uppercase tracking-wider">
                Pod Entropy Monitor
              </p>
            </div>
          </div>

          {/* Center: Quick stats (only on larger screens) */}
          {stats && (
            <div className="hidden md:flex items-center gap-6 text-sm">
              {/* Total pods */}
              <QuickStat
                label="Total Pods"
                value={stats.totalPods}
                icon={<Activity className="w-4 h-4" />}
              />
              
              {/* Average score */}
              <QuickStat
                label="Avg Score"
                value={Math.round(stats.averageScore)}
                icon={<Shield className="w-4 h-4" />}
                color={getQuickStatColor(stats.averageScore)}
              />
              
              {/* Purged today */}
              <QuickStat
                label="Purged Today"
                value={stats.purgedToday}
                icon={<Activity className="w-4 h-4" />}
                color={stats.purgedToday > 0 ? '#ff6b6b' : undefined}
              />
            </div>
          )}

          {/* Right: Connection status and settings */}
          <div className="flex items-center gap-4">
            {/* WebSocket connection indicator */}
            <ConnectionIndicator isConnected={isConnected} />
            
            {/* Settings button */}
            <button
              onClick={onToggleConfig}
              className={`
                p-2 rounded-lg transition-all duration-200
                ${showConfig
                  ? 'bg-sentinel-accent/20 text-sentinel-accent'
                  : 'text-sentinel-muted hover:text-sentinel-text hover:bg-sentinel-border/50'
                }
              `}
              title="Toggle purge configuration"
              aria-label="Toggle settings"
            >
              <Settings className={`w-5 h-5 ${showConfig ? 'animate-spin-slow' : ''}`} />
            </button>
            
            {/* Docs link */}
            <a
              href="https://github.com/sentinel/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sentinel-muted hover:text-sentinel-text transition-colors hidden sm:block"
              title="View documentation"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
};

// =============================================================================
// QUICK STAT COMPONENT
// =============================================================================

/**
 * QuickStat - Small stat display for header
 * 
 * @param label - Stat label text
 * @param value - Numeric value to display
 * @param icon - Lucide icon component
 * @param color - Optional color override
 */
interface QuickStatProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
}

const QuickStat: React.FC<QuickStatProps> = ({ label, value, icon, color }) => {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sentinel-muted">{icon}</span>
      <div className="flex flex-col">
        <span
          className="text-base font-semibold tabular-nums"
          style={{ color: color || '#e2e8f0' }}
        >
          {value}
        </span>
        <span className="text-[10px] text-sentinel-muted uppercase tracking-wider">
          {label}
        </span>
      </div>
    </div>
  );
};

/**
 * Get color for quick stat based on score
 */
function getQuickStatColor(score: number): string {
  if (score >= 80) return '#00ff9f';
  if (score >= 60) return '#00d4ff';
  if (score >= 40) return '#fbbf24';
  return '#ff6b6b';
}

// =============================================================================
// CONNECTION INDICATOR COMPONENT
// =============================================================================

/**
 * ConnectionIndicator - Shows WebSocket connection status
 * 
 * States:
 * - Connected: Green dot with "Live" text
 * - Disconnected: Red dot with "Offline" text
 * 
 * @param isConnected - Current connection status
 */
interface ConnectionIndicatorProps {
  isConnected: boolean;
}

const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({ isConnected }) => {
  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium
        ${isConnected
          ? 'bg-sentinel-accent/10 text-sentinel-accent'
          : 'bg-sentinel-danger/10 text-sentinel-danger'
        }
      `}
      title={isConnected ? 'Real-time updates active' : 'Connection lost - data may be stale'}
    >
      {/* Status icon */}
      {isConnected ? (
        <Wifi className="w-3.5 h-3.5" />
      ) : (
        <WifiOff className="w-3.5 h-3.5" />
      )}
      
      {/* Status dot with pulse animation when connected */}
      <span className="relative flex h-2 w-2">
        {isConnected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sentinel-accent opacity-75" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isConnected ? 'bg-sentinel-accent' : 'bg-sentinel-danger'
          }`}
        />
      </span>
      
      {/* Status text */}
      <span className="hidden sm:inline">
        {isConnected ? 'Live' : 'Offline'}
      </span>
    </div>
  );
};

// =============================================================================
// FOOTER COMPONENT
// =============================================================================

/**
 * Footer - Bottom bar with version and links
 */
const Footer: React.FC = () => {
  return (
    <footer className="bg-sentinel-card border-t border-sentinel-border py-4 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between text-xs text-sentinel-muted">
          <span>
            Sentinel v1.0.0 • Kubernetes Pod Entropy Monitor
          </span>
          <span>
            Monitoring {new Date().toLocaleDateString()}
          </span>
        </div>
      </div>
    </footer>
  );
};

// =============================================================================
// MAIN LAYOUT COMPONENT
// =============================================================================

/**
 * Layout - Main layout wrapper
 * 
 * Structure:
 * ┌─────────────────────────────────────┐
 * │            HEADER                   │
 * │  Logo | Quick Stats | Settings      │
 * ├─────────────────────────────────────┤
 * │                                     │
 * │         MAIN CONTENT                │
 * │       (children rendered)           │
 * │                                     │
 * ├─────────────────────────────────────┤
 * │            FOOTER                   │
 * └─────────────────────────────────────┘
 * 
 * @param header - Header configuration props
 * @param children - Main content to render
 */
export const Layout: React.FC<LayoutProps> = ({ header, children }) => {
  return (
    <div className="min-h-screen bg-sentinel-bg flex flex-col">
      {/* Header */}
      <Header {...header} />
      
      {/* Main content area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
      
      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Layout;