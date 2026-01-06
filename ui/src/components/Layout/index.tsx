import React from 'react';
import { Shield, Wifi, WifiOff, Settings } from 'lucide-react';
import type { ClusterStats } from '../../types';

// ============================================================================
// TYPES
// ============================================================================

interface LayoutProps {
  children: React.ReactNode;
  header: {
    stats: ClusterStats | null;
    isConnected: boolean;
    showConfig: boolean;
    onToggleConfig: () => void;
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export const Layout: React.FC<LayoutProps> = ({ children, header }) => {
  const { stats, isConnected, showConfig, onToggleConfig } = header;

  return (
    <div className="min-h-screen bg-sentinel-bg text-sentinel-text">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-sentinel-border bg-sentinel-surface/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sentinel-accent/20">
                <Shield className="w-6 h-6 text-sentinel-accent" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-sentinel-text">Sentinel</h1>
                <p className="text-xs text-sentinel-muted">Kubernetes Pod Entropy Monitor</p>
              </div>
            </div>

            {/* Stats & Controls */}
            <div className="flex items-center gap-4">
              {/* Connection Status */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sentinel-bg/50 border border-sentinel-border">
                {isConnected ? (
                  <>
                    <Wifi className="w-4 h-4 text-sentinel-accent" />
                    <span className="text-xs text-sentinel-muted">Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-sentinel-muted" />
                    <span className="text-xs text-sentinel-muted">Disconnected</span>
                  </>
                )}
              </div>

              {/* Quick Stats */}
              {stats && (
                <div className="hidden md:flex items-center gap-4 px-3 py-1.5 rounded-lg bg-sentinel-bg/50 border border-sentinel-border">
                  <div className="text-center">
                    <div className="text-sm font-bold text-sentinel-text">
                      {stats.totalPods}
                    </div>
                    <div className="text-[10px] text-sentinel-muted">Pods</div>
                  </div>
                  <div className="w-px h-6 bg-sentinel-border" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-sentinel-accent">
                      {stats.averageScore.toFixed(0)}
                    </div>
                    <div className="text-[10px] text-sentinel-muted">Avg Score</div>
                  </div>
                  <div className="w-px h-6 bg-sentinel-border" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-sentinel-warning">
                      {stats.criticalPods}
                    </div>
                    <div className="text-[10px] text-sentinel-muted">Critical</div>
                  </div>
                </div>
              )}

              {/* Config Toggle */}
              <button
                onClick={onToggleConfig}
                className={`
                  p-2 rounded-lg transition-colors
                  ${showConfig
                    ? 'bg-sentinel-accent/20 text-sentinel-accent'
                    : 'bg-sentinel-bg/50 text-sentinel-muted hover:text-sentinel-text hover:bg-sentinel-border'
                  }
                `}
                title="Toggle configuration panel"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-sentinel-border bg-sentinel-surface/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between text-xs text-sentinel-muted">
            <div>
              Sentinel v1.0.0 • Kubernetes Pod Entropy Monitor
            </div>
            <div>
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-sentinel-accent animate-pulse" />
                  Live
                </span>
              ) : (
                <span>Offline</span>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
