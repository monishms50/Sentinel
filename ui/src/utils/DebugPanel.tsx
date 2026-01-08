// =============================================================================
// SENTINEL UI - DEBUG PANEL
// =============================================================================
// Visual debug panel that displays real-time debugging information.
// Toggle with Ctrl+Shift+D or via the floating button.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { DEBUG_ENABLED, DEBUG_FLAGS } from './debug';

interface LogEntry {
  id: number;
  timestamp: string;
  type: 'info' | 'warn' | 'error' | 'api' | 'render' | 'state' | 'ws';
  source: string;
  message: string;
  data?: unknown;
}

// Global log store
let logId = 0;
const logStore: LogEntry[] = [];
const logListeners: Set<() => void> = new Set();

// Add log entry
export const addDebugLog = (
  type: LogEntry['type'],
  source: string,
  message: string,
  data?: unknown
) => {
  if (!DEBUG_ENABLED) return;
  
  const entry: LogEntry = {
    id: ++logId,
    timestamp: new Date().toISOString().split('T')[1].slice(0, -1),
    type,
    source,
    message,
    data,
  };
  
  logStore.push(entry);
  
  // Keep only last 100 entries
  if (logStore.length > 100) {
    logStore.shift();
  }
  
  // Notify listeners
  logListeners.forEach((listener) => listener());
};

// Hook to subscribe to logs
const useDebugLogs = () => {
  const [logs, setLogs] = useState<LogEntry[]>([...logStore]);
  
  useEffect(() => {
    const listener = () => setLogs([...logStore]);
    logListeners.add(listener);
    return () => {
      logListeners.delete(listener);
    };
  }, []);
  
  return logs;
};

// Type colors
const TYPE_COLORS: Record<LogEntry['type'], string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  api: 'text-cyan-400',
  render: 'text-green-400',
  state: 'text-amber-400',
  ws: 'text-purple-400',
};

const TYPE_BG: Record<LogEntry['type'], string> = {
  info: 'bg-blue-500/10',
  warn: 'bg-yellow-500/10',
  error: 'bg-red-500/10',
  api: 'bg-cyan-500/10',
  render: 'bg-green-500/10',
  state: 'bg-amber-500/10',
  ws: 'bg-purple-500/10',
};

/**
 * DebugPanel - Visual debug information panel
 */
export const DebugPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'logs' | 'state' | 'perf'>('logs');
  const [filter, setFilter] = useState<LogEntry['type'] | 'all'>('all');
  const logs = useDebugLogs();
  
  // Toggle with keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const clearLogs = useCallback(() => {
    logStore.length = 0;
    logListeners.forEach((listener) => listener());
  }, []);
  
  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter((log) => log.type === filter);
  
  if (!DEBUG_ENABLED) return null;
  
  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`
          fixed bottom-4 right-4 z-[9999]
          w-10 h-10 rounded-full
          flex items-center justify-center
          transition-all duration-200
          ${isOpen 
            ? 'bg-sentinel-accent text-sentinel-bg' 
            : 'bg-sentinel-card border border-sentinel-border text-sentinel-muted hover:text-sentinel-accent'
          }
        `}
        title="Toggle Debug Panel (Ctrl+Shift+D)"
      >
        🔧
      </button>
      
      {/* Debug Panel */}
      {isOpen && (
        <div className="fixed bottom-16 right-4 z-[9998] w-[480px] max-h-[70vh] bg-sentinel-card border border-sentinel-border rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-sentinel-bg border-b border-sentinel-border">
            <div className="flex items-center gap-2">
              <span className="text-sentinel-accent">🔧</span>
              <span className="text-sm font-medium text-sentinel-text">Debug Panel</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearLogs}
                className="px-2 py-1 text-xs text-sentinel-muted hover:text-sentinel-text transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="px-2 py-1 text-xs text-sentinel-muted hover:text-sentinel-text transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b border-sentinel-border">
            {(['logs', 'state', 'perf'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  flex-1 px-3 py-2 text-xs font-medium transition-colors
                  ${activeTab === tab 
                    ? 'text-sentinel-accent border-b-2 border-sentinel-accent' 
                    : 'text-sentinel-muted hover:text-sentinel-text'
                  }
                `}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
          
          {/* Content */}
          <div className="overflow-auto max-h-[50vh]">
            {activeTab === 'logs' && (
              <>
                {/* Filter */}
                <div className="flex gap-1 p-2 border-b border-sentinel-border bg-sentinel-bg/50">
                  {(['all', 'api', 'render', 'state', 'ws', 'error'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilter(type)}
                      className={`
                        px-2 py-0.5 text-xs rounded transition-colors
                        ${filter === type 
                          ? 'bg-sentinel-accent/20 text-sentinel-accent' 
                          : 'text-sentinel-muted hover:text-sentinel-text'
                        }
                      `}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                
                {/* Logs */}
                <div className="divide-y divide-sentinel-border/50">
                  {filteredLogs.length === 0 ? (
                    <div className="p-4 text-center text-sentinel-muted text-sm">
                      No logs yet
                    </div>
                  ) : (
                    [...filteredLogs].reverse().map((log) => (
                      <div
                        key={log.id}
                        className={`px-3 py-2 text-xs ${TYPE_BG[log.type]}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sentinel-muted font-mono">
                            {log.timestamp.slice(0, 8)}
                          </span>
                          <span className={`font-medium uppercase ${TYPE_COLORS[log.type]}`}>
                            {log.type}
                          </span>
                          <span className="text-sentinel-text font-medium">
                            {log.source}
                          </span>
                        </div>
                        <div className="mt-1 text-sentinel-muted">
                          {log.message}
                        </div>
                        {log.data && (
                          <pre className="mt-1 text-[10px] text-sentinel-muted/70 overflow-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
            
            {activeTab === 'state' && (
              <div className="p-3 text-xs">
                <div className="mb-3">
                  <h4 className="text-sentinel-muted mb-2">Debug Flags</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(DEBUG_FLAGS).map(([key, value]) => (
                      <div
                        key={key}
                        className={`
                          px-2 py-1 rounded
                          ${value ? 'bg-green-500/10 text-green-400' : 'bg-sentinel-bg text-sentinel-muted'}
                        `}
                      >
                        {key}: {value ? 'ON' : 'OFF'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'perf' && (
              <div className="p-3 text-xs text-sentinel-muted">
                <p>Performance metrics will appear here during operations.</p>
                <p className="mt-2">Enable VITE_DEBUG_PERF=true to track performance.</p>
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="px-3 py-2 bg-sentinel-bg border-t border-sentinel-border text-[10px] text-sentinel-muted">
            Press <kbd className="px-1 bg-sentinel-border rounded">Ctrl</kbd>+
            <kbd className="px-1 bg-sentinel-border rounded">Shift</kbd>+
            <kbd className="px-1 bg-sentinel-border rounded">D</kbd> to toggle
          </div>
        </div>
      )}
    </>
  );
};

export default DebugPanel;