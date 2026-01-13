// =============================================================================
// SENTINEL UI - APP COMPONENT (WITH DEBUG INTEGRATION)
// =============================================================================
// Example showing how to integrate debug utilities throughout the app.
// =============================================================================

import { useEffect, useState } from 'react';
import { 
  Layout, 
  ClusterHealth, 
  Leaderboard, 
  EventsFeed,
  PodDetail,
} from './components';




// Import debug utilities
import { 
  initDebug,
  debug,
  useDebugRender,
  useDebugState,
  useDebugEffect,
  DebugErrorBoundary,
  DebugPanel,
} from './utils';

// Types
import type { Pod, ClusterStats, DriftEvent } from './types';

// Initialize debug system on app load
initDebug();

// =============================================================================
// MAIN APP COMPONENT
// =============================================================================
function App() {
  // Use debug-aware state hooks in development
  const [pods, setPods] = useDebugState<Pod[]>('App.pods', []);
  const [stats, setStats] = useDebugState<ClusterStats | null>('App.stats', null);
  const [events, setEvents] = useDebugState<DriftEvent[]>('App.events', []);
  const [selectedPod, setSelectedPod] = useDebugState<Pod | null>('App.selectedPod', null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Log renders with props
  useDebugRender('App', { 
    podCount: pods.length, 
    hasStats: !!stats, 
    isConnected 
  });

  // Fetch initial data with debug logging
  useDebugEffect('App.fetchInitialData', () => {
    const fetchData = async () => {
      debug.info('App', 'Fetching initial data...');
      
      try {
        // Fetch stats
        debug.api('GET', '/api/stats');
        const statsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/stats`);
        const statsData = await statsRes.json();
        debug.api('GET', '/api/stats', undefined, statsData);
        setStats(statsData);

        // Fetch leaderboard
        debug.api('GET', '/api/leaderboard');
        const podsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/leaderboard`);
        const podsData = await podsRes.json();
        debug.api('GET', '/api/leaderboard', undefined, podsData);
        setPods(podsData.pods || []);

        // Fetch events
        debug.api('GET', '/api/events');
        const eventsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/events`);
        const eventsData = await eventsRes.json();
        debug.api('GET', '/api/events', undefined, eventsData);
        setEvents(eventsData.events || []);

        debug.info('App', 'Initial data loaded successfully');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to fetch data');
        debug.error('App', error, { phase: 'initialFetch' });
        setError(error.message);
      }
    };

    fetchData();
  }, []);

  // WebSocket connection with debug logging
  useDebugEffect('App.websocket', () => {
    const wsUrl = `${import.meta.env.VITE_API_URL?.replace('http', 'ws')}/api/ws/scores`;
    debug.ws('connecting', { url: wsUrl });
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      debug.ws('connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        debug.ws('message', data);
        
        // Handle different message types
        if (data.type === 'score_update') {
          setPods((prev) => 
            prev.map((pod) => 
              pod.name === data.pod ? { ...pod, score: data.score } : pod
            )
          );
        }
      } catch (err) {
        debug.error('WebSocket', err instanceof Error ? err : new Error('Parse error'));
      }
    };

    ws.onerror = (event) => {
      debug.error('WebSocket', new Error('Connection error'), { event });
    };

    ws.onclose = () => {
      debug.ws('disconnected');
      setIsConnected(false);
    };

    return () => {
      debug.ws('cleanup');
      ws.close();
    };
  }, []);

  // Handle pod selection
  const handlePodSelect = (pod: Pod) => {
    debug.info('App', 'Pod selected', { pod: pod.name });
    setSelectedPod(pod);
  };

  return (
    <DebugErrorBoundary name="App">
      <Layout
        header={{
          isConnected,
          totalPods: stats?.totalPods || 0,
          healthyPods: stats?.healthyPods || 0,
          atRiskPods: stats?.atRiskPods || 0,
        }}
      >
        {/* Error display */}
        {error && (
          <div className="mb-4 p-4 bg-sentinel-danger/10 border border-sentinel-danger/50 rounded-lg text-sentinel-danger">
            {error}
          </div>
        )}

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Cluster health & Leaderboard */}
          <div className="lg:col-span-2 space-y-6">
            <DebugErrorBoundary name="ClusterHealth">
              <ClusterHealth stats={stats} />
            </DebugErrorBoundary>

            <DebugErrorBoundary name="Leaderboard">
              <Leaderboard
                pods={pods}
                onPodSelect={handlePodSelect}
                selectedPodName={selectedPod?.name}
              />
            </DebugErrorBoundary>
          </div>

          {/* Right column - Events & Pod detail */}
          <div className="space-y-6">
            <DebugErrorBoundary name="EventsFeed">
              <EventsFeed events={events} />
            </DebugErrorBoundary>

            {selectedPod && (
              <DebugErrorBoundary name="PodDetail">
                <PodDetail
                  pod={selectedPod}
                  onClose={() => setSelectedPod(null)}
                />
              </DebugErrorBoundary>
            )}
          </div>
        </div>
      </Layout>

      {/* Debug panel - only renders when VITE_DEBUG=true */}
      <DebugPanel />
    </DebugErrorBoundary>
  );
}

export default App;