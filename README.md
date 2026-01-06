# Sentinel: Kubernetes Pod Entropy Monitor

Sentinel is a **runtime drift detection and automated remediation system** for Kubernetes. It continuously monitors pods for deviations from their baseline state and automatically purges compromised replicas. The system uses an **entropy-based scoring mechanism** to measure drift across filesystem, processes, network, packages, and permissions.

---

## 🧩 Features

- **Cluster-wide monitoring:** DaemonSet agents run on every node.
- **Entropy scoring:** Quantitative score (0–100) based on drift severity.
- **Automated remediation:** Purge controller deletes and replaces pods below thresholds.
- **Real-time UI:** React dashboard shows pod scores, details, and purge settings.
- **Configurable thresholds:** Tune weights and purge speeds via ConfigMap.
- **Supports both stateless and stateful workloads:** Nginx, Postgres, and any pod in the target namespace.

---

## 📦 Architecture

[ Node ]
└── Agent (DaemonSet)
└── monitors pods → sends drift events → API

[ Cluster ]
└── API Deployment
└── stores scores
└── serves UI
└── feeds Controller

[ Controller ]
└── watches scores → deletes rotten pods

[ UI ]
└── React dashboard → real-time pod leaderboard
