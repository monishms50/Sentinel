import React, { useState } from 'react';
import {
  Layout,
  ClusterHealth,
  Leaderboard,
  PodDetail,
  PodManager,
  EventsFeed,
  PurgeConfig,
} from './components';
import { usePollingStats, useRealtimePods } from './hooks';

// ============================================================================
// TAB TYPES
// ============================================================================

type TabId = 'leaderboard' | 'manager' | 'events';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'manager', label: 'Pod Manager' },
  { id: 'events', label: 'Events' },
];

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

function App() {
  // State
  const [selectedPodUid, setSelectedPodUid] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('leaderboard');

  // Data hooks
  const { stats, loading: statsLoading } = usePollingStats(5000);
  const { pods, isConnected, loading: podsLoading, refetch } = useRealtimePods();

  // Close pod detail when switching tabs
  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (tab !== 'leaderboard') {
      setSelectedPodUid(null);
    }
  };

  return (
    <Layout
      header={{
        stats,
        isConnected,
        showConfig,
        onToggleConfig: () => setShowConfig(!showConfig),
      }}
    >
      {/* Config panel (collapsible) */}
      {showConfig && (
        <div className="mb-6 animate-fade-in">
          <PurgeConfig />
        </div>
      )}

      {/* Cluster health stats */}
      <div className="mb-6">
        <ClusterHealth stats={stats} loading={statsLoading} />
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-sentinel-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`
              px-4 py-2 text-sm font-medium transition-colors relative
              ${activeTab === tab.id
                ? 'text-sentinel-accent'
                : 'text-sentinel-muted hover:text-sentinel-text'
              }
            `}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sentinel-accent" />
            )}
          </button>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Main panel */}
        <div className="col-span-12 lg:col-span-7">
          {activeTab === 'leaderboard' && (
            <Leaderboard
              pods={pods}
              onSelectPod={setSelectedPodUid}
              selectedPodUid={selectedPodUid}
            />
          )}
          {activeTab === 'manager' && (
            <PodManager
              pods={pods}
              onRefresh={refetch}
              loading={podsLoading}
            />
          )}
          {activeTab === 'events' && <EventsFeed />}
        </div>

        {/* Sidebar */}
        <div className="col-span-12 lg:col-span-5">
          {selectedPodUid ? (
            <PodDetail
              podUid={selectedPodUid}
              onClose={() => setSelectedPodUid(null)}
            />
          ) : activeTab === 'leaderboard' ? (
            <EventsFeed />
          ) : activeTab === 'manager' ? (
            <div className="bg-sentinel-surface border border-sentinel-border rounded-lg p-6">
              <h3 className="text-sm font-medium text-sentinel-text mb-2">
                Pod Manager Help
              </h3>
              <ul className="text-xs text-sentinel-muted space-y-2">
                <li>• Select pods using checkboxes</li>
                <li>• Filter by status using the buttons</li>
                <li>• Bulk purge selected pods</li>
                <li>• Purged pods are recreated by K8s</li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}

export default App;
