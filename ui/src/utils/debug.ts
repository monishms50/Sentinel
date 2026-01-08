// =============================================================================
// SENTINEL UI - DEBUG UTILITY
// =============================================================================
// Simple, effective debugging system controlled via environment variables.
// 
// Enable in .env:
//   VITE_DEBUG=true           # Enable all debugging
//   VITE_DEBUG_LEVEL=verbose  # Options: error, warn, info, verbose
//   VITE_DEBUG_API=true       # Log API calls
//   VITE_DEBUG_RENDER=true    # Log component renders
//   VITE_DEBUG_STATE=true     # Log state changes
// =============================================================================

// Check if debug mode is enabled
export const DEBUG_ENABLED = import.meta.env.VITE_DEBUG === 'true';

// Debug levels
type DebugLevel = 'error' | 'warn' | 'info' | 'verbose';
const DEBUG_LEVEL: DebugLevel = (import.meta.env.VITE_DEBUG_LEVEL as DebugLevel) || 'info';

// Feature-specific debug flags
export const DEBUG_FLAGS = {
  api: import.meta.env.VITE_DEBUG_API === 'true' || DEBUG_ENABLED,
  render: import.meta.env.VITE_DEBUG_RENDER === 'true' || DEBUG_ENABLED,
  state: import.meta.env.VITE_DEBUG_STATE === 'true' || DEBUG_ENABLED,
  websocket: import.meta.env.VITE_DEBUG_WS === 'true' || DEBUG_ENABLED,
  performance: import.meta.env.VITE_DEBUG_PERF === 'true' || DEBUG_ENABLED,
};

// Level priority for filtering
const LEVEL_PRIORITY: Record<DebugLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
};

// Styled console output colors
const STYLES = {
  component: 'color: #00ff9f; font-weight: bold',
  api: 'color: #00d4ff; font-weight: bold',
  state: 'color: #fbbf24; font-weight: bold',
  websocket: 'color: #a78bfa; font-weight: bold',
  performance: 'color: #f472b6; font-weight: bold',
  error: 'color: #ff6b6b; font-weight: bold',
  warn: 'color: #fbbf24; font-weight: bold',
  info: 'color: #60a5fa; font-weight: bold',
  timestamp: 'color: #6b7280; font-size: 10px',
  data: 'color: #9ca3af',
};

// Get timestamp
const getTimestamp = () => new Date().toISOString().split('T')[1].slice(0, -1);

// Check if should log based on level
const shouldLog = (level: DebugLevel): boolean => {
  if (!DEBUG_ENABLED) return false;
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[DEBUG_LEVEL];
};

