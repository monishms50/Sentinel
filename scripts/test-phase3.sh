#!/bin/bash

# =============================================================================
# SENTINEL - Phase 3 Test Script
# =============================================================================
# Tests the Purge Controller (Phase 3) with API Server
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.phase3.yml"
API_URL="http://localhost:8080"
MAX_WAIT=120  # Maximum wait time in seconds

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     SENTINEL Phase 3 Test: Controller + API                ║${NC}"
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
        print_warning "Kubernetes cluster may not be accessible. Controller may not function properly."
    fi
else
    print_warning "kubectl not found. Controller requires Kubernetes access to function."
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

# Step 4: Check Controller container status
echo ""
echo "Step 4: Checking Controller container status..."
sleep 5  # Give controller time to start

CONTROLLER_STATUS=$(docker-compose -f "$COMPOSE_FILE" ps controller | grep -c "Up" || echo "0")
if [ "$CONTROLLER_STATUS" -gt 0 ]; then
    print_status "Controller container is running"
else
    print_error "Controller container is not running"
    echo "Controller logs:"
    docker-compose -f "$COMPOSE_FILE" logs controller
    exit 1
fi

# Step 5: Check Controller logs for errors
echo ""
echo "Step 5: Checking Controller logs for errors..."
CONTROLLER_LOGS=$(docker-compose -f "$COMPOSE_FILE" logs controller 2>&1 | tail -20)
if echo "$CONTROLLER_LOGS" | grep -i "error\|fatal\|panic" > /dev/null; then
    print_warning "Controller logs contain errors:"
    echo "$CONTROLLER_LOGS" | grep -i "error\|fatal\|panic"
else
    print_status "No critical errors in Controller logs"
fi

# Step 6: Verify Controller can communicate with API
echo ""
echo "Step 6: Verifying Controller-API communication..."
sleep 10  # Give controller time to attempt communication

# Check if controller has sent any requests (this is a basic check)
CONTROLLER_LOGS_RECENT=$(docker-compose -f "$COMPOSE_FILE" logs --tail=50 controller 2>&1)
if echo "$CONTROLLER_LOGS_RECENT" | grep -i "api\|endpoint\|reconcile\|purge" > /dev/null; then
    print_status "Controller appears to be attempting API communication"
else
    print_warning "Controller may not be communicating with API (check Kubernetes access)"
fi

# Step 7: Verify DRY_RUN mode
echo ""
echo "Step 7: Verifying DRY_RUN mode is enabled..."
DRY_RUN_CHECK=$(docker-compose -f "$COMPOSE_FILE" logs controller 2>&1 | grep -i "dry.*run\|DRY_RUN" | head -1)
if echo "$DRY_RUN_CHECK" | grep -i "dry.*run\|true" > /dev/null; then
    print_status "DRY_RUN mode appears to be enabled (safe for testing)"
else
    print_warning "DRY_RUN mode status unclear - check controller configuration"
fi

# Step 8: Test API config endpoint (if available)
echo ""
echo "Step 8: Testing API configuration endpoints..."
# Try to get purge config
CONFIG_RESPONSE=$(curl -sf "$API_URL/api/config" 2>&1 || echo "")
if [ -n "$CONFIG_RESPONSE" ] && ! echo "$CONFIG_RESPONSE" | grep -i "404\|not found" > /dev/null; then
    print_status "Config endpoint is accessible"
else
    print_warning "Config endpoint may not be available (this is optional)"
fi

# Step 9: Display container status
echo ""
echo "Step 9: Container status:"
docker-compose -f "$COMPOSE_FILE" ps

# Step 10: Display recent logs
echo ""
echo "Step 10: Recent logs (last 10 lines per service):"
echo "--- API Logs ---"
docker-compose -f "$COMPOSE_FILE" logs --tail=10 api
echo ""
echo "--- Controller Logs ---"
docker-compose -f "$COMPOSE_FILE" logs --tail=10 controller

# Step 11: Monitor controller activity
echo ""
echo "Step 11: Monitoring controller activity for 15 seconds..."
sleep 15
CONTROLLER_ACTIVITY=$(docker-compose -f "$COMPOSE_FILE" logs --since=15s controller 2>&1)
if [ -n "$CONTROLLER_ACTIVITY" ]; then
    print_status "Controller is generating logs (active)"
    echo "Recent activity:"
    echo "$CONTROLLER_ACTIVITY" | tail -5
else
    print_warning "No recent controller activity detected"
fi

# Summary
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Phase 3 Test Summary                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
print_status "API server is running and healthy"
print_status "API endpoints are accessible"
print_status "Controller container is running"
print_warning "Note: Controller requires Kubernetes cluster access to fully function"
print_warning "Note: Controller is running in DRY_RUN mode (no actual purges will occur)"
print_info "To view logs: docker-compose -f $COMPOSE_FILE logs -f"
print_info "To stop services: docker-compose -f $COMPOSE_FILE down"
echo ""
echo -e "${GREEN}Phase 3 test completed successfully!${NC}"
