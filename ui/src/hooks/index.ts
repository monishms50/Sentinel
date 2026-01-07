// =============================================================================
// SENTINEL UI - CUSTOM HOOKS
// =============================================================================
// React hooks for data fetching, WebSocket connection, and actions.
// 
// Hook categories:
// 1. Generic fetch hook (useFetch)
// 2. Data fetching hooks (usePods, usePodDetail, etc.)
// 3. Polling hooks (usePollingStats)
// 4. WebSocket hooks (useWebSocket, useRealtimePods)
// 5. Action hooks (usePodActions, useConfig)
// =============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  Pod,
  PodDetail,
  LeaderboardEntry,
  ClusterStats,
  PurgeConfig,
  DriftEvent,
  Baseline,
  ScoreHistoryPoint,
  WSMessage,
  ScoreUpdatePayload,
  PodEventPayload,
  PodStatus,
} from '../types';
import api from '../api/client';

// =============================================================================
// GENERIC FETCH HOOK
// =============================================================================

/**
 * Generic result type for fetch hooks
 */
interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * useFetch - Generic data fetching hook
 * 
 * Purpose: Reusable hook for fetching data from API
 * 
 * @param fetchFn - Function that returns a Promise with data
 * @param deps - Dependencies that trigger refetch
 * @returns { data, loading, error, refetch }
 */
function useFetch<T>(
  fetchFn: () => Promise<T>,
  deps: unknown[] = []
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// =============================================================================
// DATA FETCHING HOOKS
// =============================================================================

/**
 * usePods - Fetch all pods
 * 
 * Source: GET /api/pods
 * Used by: PodManager
 * 
 * @param namespace - Optional namespace filter
 */
export function usePods(namespace?: string): UseFetchResult<Pod[]> {
  return useFetch(() => api.getPods(namespace), [namespace]);
}

/**
 * usePodDetail - Fetch single pod with details
 * 
 * Source: GET /api/pods/:id
 * Used by: PodDetail component
 * 
 * @param uid - Pod UID (null returns null data)
 */
export function usePodDetail(uid: string | null): UseFetchResult<PodDetail | null> {
  return useFetch(
    () => (uid ? api.getPod(uid) : Promise.resolve(null)),
    [uid]
  );
}

/**
 * usePodBaseline - Fetch pod baseline snapshot
 * 
 * Source: GET /api/pods/:id/baseline
 * Used by: PodDetail baseline tab
 * 
 * @param uid - Pod UID
 */
export function usePodBaseline(uid: string | null): UseFetchResult<Baseline | null> {
  return useFetch(
    () => (uid ? api.getPodBaseline(uid) : Promise.resolve(null)),
    [uid]
  );
}

/**
 * usePodHistory - Fetch pod score history
 * 
 * Source: GET /api/pods/:id/history
 * Used by: ScoreChart component
 * 
 * @param uid - Pod UID
 */
export function usePodHistory(uid: string | null): UseFetchResult<ScoreHistoryPoint[]> {
  return useFetch(
    () => (uid ? api.getPodHistory(uid) : Promise.resolve([])),
    [uid]
  );
}

/**
 * useLeaderboard - Fetch pod leaderboard
 * 
 * Source: GET /api/leaderboard
 * Used by: Leaderboard component
 * 
 * @param limit - Max entries to fetch
 */
export function useLeaderboard(limit = 50): UseFetchResult<LeaderboardEntry[]> {
  return useFetch(() => api.getLeaderboard(limit), [limit]);
}

/**
 * useStats - Fetch cluster statistics (one-time)
 * 
 * Source: GET /api/stats
 * Used by: ClusterHealth (but prefer usePollingStats)
 */
export function useStats(): UseFetchResult<ClusterStats> {
  return useFetch(() => api.getStats(), []);
}

/**
 * useRecentEvents - Fetch recent drift events
 * 
 * Source: GET /api/events
 * Used by: EventsFeed component
 * 
 * @param limit - Max events to fetch
 */
export function useRecentEvents(limit = 50): UseFetchResult<DriftEvent[]> {
  return useFetch(() => api.getRecentEvents(limit), [limit]);
}

// =============================================================================
// POLLING HOOKS
// =============================================================================

/**
 * usePollingStats - Fetch stats with automatic polling
 * 
 * Purpose: Keeps cluster stats up-to-date by polling API
 * 
 * Source: GET /api/stats (every intervalMs)
 * Used by: App.tsx, ClusterHealth
 * 
 * @param intervalMs - Polling interval in milliseconds
 * @returns { stats, loading, error, refetch }
 */
interface UsePollingStatsResult {
  stats: ClusterStats | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function usePollingStats(intervalMs = 5000): UsePollingStatsResult {
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch function
  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getStats();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and setup polling
  useEffect(() => {
    fetchStats();

    // Set up polling interval
    intervalRef.current = setInterval(fetchStats, intervalMs);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchStats, intervalMs]);

  return { stats, loading, error, refetch: fetchStats };
}

// =============================================================================
// WEBSOCKET HOOKS
// =============================================================================

/**
 * WebSocket URL configuration
 */
function getWebSocketUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const apiBase = import.meta.env.VITE_API_URL || '';
  
  if (apiBase) {
    // If API URL is configured, use it
    const url = new URL(apiBase);
    return `${wsProtocol}//${url.host}/api/ws/scores`;
  }
  
  // Default to same host
  return `${wsProtocol}//${window.location.host}/api/ws/scores`;
}

/**
 * useWebSocket - Low-level WebSocket connection hook
 * 
 * Purpose: Manages WebSocket connection lifecycle
 * 
 * @param onMessage - Callback for incoming messages
 * @returns { isConnected, send }
 */
interface UseWebSocketResult {
  isConnected: boolean;
  send: (message: unknown) => void;
}

export function useWebSocket(
  onMessage: (message: WSMessage) => void
): UseWebSocketResult {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onMessageRef = useRef(onMessage);

  // Keep onMessage ref updated
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(getWebSocketUrl());

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);

        // Send subscribe message
        ws.send(JSON.stringify({ type: 'subscribe' }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          onMessageRef.current(message);
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);

        // Attempt reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[WebSocket] Attempting reconnect...');
          connect();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[WebSocket] Failed to connect:', err);
    }
  }, []);

  // Initialize connection
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Send message function
  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { isConnected, send };
}

