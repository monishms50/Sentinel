# Sentinel UI Debug System

A simple, effective debugging system that can be toggled on/off via `.env` files.

## Quick Start

1. **Enable debugging** in your `.env` file:
```bash
VITE_DEBUG=true
```

2. **Start the dev server**:
```bash
npm run dev
```

3. **Open browser console** to see debug output, or press `Ctrl+Shift+D` for the visual debug panel.

---

## Configuration

All debug settings are controlled via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_DEBUG` | `false` | Master switch - enables all debugging |
| `VITE_DEBUG_LEVEL` | `info` | Log level: `error`, `warn`, `info`, `verbose` |
| `VITE_DEBUG_API` | `false` | Log API requests/responses |
| `VITE_DEBUG_RENDER` | `false` | Log component renders |
| `VITE_DEBUG_STATE` | `false` | Log state changes |
| `VITE_DEBUG_WS` | `false` | Log WebSocket events |
| `VITE_DEBUG_PERF` | `false` | Log performance metrics |

### Example Configurations

**Full debugging (development):**
```env
VITE_DEBUG=true
VITE_DEBUG_LEVEL=verbose
```

**API debugging only:**
```env
VITE_DEBUG_API=true
```

**Performance analysis:**
```env
VITE_DEBUG_PERF=true
```

---

## Usage

### 1. Initialize Debug System

In your `main.tsx` or `App.tsx`:

```tsx
import { initDebug } from './utils';

// Call once at app startup
initDebug();
```

### 2. Debug Logging

```tsx
import { debug } from './utils';

// Info logging
debug.info('ComponentName', 'User clicked button', { buttonId: 'submit' });

// API calls
debug.api('GET', '/api/pods', undefined, responseData);

// Errors
debug.error('FetchPods', error, { userId: 123 });

// Warnings
debug.warn('Cache', 'Cache miss', { key: 'user-data' });

// State changes
debug.state('App.pods', previousPods, newPods);

// WebSocket events
debug.ws('message', { type: 'score_update', score: 85 });
```

### 3. React Hooks

**useDebugRender** - Log when components render:
```tsx
function MyComponent({ data, filter }) {
  useDebugRender('MyComponent', { data, filter });
  // ...
}
```

**useDebugState** - Track state changes:
```tsx
function MyComponent() {
  const [count, setCount] = useDebugState('MyComponent.count', 0);
  // Logs: [STATE] MyComponent.count { prev: 0, next: 1 }
}
```

**useDebugEffect** - Track effect execution:
```tsx
function MyComponent({ id }) {
  useDebugEffect('MyComponent.fetchData', () => {
    fetchData(id);
  }, [id]);
  // Logs: [EFFECT] MyComponent.fetchData #1 { deps: [123] }
}
```

**useDebugWhyDidYouRender** - Find unnecessary re-renders:
```tsx
function MyComponent(props) {
  useDebugWhyDidYouRender('MyComponent', props);
  // Logs detailed prop change analysis
}
```

### 4. Error Boundaries

Wrap components to catch and display errors:

```tsx
import { DebugErrorBoundary } from './utils';

function App() {
  return (
    <DebugErrorBoundary name="Leaderboard">
      <Leaderboard />
    </DebugErrorBoundary>
  );
}
```

Or use the HOC:

```tsx
import { withErrorBoundary } from './utils';

export default withErrorBoundary(Leaderboard, 'Leaderboard');
```

### 5. Performance Tracking

```tsx
import { perf } from './utils';

// Manual timing
perf.start('expensiveOperation');
doExpensiveWork();
perf.end('expensiveOperation'); // Logs: [PERF] expensiveOperation: 45.23ms

// Measure function
const result = perf.measure('calculation', () => {
  return heavyCalculation();
});
```

### 6. Debug Panel

The visual debug panel shows live logs and can be toggled with `Ctrl+Shift+D`:

```tsx
import { DebugPanel } from './utils';

function App() {
  return (
    <>
      <YourApp />
      <DebugPanel /> {/* Only renders when VITE_DEBUG=true */}
    </>
  );
}
```

---

## Console Output Examples

When debugging is enabled, you'll see color-coded output:

```
🔧 Sentinel Debug Mode Enabled
Debug Level: info
Active Flags: { api: true, render: true, state: true, ... }
──────────────────────────────────────────────────────

[RENDER] App #1                           12:34:56.789
  Props: { podCount: 0, hasStats: false }

[API] GET /api/stats                      12:34:56.790
  Response: { totalPods: 12, healthyPods: 9, ... }

[STATE] App.pods                          12:34:56.801
  Previous: []
  Next: [{ name: 'web-frontend-x7k2p', score: 99 }, ...]

[WS] connected                            12:34:57.123

[ERROR] FetchData                         12:34:58.456
  Error: Network request failed
  Context: { endpoint: '/api/events' }
```

---

## Browser Console Access

Debug utilities are exposed globally for console access:

```javascript
// In browser console
window.__SENTINEL_DEBUG__.debug.info('Test', 'Hello from console');
window.__SENTINEL_DEBUG__.flags  // View active flags
window.__SENTINEL_DEBUG__.level  // View current log level
```

---

## Best Practices

1. **Use descriptive names**: `useDebugRender('PodLeaderboard.Row', props)`

2. **Include relevant context**: `debug.error('API', error, { endpoint, userId })`

3. **Wrap risky components**: Use `DebugErrorBoundary` around components that might fail

4. **Track performance**: Use `perf.measure()` for expensive operations

5. **Clean production builds**: All debug code is tree-shaken when `VITE_DEBUG=false`

---

## File Structure

```
src/utils/
├── debug.ts              # Core logging utilities
├── debugHooks.ts         # React hooks for debugging
├── DebugErrorBoundary.tsx # Error boundary component
├── DebugPanel.tsx        # Visual debug panel
└── index.ts              # Barrel exports
```