# Sentinel UI

React + TypeScript dashboard for the Sentinel Kubernetes Pod Entropy Monitor.

## Features

- **Real-time Monitoring**: WebSocket-based live updates of pod scores and drift events
- **Pod Leaderboard**: Ranked view of all monitored pods by entropy score
- **Pod Detail View**: Comprehensive view of individual pod metrics, events, and history
- **Pod Manager**: Bulk operations for managing and purging pods
- **Purge Configuration**: Configure auto-purge thresholds and speeds
- **Cluster Health Dashboard**: Overview of cluster-wide statistics
- **Drift Events Feed**: Real-time feed of all detected drift events
- **Interactive Charts**: Visualizations using Recharts

## Tech Stack

- **React 18** - UI framework
- **TypeScript 5** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS 3** - Styling
- **Recharts** - Chart library
- **Lucide React** - Icons

## Development

### Prerequisites

- Node.js 20+ 
- npm or pnpm

### Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update `.env` with your API server URL:
```
VITE_API_URL=http://localhost:8080
```

4. Start development server:
```bash
npm run dev
```

The UI will be available at `http://localhost:3000`

### Build

Build for production:
```bash
npm run build
```

The built files will be in the `dist/` directory.

### Type Checking

Run TypeScript type checking:
```bash
npm run type-check
```

### Linting

Run ESLint:
```bash
npm run lint
```

## Docker

Build the Docker image:
```bash
docker build -t sentinel-ui:latest .
```

Run the container:
```bash
docker run -p 80:80 sentinel-ui:latest
```

## Project Structure

```
ui/
├── src/
│   ├── api/           # API client
│   ├── components/    # React components
│   │   ├── Charts/    # Chart components
│   │   ├── ClusterHealth/
│   │   ├── EventsFeed/
│   │   ├── Leaderboard/
│   │   ├── Layout/
│   │   ├── PodDetail/
│   │   ├── PodManager/
│   │   └── PurgeConfig/
│   ├── hooks/         # React hooks
│   ├── types/         # TypeScript types
│   ├── App.tsx        # Main app component
│   ├── main.jsx       # Entry point
│   └── index.css      # Global styles
├── public/            # Static assets
├── Dockerfile         # Container build
├── nginx.conf         # Nginx configuration
├── tailwind.config.js # Tailwind config
├── tsconfig.json      # TypeScript config
└── vite.config.js     # Vite config
```

## API Integration

The UI communicates with the Sentinel API server:

- **REST API**: `/api/*` endpoints for data fetching
- **WebSocket**: `/api/ws/scores` for real-time updates

See `src/api/client.ts` for API client implementation.

## Environment Variables

- `VITE_API_URL` - API server base URL (default: `http://localhost:8080`)

## Styling

The UI uses Tailwind CSS with custom Sentinel theme colors:

- `sentinel-bg` - Background color (#0a0e14)
- `sentinel-surface` - Surface/card color (#11151c)
- `sentinel-border` - Border color (#1f2937)
- `sentinel-text` - Primary text color (#f3f4f6)
- `sentinel-muted` - Muted text color (#9ca3af)
- `sentinel-accent` - Accent color (#00ff9f)
- `sentinel-warning` - Warning color (#fbbf24)
- `sentinel-danger` - Danger color (#ff6b6b)

## Components

### Layout
Main layout component with header, navigation, and footer.

### ClusterHealth
Displays cluster-wide statistics and health metrics.

### Leaderboard
Ranked list of pods sorted by entropy score.

### PodDetail
Detailed view of a single pod with:
- Score breakdown
- Score history chart
- Recent drift events
- Purge action

### PodManager
Management interface for:
- Filtering pods by status
- Selecting pods for bulk operations
- Purging individual or multiple pods

### PurgeConfig
Configuration panel for:
- Enabling/disabling auto-purge
- Setting purge speed (conservative/moderate/aggressive)
- Viewing current thresholds

### EventsFeed
Real-time feed of drift events with filtering and categorization.

### Charts
Chart components using Recharts:
- ScoreChart - Pod score history
- ClusterHealthChart - Health distribution
- ScoreDistributionChart - Score distribution
- CategoryBreakdownChart - Category-wise breakdown

## License

Part of the Sentinel project.
