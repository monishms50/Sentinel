#!/bin/bash

# =============================================================================
# SENTINEL - Phase 1 Test Script
# =============================================================================
# Tests the Entropy Agent (Phase 1) with API Server
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.phase1.yml"
API_URL="http://localhost:8080"
MAX_WAIT=120  # Maximum wait time in seconds

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     SENTINEL Phase 1 Test: Agent + API                     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if Docker is running
echo "Checking prerequisites..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi
print_status "Docker is running"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "docker-compose is not installed. Please install it and try again."
    exit 1
fi
print_status "docker-compose is available"

# Check if Kubernetes cluster is accessible (optional but recommended)
if command -v kubectl &> /dev/null; then
    if kubectl cluster-info &> /dev/null; then
        print_status "Kubernetes cluster is accessible"
    else
        print_warning "Kubernetes cluster may not be accessible. Agent may not function properly."
    fi
else
    print_warning "kubectl not found. Agent requires Kubernetes access to function."
fi

# Cleanup function
cleanup() {
    echo ""
    print_info "Cleaning up..."
    docker-compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true
}

# Set trap for cleanup on exit
trap cleanup EXIT

# Step 1: Build and start services
echo ""
echo "Step 1: Building and starting services..."
docker-compose -f "$COMPOSE_FILE" build --no-cache
docker-compose -f "$COMPOSE_FILE" up -d

# Step 2: Wait for API to be healthy
echo ""
echo "Step 2: Waiting for API server to be healthy..."
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -sf "$API_URL/health" > /dev/null 2>&1; then
        print_status "API server is healthy"
        break
    fi
    if [ $WAIT_COUNT -eq 0 ]; then
        print_info "Waiting for API server to start..."
    fi
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 2))
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    print_error "API server did not become healthy within ${MAX_WAIT}s"
    echo "API logs:"
    docker-compose -f "$COMPOSE_FILE" logs api
    exit 1
fi

# Step 3: Test API endpoints
echo ""
echo "Step 3: Testing API endpoints..."

# Test health endpoint
if curl -sf "$API_URL/health" > /dev/null; then
    print_status "Health endpoint is accessible"
else
    print_error "Health endpoint is not accessible"
    exit 1
fi

# Test leaderboard endpoint
if curl -sf "$API_URL/api/leaderboard" > /dev/null; then
    print_status "Leaderboard endpoint is accessible"
else
    print_error "Leaderboard endpoint is not accessible"
    exit 1
fi

# Test stats endpoint
if curl -sf "$API_URL/api/stats" > /dev/null; then
    print_status "Stats endpoint is accessible"
else
    print_error "Stats endpoint is not accessible"
    exit 1
fi

# Test pods endpoint
if curl -sf "$API_URL/api/pods" > /dev/null; then
    print_status "Pods endpoint is accessible"
else
    print_error "Pods endpoint is not accessible"
    exit 1
fi

# Step 4: Check Agent container status
echo ""
echo "Step 4: Checking Agent container status..."
sleep 5  # Give agent time to start

AGENT_STATUS=$(docker-compose -f "$COMPOSE_FILE" ps agent | grep -c "Up" || echo "0")
if [ "$AGENT_STATUS" -gt 0 ]; then
    print_status "Agent container is running"
else
    print_error "Agent container is not running"
    echo "Agent logs:"
    docker-compose -f "$COMPOSE_FILE" logs agent
    exit 1
fi

# Step 5: Check Agent logs for errors
echo ""
echo "Step 5: Checking Agent logs for errors..."
AGENT_LOGS=$(docker-compose -f "$COMPOSE_FILE" logs agent 2>&1 | tail -20)
if echo "$AGENT_LOGS" | grep -i "error\|fatal\|panic" > /dev/null; then
    print_warning "Agent logs contain errors:"
    echo "$AGENT_LOGS" | grep -i "error\|fatal\|panic"
else
    print_status "No critical errors in Agent logs"
fi

# Step 6: Verify Agent can communicate with API
echo ""
echo "Step 6: Verifying Agent-API communication..."
sleep 10  # Give agent time to attempt communication

# Check if agent has sent any requests (this is a basic check)
AGENT_LOGS_RECENT=$(docker-compose -f "$COMPOSE_FILE" logs --tail=50 agent 2>&1)
if echo "$AGENT_LOGS_RECENT" | grep -i "api\|endpoint\|sentinel" > /dev/null; then
    print_status "Agent appears to be attempting API communication"
else
    print_warning "Agent may not be communicating with API (check Kubernetes access)"
fi

# Step 7: Display container status
echo ""
echo "Step 7: Container status:"
docker-compose -f "$COMPOSE_FILE" ps

# Step 8: Display recent logs
echo ""
echo "Step 8: Recent logs (last 10 lines per service):"
echo "--- API Logs ---"
docker-compose -f "$COMPOSE_FILE" logs --tail=10 api
echo ""
echo "--- Agent Logs ---"
docker-compose -f "$COMPOSE_FILE" logs --tail=10 agent

# Summary
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Phase 1 Test Summary                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
print_status "API server is running and healthy"
print_status "API endpoints are accessible"
print_status "Agent container is running"
print_warning "Note: Agent requires Kubernetes cluster access to fully function"
print_info "To view logs: docker-compose -f $COMPOSE_FILE logs -f"
print_info "To stop services: docker-compose -f $COMPOSE_FILE down"
echo ""
echo -e "${GREEN}Phase 1 test completed successfully!${NC}"
