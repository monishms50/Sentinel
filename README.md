# Sentinel — Kubernetes Pod Entropy Monitor

Sentinel is a **runtime drift detection and automated remediation platform for Kubernetes**. It continuously evaluates running pods against their known-good baseline and **automatically purges compromised replicas** before they spread.

Sentinel uses an **entropy-based scoring model (0–100)** to quantify drift across filesystem state, running processes, network activity, installed packages, and permissions.

---

## 🚀 Key Capabilities

* **Cluster-wide runtime monitoring**
  Lightweight agents run as a DaemonSet on every node.

* **Entropy-based drift scoring**
  Each pod receives a continuously updated score reflecting deviation severity.

* **Automated remediation**
  A purge controller deletes pods that fall below configurable thresholds.

* **Real-time dashboard**
  React UI showing pod leaderboard, drift breakdowns, and purge decisions.

* **Configurable policies**
  Tune weights, thresholds, and purge behavior via ConfigMaps.

* **Stateless & stateful support**
  Works with Nginx, Postgres, and any workload in the target namespace.

---

## 🏗️ High-Level Architecture

```
[ Kubernetes Node ]
 └─ Sentinel Agent (DaemonSet)
     └─ Monitors pods
     └─ Computes drift signals
     └─ Sends events to API

[ Cluster Services ]
 └─ Sentinel API (Deployment)
     └─ Aggregates drift events
     └─ Calculates entropy scores
     └─ Serves REST + UI

 └─ Purge Controller
     └─ Watches pod scores
     └─ Deletes compromised replicas

[ UI ]
 └─ React Dashboard
     └─ Real-time leaderboard
     └─ Drift inspection
     └─ Policy configuration
```

---

## 🧪 Testing & Development Guide

This project supports **three primary workflows**:

1. **Local development (Docker Compose)** — fastest
2. **Kubernetes behavior testing (Minikube)**
3. **End-to-end CI / demo scenarios**

---

## 🟢 Quick Start — “I just cloned the repo”

Use **Docker Compose** for the simplest setup:

```bash
make deps              # Install dependencies
make compose-up        # Start all services
make health-check      # Verify everything is running
```

This runs the Agent in **demo mode**, generating synthetic drift events automatically.

---

## 🔵 API / UI Development Workflow

For developing new API or UI features:

```bash
make compose-up        # Start services
# Make code changes
make compose-rebuild   # Rebuild updated images
make api-test          # Run API tests
make compose-logs-api  # Inspect API logs if needed
```

---

## 🟣 Kubernetes Agent & Controller Testing

Use this when testing **real DaemonSet behavior and remediation logic**.

### First-time setup

```bash
./scripts/setup-minikube.sh
```

### Deploy Sentinel to Minikube

```bash
eval $(minikube docker-env)
make docker
./scripts/deploy-all.sh
kubectl get pods -n sentinel
```

You should see one Agent pod per node.

---

## 🔴 Validating Drift Detection

### Docker Compose (Demo Mode)

```bash
make compose-up
```

Agents automatically emit synthetic drift events.

### Kubernetes (Realistic Attacks)

```bash
./scripts/simulate-attack.sh --type=all --severity=medium
```

Inspect results:

```bash
curl http://localhost:8080/api/events
curl http://localhost:8080/api/leaderboard
```

---

## 🎤 Demo Walkthrough (Stakeholder-Friendly)

```bash
# 1. Start clean
make compose-down-v
make compose-up

# 2. Show healthy baseline
curl http://localhost:8080/api/leaderboard | jq

# 3. Simulate an attack (K8s)
./scripts/simulate-attack.sh --type=filesystem --severity=critical

# 4. Show score degradation
curl http://localhost:8080/api/leaderboard | jq

# 5. Cleanup
./scripts/simulate-attack.sh --cleanup
```

---

## 🤖 CI / Automated Testing

### Option A — Docker Compose (Fast)

```bash
make compose-up
make test-integration
make compose-down
```

### Option B — Kubernetes E2E (Thorough)

```bash
./scripts/setup-minikube.sh
./scripts/deploy-all.sh --skip-wait
make test-e2e
```

---

## 🧭 Workflow Decision Guide

```
START
 │
 ├─ Do you need Kubernetes-specific behavior?
 │     ├─ NO  → make compose-up
 │     └─ YES → setup-minikube.sh
 │                └─ deploy-all.sh
 │                     └─ simulate-attack.sh
 │
 └─ Need hot reload while coding?
       └─ YES → tilt up
```

---

## 📎 Sentinel Command Cheat Sheet

```
╔══════════════════════════════════════════════════════════════╗
║                  SENTINEL — QUICK COMMANDS                   ║
╠══════════════════════════════════════════════════════════════╣
║ DAILY DEVELOPMENT (Docker Compose)                            ║
║ ─────────────────────────────────────────────────────────── ║
║ make compose-up           Start all services                  ║
║ make compose-logs         View logs                           ║
║ make compose-rebuild      Rebuild after changes               ║
║ make compose-down         Stop services                       ║
║                                                              ║
║ KUBERNETES DEVELOPMENT                                       ║
║ ─────────────────────────────────────────────────────────── ║
║ ./scripts/setup-minikube.sh  One-time cluster setup          ║
║ ./scripts/deploy-all.sh      Deploy Sentinel                 ║
║ ./scripts/simulate-attack.sh Test drift detection            ║
║                                                              ║
║ TESTING                                                      ║
║ ─────────────────────────────────────────────────────────── ║
║ make test                 Run all tests                      ║
║ make health-check         Verify services                    ║
║ make api-test              API validation                    ║
║                                                              ║
║ TROUBLESHOOTING                                               ║
║ ─────────────────────────────────────────────────────────── ║
║ make compose-logs-api     API logs                           ║
║ make k8s-status           Kubernetes resources               ║
║ make help                 List all commands                  ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 📌 Intended Audience

* **Security engineers** validating runtime integrity
* **Platform engineers** operating Kubernetes clusters
* **Developers** building and testing cloud-native defenses
* **Researchers** exploring entropy-based anomaly detection

---

## 🛡️ Project Philosophy

Sentinel is designed to **detect compromise early**, **respond automatically**, and **minimize blast radius** — without requiring application changes.

If it’s running in your cluster, Sentinel assumes it can be attacked.