/**
 * useRealtimePods - Pods with real-time WebSocket updates
 * 
 * Purpose: Combines initial API fetch with WebSocket updates
 * 
 * Source: 
 *   - Initial: GET /api/leaderboard
 *   - Updates: WebSocket score_update, pod_added, pod_removed
 * 
 * Used by: App.tsx → Leaderboard, PodManager
 * 
 * @returns { pods, isConnected, loading, error, refetch }
 */
interface UseRealtimePodsResult {
  pods: Pod[];
  isConnected: boolean;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useRealtimePods(): UseRealtimePodsResult {
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Initial fetch
  const fetchPods = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPods();
      setPods(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPods();
  }, [fetchPods]);

  /**
   * Handle WebSocket messages
   * 
   * Message types:
   * - score_update: Update existing pod's score
   * - pod_added: Add new pod to list
   * - pod_removed: Remove pod from list
   */
  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'score_update': {
        const payload = message.payload as ScoreUpdatePayload;
        setPods((prev) =>
          prev.map((pod) =>
            pod.uid === payload.podUID
              ? { ...pod, score: payload.score, status: payload.status }
              : pod
          )
        );
        break;
      }

      case 'pod_added': {
        const payload = message.payload as PodEventPayload;
        // Refetch to get full pod data
        // Could optimize by fetching just the new pod
        fetchPods();
        break;
      }

      case 'pod_removed': {
        const payload = message.payload as PodEventPayload;
        setPods((prev) => prev.filter((pod) => pod.uid !== payload.podUID));
        break;
      }
    }
  }, [fetchPods]);

  // Connect to WebSocket
  const { isConnected } = useWebSocket(handleMessage);

  return { pods, isConnected, loading, error, refetch: fetchPods };
}

// =============================================================================
// CONFIG HOOK
// =============================================================================

/**
 * useConfig - Fetch and update purge configuration
 * 
 * Source: GET /api/config, PUT /api/config
 * Used by: PurgeConfig component
 * 
 * @returns { config, loading, error, updateConfig, refetch }
 */
interface UseConfigResult {
  config: PurgeConfig | null;
  loading: boolean;
  error: Error | null;
  updateConfig: (config: Partial<PurgeConfig>) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useConfig(): UseConfigResult {
  const { data, loading, error, refetch } = useFetch(() => api.getConfig(), []);

  /**
   * updateConfig - Update purge configuration
   * 
   * Sends: PUT /api/config with new settings
   * Backend: Updates ConfigMap, restarts controller if needed
   */
  const updateConfig = useCallback(async (newConfig: Partial<PurgeConfig>) => {
    await api.updateConfig(newConfig);
    await refetch(); // Refetch to get updated config
  }, [refetch]);

  return { config: data, loading, error, updateConfig, refetch };
}

// =============================================================================
// ACTION HOOKS
// =============================================================================

/**
 * usePodActions - Actions that can be performed on pods
 * 
 * Used by: PodManager, PodDetail
 * 
 * @returns { deletePod, loading, error }
 */
interface UsePodActionsResult {
  deletePod: (uid: string) => Promise<void>;
  loading: boolean;
  error: Error | null;
}

export function usePodActions(): UsePodActionsResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * deletePod - Delete/purge a pod
   * 
   * Sends: DELETE /api/pods/:id
   * Backend:
   *   1. Calls Kubernetes API to delete pod
   *   2. Pod's controller (Deployment/StatefulSet) creates replacement
   *   3. New pod starts fresh with clean baseline
   * 
   * @param uid - Pod UID to delete
   */
  const deletePod = useCallback(async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      await api.deletePod(uid);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { deletePod, loading, error };
}

// =============================================================================
// EVENTS HOOK WITH REALTIME
// =============================================================================

/**
 * useRealtimeEvents - Events with real-time WebSocket updates
 * 
 * Purpose: Combines initial fetch with WebSocket drift_event updates
 * 
 * Source:
 *   - Initial: GET /api/events
 *   - Updates: WebSocket drift_event messages
 * 
 * @param limit - Max events to fetch initially
 */
interface UseRealtimeEventsResult {
  events: DriftEvent[];
  isConnected: boolean;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useRealtimeEvents(limit = 100): UseRealtimeEventsResult {
  const [events, setEvents] = useState<DriftEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Initial fetch
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getRecentEvents(limit);
      setEvents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Handle WebSocket messages
  const handleMessage = useCallback((message: WSMessage) => {
    if (message.type === 'drift_event') {
      const newEvent = message.payload as DriftEvent;
      setEvents((prev) => {
        // Add to beginning, keep max limit
        const updated = [newEvent, ...prev];
        return updated.slice(0, limit);
      });
    }
  }, [limit]);

  const { isConnected } = useWebSocket(handleMessage);

  return { events, isConnected, loading, error, refetch: fetchEvents };
}