// =============================================================================
// MAIN DEBUG LOGGER
// =============================================================================
export const debug = {
  /**
   * Log component render
   */
  render: (componentName: string, props?: Record<string, unknown>) => {
    if (!DEBUG_FLAGS.render || !shouldLog('verbose')) return;
    
    console.groupCollapsed(
      `%c[RENDER]%c ${componentName} %c${getTimestamp()}`,
      STYLES.component,
      'color: inherit',
      STYLES.timestamp
    );
    if (props) {
      console.log('%cProps:', STYLES.data, props);
    }
    console.trace('Render stack');
    console.groupEnd();
  },

  /**
   * Log API calls
   */
  api: (method: string, url: string, data?: unknown, response?: unknown) => {
    if (!DEBUG_FLAGS.api || !shouldLog('info')) return;
    
    console.groupCollapsed(
      `%c[API]%c ${method} ${url} %c${getTimestamp()}`,
      STYLES.api,
      'color: inherit',
      STYLES.timestamp
    );
    if (data) console.log('%cRequest:', STYLES.data, data);
    if (response) console.log('%cResponse:', STYLES.data, response);
    console.groupEnd();
  },

  /**
   * Log state changes
   */
  state: (source: string, prevState: unknown, nextState: unknown) => {
    if (!DEBUG_FLAGS.state || !shouldLog('info')) return;
    
    console.groupCollapsed(
      `%c[STATE]%c ${source} %c${getTimestamp()}`,
      STYLES.state,
      'color: inherit',
      STYLES.timestamp
    );
    console.log('%cPrevious:', STYLES.data, prevState);
    console.log('%cNext:', STYLES.data, nextState);
    console.groupEnd();
  },

  /**
   * Log WebSocket events
   */
  ws: (event: string, data?: unknown) => {
    if (!DEBUG_FLAGS.websocket || !shouldLog('info')) return;
    
    console.log(
      `%c[WS]%c ${event} %c${getTimestamp()}`,
      STYLES.websocket,
      'color: inherit',
      STYLES.timestamp,
      data || ''
    );
  },

  /**
   * Log errors
   */
  error: (source: string, error: Error | string, context?: Record<string, unknown>) => {
    if (!shouldLog('error')) return;
    
    console.group(
      `%c[ERROR]%c ${source} %c${getTimestamp()}`,
      STYLES.error,
      'color: inherit',
      STYLES.timestamp
    );
    console.error(error);
    if (context) console.log('%cContext:', STYLES.data, context);
    console.trace('Error stack');
    console.groupEnd();
  },

  /**
   * Log warnings
   */
  warn: (source: string, message: string, data?: unknown) => {
    if (!shouldLog('warn')) return;
    
    console.warn(
      `%c[WARN]%c ${source}: ${message} %c${getTimestamp()}`,
      STYLES.warn,
      'color: inherit',
      STYLES.timestamp,
      data || ''
    );
  },

  /**
   * Log info
   */
  info: (source: string, message: string, data?: unknown) => {
    if (!shouldLog('info')) return;
    
    console.log(
      `%c[INFO]%c ${source}: ${message} %c${getTimestamp()}`,
      STYLES.info,
      'color: inherit',
      STYLES.timestamp,
      data || ''
    );
  },

  /**
   * Log verbose/trace info
   */
  verbose: (source: string, message: string, data?: unknown) => {
    if (!shouldLog('verbose')) return;
    
    console.log(
      `%c[TRACE]%c ${source}: ${message} %c${getTimestamp()}`,
      STYLES.data,
      'color: inherit',
      STYLES.timestamp,
      data || ''
    );
  },
};

// =============================================================================
// PERFORMANCE TRACKING
// =============================================================================
const perfMarks = new Map<string, number>();

export const perf = {
  /**
   * Start timing an operation
   */
  start: (label: string) => {
    if (!DEBUG_FLAGS.performance) return;
    perfMarks.set(label, performance.now());
  },

  /**
   * End timing and log result
   */
  end: (label: string, threshold = 16) => {
    if (!DEBUG_FLAGS.performance) return;
    
    const startTime = perfMarks.get(label);
    if (!startTime) return;
    
    const duration = performance.now() - startTime;
    perfMarks.delete(label);
    
    const style = duration > threshold ? STYLES.warn : STYLES.performance;
    console.log(
      `%c[PERF]%c ${label}: ${duration.toFixed(2)}ms %c${getTimestamp()}`,
      style,
      'color: inherit',
      STYLES.timestamp
    );
  },

  /**
   * Measure a function execution
   */
  measure: <T>(label: string, fn: () => T): T => {
    if (!DEBUG_FLAGS.performance) return fn();
    
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    console.log(
      `%c[PERF]%c ${label}: ${duration.toFixed(2)}ms`,
      STYLES.performance,
      'color: inherit'
    );
    
    return result;
  },
};

// =============================================================================
// DEBUG INITIALIZATION
// =============================================================================
export const initDebug = () => {
  if (!DEBUG_ENABLED) return;
  
  console.log(
    '%c🔧 Sentinel Debug Mode Enabled',
    'color: #00ff9f; font-size: 14px; font-weight: bold'
  );
  console.log('%cDebug Level:', 'color: #9ca3af', DEBUG_LEVEL);
  console.log('%cActive Flags:', 'color: #9ca3af', DEBUG_FLAGS);
  console.log('%c─'.repeat(50), 'color: #1f2937');
  
  // Expose debug utilities globally for console access
  (window as unknown as Record<string, unknown>).__SENTINEL_DEBUG__ = {
    debug,
    perf,
    flags: DEBUG_FLAGS,
    level: DEBUG_LEVEL,
  };
  
  console.log(
    '%cTip: Access debug utils via window.__SENTINEL_DEBUG__',
    'color: #6b7280; font-style: italic'
  );
};