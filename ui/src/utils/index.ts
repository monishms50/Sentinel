// =============================================================================
// SENTINEL UI - DEBUG UTILITIES EXPORT
// =============================================================================
// Single import point for all debug utilities.
// 
// Usage:
//   import { debug, useDebugRender, DebugErrorBoundary } from '@/utils/debug';
// =============================================================================

// Core debug utilities
export {
  DEBUG_ENABLED,
  DEBUG_FLAGS,
  debug,
  perf,
  initDebug,
} from './debug';

// React hooks
export {
  useDebugRender,
  useDebugState,
  useDebugEffect,
  useDebugMemo,
  useDebugAsync,
  useDebugWhyDidYouRender,
} from './debugHooks';

// Components
export {
  DebugErrorBoundary,
  withErrorBoundary,
} from './DebugErrorBoundary';

export {
  DebugPanel,
  addDebugLog,
} from './DebugPanel';