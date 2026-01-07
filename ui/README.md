# Sentinel UI

A **React + TypeScript dashboard** for visualizing and managing **Sentinel**, a Kubernetes Pod Entropy Monitoring system.

The Sentinel UI provides real-time observability into pod behavior, entropy scores, drift events, and automated purge actions across a Kubernetes cluster.

---

## Overview

Sentinel UI is designed to give operators and security engineers **clear, real-time insight** into pod stability and behavioral drift, enabling fast detection, investigation, and remediation.

---

## Key Features

* **Real-Time Monitoring**

  * Live entropy score updates via WebSockets
  * Instant drift event notifications

* **Pod Leaderboard**

  * Ranked view of monitored pods by entropy score
  * Search, filter, and sort support

* **Pod Detail View**

  * Score breakdown and historical trends
  * Drift event history
  * Baseline comparison

* **Pod Management**

  * Bulk pod selection
  * Manual purge actions

* **Purge Configuration**

  * Auto-purge enable/disable
  * Configurable purge aggressiveness

* **Cluster Health Dashboard**

  * Cluster-wide entropy distribution
  * Aggregate health metrics

* **Interactive Visualizations**

  * Charts powered by Recharts

---

## Tech Stack

* **React 18**
* **TypeScript 5**
* **Vite**
* **Tailwind CSS 3**
* **Recharts**
* **Lucide React**
* **Nginx** (production container)

---

## Project Structure

```
ui/
├── src/
│   ├── api/                # API client & WebSocket logic
│   ├── components/         # UI components
│   │   ├── Charts/
│   │   ├── ClusterHealth/
│   │   ├── EventsFeed/
│   │   ├── Leaderboard/
│   │   ├── Layout/
│   │   ├── PodDetail/
│   │   ├── PodManager/
│   │   └── PurgeConfig/
│   ├── hooks/              # Custom React hooks
│   ├── types/              # TypeScript interfaces
│   ├── App.tsx             # Root component
│   ├── main.tsx            # Application entry point
│   └── index.css           # Global styles
├── public/                 # Static assets
├── Dockerfile              # Production container build
├── nginx.conf              # Nginx configuration
├── tailwind.config.js      # Tailwind theme and extensions
├── tsconfig.json           # TypeScript configuration
└── vite.config.js          # Vite configuration
```

---

## Prerequisites

* **Node.js 20+**
* **npm** or **pnpm**

---

## Local Development

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Or manually:

```bash
echo "VITE_API_URL=http://localhost:8080" > .env
```

### Start Development Server

```bash
npm run dev
```

The UI will be available at:

```
http://localhost:3000
```

---

## Build & Tooling

### Production Build

```bash
npm run build
```

The output will be generated in the `dist/` directory.

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

---

## Docker

### Build Image

```bash
docker build -t sentinel-ui:latest .
```

### Run Container

```bash
docker run -p 80:80 sentinel-ui:latest
```

The UI will be available at:

```
http://localhost
```

---

## API Integration

The UI communicates with the **Sentinel API** using REST and WebSocket endpoints.

### REST Endpoints

* `GET /api/pods`
* `GET /api/pods/:id`
* `GET /api/pods/:id/baseline`
* `GET /api/leaderboard`
* `GET /api/stats`
* `GET /api/events`
* `GET /api/config`
* `PUT /api/config`
* `DELETE /api/pods/:id`

### WebSocket

* `WS /api/ws/scores`

#### WebSocket Messages

```ts
{ type: "score_update", payload: { podUID, score, status } }
{ type: "drift_event", payload: DriftEvent }
{ type: "pod_added", payload: { podUID, podName } }
{ type: "pod_removed", payload: { podUID, podName } }
```

See `src/api/client.ts` for implementation details.

---

## Styling & Theme

The UI uses a custom Sentinel theme built on Tailwind CSS.

| Token            | Color     | Usage            |
| ---------------- | --------- | ---------------- |
| sentinel-bg      | `#0a0e14` | App background   |
| sentinel-surface | `#11151c` | Cards & panels   |
| sentinel-border  | `#1f2937` | Borders          |
| sentinel-text    | `#f3f4f6` | Primary text     |
| sentinel-muted   | `#9ca3af` | Secondary text   |
| sentinel-accent  | `#00ff9f` | Healthy / accent |
| sentinel-warning | `#fbbf24` | Warning          |
| sentinel-danger  | `#ff6b6b` | Critical         |

---

## License

Part of the **Sentinel** project.
