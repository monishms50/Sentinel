// =============================================================================
// SENTINEL UI - COMPONENT EXPORTS
// =============================================================================
// Barrel export file for all UI components.
// This allows clean imports in App.tsx:
//   import { Layout, Leaderboard, ClusterHealth } from './components';
// Instead of:
//   import Layout from './components/Layout';
//   import Leaderboard from './components/Leaderboard';
//   etc.
// =============================================================================

// Layout components
export { Layout } from './Layout';

// Dashboard components
export { ClusterHealth } from './ClusterHealth';
export { Leaderboard } from './Leaderboard';
export { PodDetail } from './PodDetail';
export { EventsFeed } from './EventsFeed';

// Management components
export { PodManager } from './PodManager';
export { PurgeConfig } from './PurgeConfig';

// Chart components
export {
  ScoreChart,
  ClusterHealthChart,
  ScoreDistributionChart,
  MiniScoreChart,
  CategoryBreakdownChart,
} from './Charts';