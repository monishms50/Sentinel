# Sentinel Testing Guide

This guide explains how to test the Sentinel system using Docker Compose for each phase.

## Quick Start

### Test Phase 1 (Agent + API)
```bash
./scripts/test-phase1.sh
```

### Test Phase 2 (API Standalone)
```bash
./scripts/test-phase2.sh
```

### Test Phase 3 (Controller + API)
```bash
./scripts/test-phase3.sh
```

## Docker Compose Files

| File | Purpose | Services |
|------|---------|----------|
| `docker-compose.phase1.yml` | Test Agent with API | agent, api |
| `docker-compose.phase2.yml` | Test API standalone | api |
| `docker-compose.phase3.yml` | Test Controller with API | controller, api |
| `docker-compose.yml` | Run all services together | agent, api, controller |

## Prerequisites

### Required
- ✅ Docker (v20.10+)
- ✅ Docker Compose (v1.29+ or Docker Compose V2)

### Optional (for Phase 1 & 3)
- ⚠️ Kubernetes cluster (minikube, kind, or k3d)
- ⚠️ kubectl configured

## Phase Testing Details

### Phase 1: Entropy Agent

**What it does:**
- Monitors Kubernetes pods for drift
- Captures baselines on pod startup
- Calculates entropy scores
- Reports to API server

**Test Coverage:**
- ✅ API server health
- ✅ Agent container startup
- ✅ Agent-API communication
- ✅ Kubernetes connectivity

**Requirements:**
- Kubernetes cluster must be running
- kubeconfig at `~/.kube/config` (or `%USERPROFILE%\.kube\config` on Windows)

### Phase 2: API Server

**What it does:**
- Stores pod scores and drift events
- Provides REST API endpoints
- WebSocket support for real-time updates
- SQLite database persistence

**Test Coverage:**
- ✅ Health endpoint
- ✅ All REST API endpoints
- ✅ WebSocket endpoint
- ✅ Database persistence
- ✅ Container health checks
- ✅ Basic performance

**Requirements:**
- No Kubernetes needed (standalone)

### Phase 3: Purge Controller

**What it does:**
- Watches pod scores from API
- Automatically purges pods below threshold
- Configurable purge speeds
- DRY_RUN mode for safe testing

**Test Coverage:**
- ✅ API server health
- ✅ Controller container startup
- ✅ Controller-API communication
- ✅ DRY_RUN mode verification
- ✅ Activity monitoring

**Requirements:**
- Kubernetes cluster must be running
- kubeconfig at `~/.kube/config` (or `%USERPROFILE%\.kube\config` on Windows)
- Runs in DRY_RUN mode by default (safe)

## Manual Testing

### Start Services
```bash
# Phase 1
docker-compose -f docker-compose.phase1.yml up -d

# Phase 2
docker-compose -f docker-compose.phase2.yml up -d

# Phase 3
docker-compose -f docker-compose.phase3.yml up -d

# All services
docker-compose up -d
```

### View Logs
```bash
# All services
docker-compose -f docker-compose.phase1.yml logs -f

# Specific service
docker-compose -f docker-compose.phase1.yml logs -f agent
docker-compose -f docker-compose.phase1.yml logs -f api
```

### Test API Endpoints
```bash
# Health check
curl http://localhost:8080/health

# Leaderboard
curl http://localhost:8080/api/leaderboard

# Stats
curl http://localhost:8080/api/stats

# Pods
curl http://localhost:8080/api/pods

# Events
curl http://localhost:8080/api/events
```

### Stop Services
```bash
# Stop and remove containers
docker-compose -f docker-compose.phase1.yml down

# Stop and remove containers + volumes
docker-compose -f docker-compose.phase1.yml down -v
```

## Windows-Specific Notes

### kubeconfig Path
On Windows, the kubeconfig path in docker-compose files uses `${HOME}` which should work in WSL2 or Git Bash. If you're using native Windows Docker, you may need to:

1. **Option 1:** Use WSL2 (recommended)
   ```bash
   # In WSL2
   ./scripts/test-phase1.sh
   ```

2. **Option 2:** Adjust the volume path in docker-compose files
   ```yaml
   volumes:
     - C:/Users/YourUsername/.kube/config:/kubeconfig/config:ro
   ```

3. **Option 3:** Use environment variable
   ```bash
   export HOME=/c/Users/YourUsername
   docker-compose -f docker-compose.phase1.yml up
   ```

### Script Execution
On Windows, use Git Bash or WSL2 to run the test scripts:
```bash
# In Git Bash or WSL2
./scripts/test-phase1.sh
```

Or use PowerShell with manual docker-compose commands (see Manual Testing section above).

## Troubleshooting

### Issue: "Docker is not running"
**Solution:** Start Docker Desktop or Docker daemon

### Issue: "Port 8080 already in use"
**Solution:** 
- Stop other services: `docker ps` and `docker stop <container>`
- Or change port in docker-compose: `"8081:8080"`

### Issue: "Kubernetes cluster not accessible"
**Solution:**
- Start minikube: `minikube start`
- Or start kind: `kind create cluster`
- Verify: `kubectl cluster-info`

### Issue: "kubeconfig not found"
**Solution:**
- Check path: `ls ~/.kube/config` (Linux/Mac) or `dir %USERPROFILE%\.kube\config` (Windows)
- Copy kubeconfig if needed
- Adjust volume path in docker-compose file

### Issue: "Container build failed"
**Solution:**
- Check Dockerfile syntax
- Ensure all source files exist
- View build logs: `docker-compose build --no-cache`

### Issue: "Agent/Controller not communicating"
**Solution:**
- Verify Kubernetes cluster is accessible
- Check kubeconfig is mounted correctly
- Review container logs: `docker-compose logs agent`

## Expected Test Results

### Phase 1 Success Criteria
- ✅ API server responds to health checks
- ✅ Agent container is running
- ✅ Agent logs show no critical errors
- ✅ Agent attempts to connect to API

### Phase 2 Success Criteria
- ✅ API server responds to health checks
- ✅ All API endpoints return valid responses
- ✅ Database persists data across restarts
- ✅ Container health checks pass
- ✅ 10 requests complete in reasonable time

### Phase 3 Success Criteria
- ✅ API server responds to health checks
- ✅ Controller container is running
- ✅ Controller logs show no critical errors
- ✅ Controller attempts to reconcile
- ✅ DRY_RUN mode is enabled

## Next Steps

After successful testing:
1. Review test output and logs
2. Deploy to Kubernetes using `k8s/` manifests
3. Configure production settings
4. Set up monitoring and alerting
5. Adjust purge thresholds as needed

## Additional Resources

- [Test Scripts README](scripts/TEST-README.md) - Detailed test script documentation
- [Project README](README.md) - General project information
- [Kubernetes Manifests](k8s/) - Production deployment files
