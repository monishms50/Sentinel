Kubernetes manifests for Sentinel’s core components.

namespace.yaml — Namespace for all Sentinel services

agent-daemonset.yaml — Runs entropy agents on every node

api-deployment.yaml — Backend API service deployment

controller-deployment.yaml — Automated purge / remediation controller

configmap.yaml — Centralized configuration for Sentinel components