import { useState, useEffect, useCallback, useRef } from 'react';
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
} from '../types';
import api from '../api/client';

// ============================================================================
// GENERIC FETCH HOOK
// ============================================================================

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

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

// ============================================================================
// DATA FETCHING HOOKS
// ============================================================================

export function usePods(namespace?: string): UseFetchResult<Pod[]> {
  return useFetch(() => api.getPods(namespace), [namespace]);
}

export function usePodDetail(uid: string | null): UseFetchResult<PodDetail | null> {
  return useFetch(
    () => (uid ? api.getPod(uid) : Promise.resolve(null)),
    [uid]
  );
}

export function usePodBaseline(uid: string | null): UseFetchResult<Baseline | null> {
  return useFetch(
    () => (uid ? api.getPodBaseline(uid) : Promise.resolve(null)),
    [uid]
  );
}

export function usePodHistory(uid: string | null): UseFetchResult<ScoreHistoryPoint[]> {
  return useFetch(
    () => (uid ? api.getPodHistory(uid) : Promise.resolve([])),
    [uid]
  );
}

export function useLeaderboard(limit = 50): UseFetchResult<LeaderboardEntry[]> {
  return useFetch(() => api.getLeaderboard(limit), [limit]);
}

export function useStats(): UseFetchResult<ClusterStats> {
  return useFetch(() => api.getStats(), []);
}

export function useRecentEvents(limit = 50): UseFetchResult<DriftEvent[]> {
  return useFetch(() => api.getRecentEvents(limit), [limit]);
}

// ============================================================================
// CONFIG HOOK
// ============================================================================

interface UseConfigResult {
  config: PurgeConfig | null;
  loading: boolean;
  error: Error | null;
  updateConfig: (config: Partial<PurgeConfig>) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useConfig(): UseConfigResult {
  const { data, loading, error, refetch } = useFetch(() => api.getConfig(), []);

  const updateConfig = useCallback(async (config: Partial<PurgeConfig>) => {
    await api.updateConfig(config);
    await refetch();
  }, [refetch]);

  return { config: data, loading, error, updateConfig, refetch };
}

// ============================================================================
// WEBSOCKET HOOK
// ============================================================================

interface UseWebSocketResult {
  isConnected: boolean;
  lastMessage: WSMessage | null;
}

export function useWebSocket(url: string): UseWebSocketResult {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
        console.log('[WS] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          setLastMessage(message);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log('[WS] Disconnected');
        
        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err);
    }
  }, [url]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, lastMessage };
}

// ============================================================================
// REAL-TIME HOOKS
// ============================================================================

interface UseRealtimePodsResult {
  pods: Pod[];
  loading: boolean;
  error: Error | null;
  isConnected: boolean;
  refetch: () => Promise<void>;
}

export function useRealtimePods(): UseRealtimePodsResult {
  const { data: initialPods, loading, error, refetch } = usePods();
  const [pods, setPods] = useState<Pod[]>([]);
  
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/scores`;
  const { isConnected, lastMessage } = useWebSocket(wsUrl);

  // Initialize with fetched data
  useEffect(() => {
    if (initialPods) {
      setPods(initialPods);
    }
  }, [initialPods]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'score_update': {
        const payload = lastMessage.payload as ScoreUpdatePayload;
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
        refetch();
        break;
      }
      case 'pod_removed': {
        const payload = lastMessage.payload as PodEventPayload;
        setPods((prev) => prev.filter((pod) => pod.uid !== payload.podUID));
        break;
      }
    }
  }, [lastMessage, refetch]);

  return { pods, loading, error, isConnected, refetch };
}

interface UseRealtimeEventsResult {
  events: DriftEvent[];
  loading: boolean;
  error: Error | null;
}

export function useRealtimeEvents(limit = 50): UseRealtimeEventsResult {
  const { data: initialEvents, loading, error } = useRecentEvents(limit);
  const [events, setEvents] = useState<DriftEvent[]>([]);
  
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/ws/scores`;
  const { lastMessage } = useWebSocket(wsUrl);

  useEffect(() => {
    if (initialEvents) {
      setEvents(initialEvents);
    }
  }, [initialEvents]);

  useEffect(() => {
    if (lastMessage?.type === 'drift_event') {
      const newEvent = lastMessage.payload as DriftEvent;
      setEvents((prev) => [newEvent, ...prev.slice(0, limit - 1)]);
    }
  }, [lastMessage, limit]);

  return { events, loading, error };
}

// ============================================================================
// POLLING HOOKS
// ============================================================================

export function usePollingStats(intervalMs = 5000): UseFetchResult<ClusterStats> & { isPolling: boolean } {
  const result = useStats();
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    if (!isPolling) return;
    
    const interval = setInterval(result.refetch, intervalMs);
    return () => clearInterval(interval);
  }, [result.refetch, intervalMs, isPolling]);

  return { ...result, isPolling };
}

// ============================================================================
// ACTION HOOKS
// ============================================================================

interface UsePodActionsResult {
  deletePod: (uid: string) => Promise<void>;
  isDeleting: boolean;
  deleteError: Error | null;
}

export function usePodActions(): UsePodActionsResult {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<Error | null>(null);

  const deletePod = useCallback(async (uid: string) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.deletePod(uid);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setDeleteError(error);
      throw error;
    } finally {
      setIsDeleting(false);
    }
  }, []);

  return { deletePod, isDeleting, deleteError };
}
