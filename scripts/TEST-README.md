# Sentinel Test Scripts

This directory contains test scripts for validating each phase of the Sentinel system using Docker Compose.

## Overview

The test scripts validate the functionality of each phase:
- **Phase 1**: Entropy Agent + API Server
- **Phase 2**: API Server (standalone)
- **Phase 3**: Purge Controller + API Server

## Prerequisites

1. **Docker** - Must be installed and running
2. **Docker Compose** - Must be installed (v1.29+ or Docker Compose V2)
3. **Kubernetes Cluster** (for Phase 1 and Phase 3) - Optional but recommended
   - For local testing: minikube, kind, or k3d
   - kubectl must be configured and accessible

## Docker Compose Files

The following Docker Compose files are located in the project root:

- `docker-compose.phase1.yml` - Agent + API services
- `docker-compose.phase2.yml` - API service only
- `docker-compose.phase3.yml` - Controller + API services

## Test Scripts

### test-phase1.sh
Tests the Entropy Agent (Phase 1) with API Server dependency.

**What it tests:**
- API server health and endpoints
- Agent container startup
- Agent-API communication
- Kubernetes connectivity (if available)

**Usage:**
```bash
cd /path/to/Sentinel
./scripts/test-phase1.sh
```

**Requirements:**
- Kubernetes cluster accessible via kubectl
- kubeconfig file at `~/.kube/config`

### test-phase2.sh
Tests the API Server (Phase 2) standalone.

**What it tests:**
- API server health
- All API endpoints (health, leaderboard, stats, pods, events)
- WebSocket endpoint availability
- Database persistence
- Container health checks
- Basic performance

**Usage:**
```bash
cd /path/to/Sentinel
./scripts/test-phase2.sh
```

**Requirements:**
- No Kubernetes cluster needed (standalone test)

### test-phase3.sh
Tests the Purge Controller (Phase 3) with API Server.

**What it tests:**
- API server health and endpoints
- Controller container startup
- Controller-API communication
- DRY_RUN mode verification
- Controller activity monitoring

**Usage:**
```bash
cd /path/to/Sentinel
./scripts/test-phase3.sh
```

**Requirements:**
- Kubernetes cluster accessible via kubectl
- kubeconfig file at `~/.kube/config`
- Controller runs in DRY_RUN mode by default (safe for testing)

## Running Tests

### On Linux/macOS

Make scripts executable (if needed):
```bash
chmod +x scripts/test-phase*.sh
```

Run a specific test:
```bash
./scripts/test-phase1.sh
./scripts/test-phase2.sh
./scripts/test-phase3.sh
```

### On Windows (WSL2/Git Bash)

The scripts should work in WSL2 or Git Bash:
```bash
./scripts/test-phase1.sh
./scripts/test-phase2.sh
./scripts/test-phase3.sh
```

### On Windows (PowerShell)

You can run the tests using Git Bash or WSL2, or manually run the docker-compose commands:

```powershell
# Phase 2 (no Kubernetes needed)
docker-compose -f docker-compose.phase2.yml up -d
docker-compose -f docker-compose.phase2.yml logs -f
```

## Test Output

Each test script provides:
- ✅ Status indicators for successful checks
- ❌ Error indicators for failed checks
- ⚠️ Warning indicators for potential issues
- ℹ️ Information messages
- Detailed logs at the end

## Troubleshooting

### Docker not running
```
Error: Docker is not running
```
**Solution:** Start Docker Desktop or Docker daemon

### Kubernetes cluster not accessible
```
Warning: Kubernetes cluster may not be accessible
```
**Solution:** 
- For Phase 1/3: Ensure minikube/kind/k3d is running
- Verify kubectl is configured: `kubectl cluster-info`

### Port 8080 already in use
```
Error: Port already in use
```
**Solution:** 
- Stop other services using port 8080
- Or modify the port in the docker-compose file

### Container build failures
```
Error: Build failed
```
**Solution:**
- Check Dockerfile syntax
- Ensure all source files are present
- Check Docker build logs: `docker-compose build --no-cache`

### Agent/Controller can't connect to Kubernetes
```
Warning: Agent may not be communicating with API
```
**Solution:**
- Verify kubeconfig is mounted correctly
- Check Kubernetes cluster is accessible
- Verify service account permissions (if in-cluster)

## Manual Testing

If you prefer to test manually:

### Phase 1 (Agent + API)
```bash
docker-compose -f docker-compose.phase1.yml up -d
docker-compose -f docker-compose.phase1.yml logs -f
curl http://localhost:8080/health
```

### Phase 2 (API only)
```bash
docker-compose -f docker-compose.phase2.yml up -d
docker-compose -f docker-compose.phase2.yml logs -f
curl http://localhost:8080/api/leaderboard
```

### Phase 3 (Controller + API)
```bash
docker-compose -f docker-compose.phase3.yml up -d
docker-compose -f docker-compose.phase3.yml logs -f
curl http://localhost:8080/api/stats
```

## Cleanup

All test scripts automatically clean up containers on exit. To manually clean up:

```bash
docker-compose -f docker-compose.phase1.yml down -v
docker-compose -f docker-compose.phase2.yml down -v
docker-compose -f docker-compose.phase3.yml down -v
```

## Notes

- **Phase 1 & 3** require Kubernetes access. Without it, containers will start but may not function fully.
- **Phase 2** can run completely standalone (no Kubernetes needed).
- All tests use **DRY_RUN mode** for controllers to prevent accidental pod deletions.
- Test scripts will **automatically clean up** containers when they exit (via trap).

## Next Steps

After successful tests:
1. Deploy to Kubernetes using the manifests in `k8s/`
2. Configure monitoring and alerting
3. Set up production environment variables
4. Review and adjust purge thresholds
