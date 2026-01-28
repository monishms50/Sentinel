# Sentinel — Kubernetes Pod Entropy Monitor

Sentinel is a **runtime drift detection and automated remediation platform for Kubernetes**. It continuously evaluates running pods against their known-good baseline and **automatically purges compromised replicas** before they spread.

Sentinel uses an **entropy-based scoring model (0–100)** to quantify drift across filesystem state, running processes, network activity, installed packages, and permissions.

---

## Key Capabilities

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

## High-Level Architecture

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
#Quick Reference - Which Script for What:
docker builder prune -f



    ScriptUse                             ForNeeds                        K8s?
./fix-and-build.sh all              Build Docker images               ❌ No
docker compose up -d                Run locally                       ❌ No
./scripts/deploy-all.sh             Deploy to Kubernetes              ✅ Yes
./scripts/setup-minikube.sh         Create K8s cluster                ✅ Yes
./scripts/simulate-attack.sh        Test in K8s                       ✅ Yes




## Testing & Development Guide

This project supports **three primary workflows**:

1. **Local development (Docker Compose)** — fastest
2. **Kubernetes behavior testing (Minikube)**
3. **End-to-end CI / demo scenarios**

---

## Quick Start — “I just cloned the repo”

Use **Docker Compose** for the simplest setup:

```bash
make deps              # Install dependencies
make compose-up        # Start all services
make health-check      # Verify everything is running
```

This runs the Agent in **demo mode**, generating synthetic drift events automatically.

---

## API / UI Development Workflow

For developing new API or UI features:

```bash
make compose-up        # Start services
# Make code changes
make compose-rebuild   # Rebuild updated images
make api-test          # Run API tests
make compose-logs-api  # Inspect API logs if needed
```

---

## Kubernetes Agent & Controller Testing

Use this when testing **real DaemonSet behavior and remediation logic**.

### First-time setup

```bash
./scripts/setup-minikube.sh
```

### Deploy Sentinel to Minikube

``` Under Development```

## Validating Drift Detection


``` Under Development```

---

## Intended Audience

* **Security engineers** validating runtime integrity
* **Platform engineers** operating Kubernetes clusters
* **Developers** building and testing cloud-native defenses
* **Researchers** exploring entropy-based anomaly detection

---

## Project Philosophy

Sentinel is designed to **detect compromise early**, **respond automatically**, and **minimize blast radius** — without requiring application changes.

If it’s running in your cluster, Sentinel assumes it can be attacked.

