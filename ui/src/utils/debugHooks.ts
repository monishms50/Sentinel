// =============================================================================
// SENTINEL UI - DEBUG HOOKS
// =============================================================================
// React hooks for component-level debugging.
// These hooks are no-ops when debug mode is disabled.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { debug, perf, DEBUG_ENABLED, DEBUG_FLAGS } from './debug';

/**
 * useDebugRender - Log when a component renders and why
 * 
 * Usage:
 *   useDebugRender('MyComponent', { prop1, prop2 });
 */
export function useDebugRender(
  componentName: string,
  props?: Record<string, unknown>
): void {
  const renderCount = useRef(0);
  const prevProps = useRef<Record<string, unknown>>();

  useEffect(() => {
    if (!DEBUG_FLAGS.render) return;

    renderCount.current += 1;

    // Find changed props
    const changedProps: string[] = [];
    if (prevProps.current && props) {
      Object.keys(props).forEach((key) => {
        if (prevProps.current![key] !== props[key]) {
          changedProps.push(key);
        }
      });
    }

    console.groupCollapsed(
      `%c[RENDER]%c ${componentName} %c#${renderCount.current}`,
      'color: #00ff9f; font-weight: bold',
      'color: inherit',
      'color: #6b7280'
    );
    
    if (props) {
      console.log('Props:', props);
    }
    
    if (changedProps.length > 0) {
      console.log('%cChanged props:', 'color: #fbbf24', changedProps);
    }
    
    console.groupEnd();
    
    prevProps.current = props ? { ...props } : undefined;
  });
}

/**
 * useDebugState - useState wrapper that logs state changes
 * 
 * Usage:
 *   const [count, setCount] = useDebugState('MyComponent.count', 0);
 */
export function useDebugState<T>(
  name: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialValue);
  
  const setDebugState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === 'function' 
          ? (value as (prev: T) => T)(prev) 
          : value;
        
        if (DEBUG_FLAGS.state) {
          debug.state(name, prev, next);
        }
        
        return next;
      });
    },
    [name]
  );
  
  return [state, setDebugState];
}

/**
 * useDebugEffect - useEffect wrapper that logs when effects run
 * 
 * Usage:
 *   useDebugEffect('MyComponent.fetchData', () => {
 *     fetchData();
 *   }, [dependency]);
 */
export function useDebugEffect(
  name: string,
  effect: () => void | (() => void),
  deps?: React.DependencyList
): void {
  const runCount = useRef(0);
  const prevDeps = useRef<React.DependencyList>();

  useEffect(() => {
    if (DEBUG_FLAGS.render) {
      runCount.current += 1;
      
      // Find changed dependencies
      const changedDeps: number[] = [];
      if (prevDeps.current && deps) {
        deps.forEach((dep, i) => {
          if (prevDeps.current![i] !== dep) {
            changedDeps.push(i);
          }
        });
      }

      console.groupCollapsed(
        `%c[EFFECT]%c ${name} %c#${runCount.current}`,
        'color: #a78bfa; font-weight: bold',
        'color: inherit',
        'color: #6b7280'
      );
      
      if (deps) {
        console.log('Dependencies:', deps);
      }
      
      if (changedDeps.length > 0) {
        console.log('%cChanged indices:', 'color: #fbbf24', changedDeps);
      }
      
      console.groupEnd();
      
      prevDeps.current = deps ? [...deps] : undefined;
    }
    
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * useDebugMemo - Track expensive computations
 * 
 * Usage:
 *   const result = useDebugMemo('expensiveCalc', () => calc(), [dep]);
 */
export function useDebugMemo<T>(
  name: string,
  factory: () => T,
  deps: React.DependencyList
): T {
  const resultRef = useRef<T>();
  const prevDeps = useRef<React.DependencyList>();
  
  // Check if deps changed
  const depsChanged = !prevDeps.current || deps.some((dep, i) => dep !== prevDeps.current![i]);
  
  if (depsChanged) {
    if (DEBUG_FLAGS.performance) {
      perf.start(name);
    }
    
    resultRef.current = factory();
    
    if (DEBUG_FLAGS.performance) {
      perf.end(name);
    }
    
    prevDeps.current = [...deps];
  }
  
  return resultRef.current as T;
}

/**
 * useDebugAsync - Track async operations
 * 
 * Usage:
 *   const { loading, error, execute } = useDebugAsync('fetchPods', fetchPods);
 */
export function useDebugAsync<T, A extends unknown[]>(
  name: string,
  asyncFn: (...args: A) => Promise<T>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const execute = useCallback(
    async (...args: A): Promise<T | undefined> => {
      setLoading(true);
      setError(null);
      
      if (DEBUG_FLAGS.api) {
        debug.info(name, 'Starting async operation', { args });
        perf.start(name);
      }
      
      try {
        const result = await asyncFn(...args);
        
        if (DEBUG_FLAGS.api) {
          perf.end(name);
          debug.info(name, 'Completed successfully', { result });
        }
        
        setLoading(false);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        
        if (DEBUG_FLAGS.api) {
          perf.end(name);
          debug.error(name, error);
        }
        
        setError(error);
        setLoading(false);
        return undefined;
      }
    },
    [name, asyncFn]
  );
  
  return { loading, error, execute };
}

/**
 * useDebugWhyDidYouRender - Deep analysis of why component re-rendered
 * 
 * Usage:
 *   useDebugWhyDidYouRender('MyComponent', props);
 */
export function useDebugWhyDidYouRender(
  componentName: string,
  props: Record<string, unknown>
): void {
  const prevProps = useRef<Record<string, unknown>>();
  
  useEffect(() => {
    if (!DEBUG_ENABLED) return;
    
    if (prevProps.current) {
      const allKeys = new Set([
        ...Object.keys(prevProps.current),
        ...Object.keys(props),
      ]);
      
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      
      allKeys.forEach((key) => {
        const prev = prevProps.current![key];
        const next = props[key];
        
        if (prev !== next) {
          changes[key] = { from: prev, to: next };
        }
      });
      
      if (Object.keys(changes).length > 0) {
        console.group(
          `%c[WHY-RENDER]%c ${componentName}`,
          'color: #f472b6; font-weight: bold',
          'color: inherit'
        );
        
        Object.entries(changes).forEach(([key, { from, to }]) => {
          console.log(`%c${key}:`, 'color: #fbbf24', { from, to });
          
          // Deep equality check for objects
          if (
            typeof from === 'object' &&
            typeof to === 'object' &&
            JSON.stringify(from) === JSON.stringify(to)
          ) {
            console.log(
              '%c  ⚠️ Objects are deeply equal but referentially different!',
              'color: #ff6b6b'
            );
          }
        });
        
        console.groupEnd();
      }
    }
    
    prevProps.current = { ...props };
  });
}