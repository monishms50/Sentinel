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
### Make File

I noticed that the agent is failing after the prevvious update. I am doing a root cause analysis and will release a MAKE file and modified agent file soon. 


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

