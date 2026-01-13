#!/bin/bash
# =============================================================================
# SENTINEL - Quick Verification Script
# =============================================================================
# Quickly verify that the Sentinel stack is working correctly
# Supports both Docker Compose and Kubernetes deployments
#
# Usage:
#   ./scripts/verify.sh [--verbose] [--k8s-only] [--docker-only]
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

API_URL="${API_URL:-http://localhost:8080}"
VERBOSE=false
K8S_ONLY=false
DOCKER_ONLY=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --verbose|-v) VERBOSE=true ;;
        --k8s-only) K8S_ONLY=true ;;
        --docker-only) DOCKER_ONLY=true ;;
    esac
done

log_check() { echo -e "${BLUE}[CHECK]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_skip() { echo -e "${CYAN}[SKIP]${NC} $1"; }

CHECKS_TOTAL=0
CHECKS_PASSED=0
CHECKS_SKIPPED=0

check() {
    local name="$1"
    local result="$2"
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    
    if [ "$result" = "true" ] || [ "$result" = "0" ]; then
        log_pass "$name"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        return 0
    else
        log_fail "$name"
        return 1
    fi
}

skip() {
    local name="$1"
    log_skip "$name"
    CHECKS_SKIPPED=$((CHECKS_SKIPPED + 1))
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SENTINEL VERIFICATION"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# =============================================================================
# Detect Running Mode
# =============================================================================

DOCKER_COMPOSE_RUNNING=false
K8S_AVAILABLE=false
K8S_DEPLOYED=false

# Check if Docker Compose is running Sentinel
if docker ps 2>/dev/null | grep -q "sentinel-api"; then
    DOCKER_COMPOSE_RUNNING=true
fi

# Check if Kubernetes is available and has Sentinel deployed
if command -v kubectl &> /dev/null && kubectl cluster-info &> /dev/null 2>&1; then
    K8S_AVAILABLE=true
    if kubectl get deployment -n sentinel sentinel-api &> /dev/null 2>&1; then
        K8S_DEPLOYED=true
    fi
fi

echo -e "${CYAN}Detected Environment:${NC}"
if [ "$DOCKER_COMPOSE_RUNNING" = true ]; then
    echo -e "  ${GREEN}✓${NC} Docker Compose: Running"
else
    echo -e "  ${YELLOW}○${NC} Docker Compose: Not detected"
fi

if [ "$K8S_AVAILABLE" = true ]; then
    if [ "$K8S_DEPLOYED" = true ]; then
        echo -e "  ${GREEN}✓${NC} Kubernetes: Deployed"
    else
        echo -e "  ${YELLOW}○${NC} Kubernetes: Available (not deployed)"
    fi
else
    echo -e "  ${YELLOW}○${NC} Kubernetes: Not available"
fi
echo ""

# =============================================================================
# API Checks (Always run if API is accessible)
# =============================================================================

echo -e "${CYAN}─── API Endpoints ───${NC}"

log_check "API Health..."
HEALTH=$(curl -sf "$API_URL/health" 2>/dev/null || echo "")
if [ -n "$HEALTH" ]; then
    check "API Health Endpoint" "true"
    [ "$VERBOSE" = true ] && echo "  Response: $HEALTH"
else
    check "API Health Endpoint" "false"
    echo -e "  ${YELLOW}Hint: Is the API running? Try: docker compose up -d${NC}"
fi

log_check "API Pods Endpoint..."
PODS=$(curl -sf "$API_URL/api/pods" 2>/dev/null || echo "")
if [ -n "$PODS" ]; then
    POD_COUNT=$(echo "$PODS" | jq '.data | length' 2>/dev/null || echo "0")
    check "Pods Endpoint (found $POD_COUNT pods)" "true"
else
    check "Pods Endpoint" "false"
fi

log_check "API Leaderboard Endpoint..."
LEADERBOARD=$(curl -sf "$API_URL/api/leaderboard" 2>/dev/null || echo "")
if [ -n "$LEADERBOARD" ]; then
    check "Leaderboard Endpoint" "true"
    if [ "$VERBOSE" = true ]; then
        echo "$LEADERBOARD" | jq '.data[:3]' 2>/dev/null || true
    fi
else
    check "Leaderboard Endpoint" "false"
fi

log_check "API Stats Endpoint..."
STATS=$(curl -sf "$API_URL/api/stats" 2>/dev/null || echo "")
if [ -n "$STATS" ]; then
    check "Stats Endpoint" "true"
else
    check "Stats Endpoint" "false"
fi

log_check "API Config Endpoint..."
CONFIG=$(curl -sf "$API_URL/api/config" 2>/dev/null || echo "")
if [ -n "$CONFIG" ]; then
    check "Config Endpoint" "true"
else
    check "Config Endpoint" "false"
fi

log_check "API Events Endpoint..."
EVENTS=$(curl -sf "$API_URL/api/events" 2>/dev/null || echo "")
if [ -n "$EVENTS" ]; then
    EVENT_COUNT=$(echo "$EVENTS" | jq '.data | length' 2>/dev/null || echo "0")
    check "Events Endpoint ($EVENT_COUNT events)" "true"
else
    check "Events Endpoint" "false"
fi

# =============================================================================
# Docker Compose Checks
# =============================================================================

if [ "$K8S_ONLY" = false ]; then
    echo ""
    echo -e "${CYAN}─── Docker Compose ───${NC}"
    
    if [ "$DOCKER_COMPOSE_RUNNING" = true ]; then
        log_check "API Container..."
        if docker ps | grep -q "sentinel-api"; then
            check "API Container Running" "true"
        else
            check "API Container Running" "false"
        fi
        
        log_check "Agent Container..."
        if docker ps | grep -q "sentinel-agent"; then
            check "Agent Container Running" "true"
        else
            log_warn "Agent Container (not running - uses demo mode in API)"
        fi
        
        log_check "Controller Container..."
        if docker ps | grep -q "sentinel-controller"; then
            check "Controller Container Running" "true"
        else
            log_warn "Controller Container (not running - optional)"
        fi
    else
        skip "Docker Compose checks (not running)"
    fi
fi

# =============================================================================
# Kubernetes Checks
# =============================================================================

if [ "$DOCKER_ONLY" = false ] && [ "$K8S_AVAILABLE" = true ]; then
    echo ""
    echo -e "${CYAN}─── Kubernetes ───${NC}"
    
    log_check "Sentinel Namespace..."
    if kubectl get namespace sentinel &> /dev/null; then
        check "Sentinel Namespace" "true"
    else
        check "Sentinel Namespace" "false"
    fi
    
    if [ "$K8S_DEPLOYED" = true ]; then
        log_check "API Pod..."
        API_STATUS=$(kubectl get pods -n sentinel -l app=sentinel-api -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "")
        if [ "$API_STATUS" = "Running" ]; then
            check "API Pod Running" "true"
        else
            check "API Pod ($API_STATUS)" "false"
        fi
        
        log_check "Agent DaemonSet..."
        AGENT_READY=$(kubectl get daemonset -n sentinel sentinel-agent -o jsonpath='{.status.numberReady}' 2>/dev/null || echo "0")
        AGENT_DESIRED=$(kubectl get daemonset -n sentinel sentinel-agent -o jsonpath='{.status.desiredNumberScheduled}' 2>/dev/null || echo "0")
        if [ "$AGENT_READY" = "$AGENT_DESIRED" ] && [ "$AGENT_READY" != "0" ]; then
            check "Agent DaemonSet ($AGENT_READY/$AGENT_DESIRED)" "true"
        else
            check "Agent DaemonSet ($AGENT_READY/$AGENT_DESIRED)" "false"
        fi
        
        log_check "Controller Pod..."
        CTRL_STATUS=$(kubectl get pods -n sentinel -l app=sentinel-controller -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "")
        if [ "$CTRL_STATUS" = "Running" ]; then
            check "Controller Pod Running" "true"
        else
            check "Controller Pod ($CTRL_STATUS)" "false"
        fi
        
        log_check "Demo App Namespace..."
        if kubectl get namespace demo-app &> /dev/null; then
            check "Demo App Namespace" "true"
            
            DEMO_PODS=$(kubectl get pods -n demo-app --no-headers 2>/dev/null | wc -l)
            check "Demo Pods ($DEMO_PODS found)" "$( [ "$DEMO_PODS" -gt 0 ] && echo true || echo false )"
        else
            check "Demo App Namespace" "false"
        fi
    else
        skip "K8s pod checks (Sentinel not deployed to K8s)"
        echo -e "  ${YELLOW}Note: You're running via Docker Compose - this is fine!${NC}"
        echo -e "  ${YELLOW}To deploy to K8s: ./scripts/deploy-all.sh${NC}"
    fi
elif [ "$K8S_AVAILABLE" = false ] && [ "$DOCKER_ONLY" = false ]; then
    echo ""
    echo -e "${CYAN}─── Kubernetes ───${NC}"
    skip "Kubernetes checks (kubectl not available or cluster not running)"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Calculate pass rate (excluding skipped)
CHECKS_EVALUATED=$((CHECKS_TOTAL))
if [ $CHECKS_EVALUATED -gt 0 ]; then
    PASS_RATE=$((CHECKS_PASSED * 100 / CHECKS_EVALUATED))
else
    PASS_RATE=0
fi

# Determine mode message
MODE_MSG=""
if [ "$DOCKER_COMPOSE_RUNNING" = true ] && [ "$K8S_DEPLOYED" = false ]; then
    MODE_MSG="(Running via Docker Compose)"
elif [ "$K8S_DEPLOYED" = true ]; then
    MODE_MSG="(Running via Kubernetes)"
fi

if [ $CHECKS_PASSED -eq $CHECKS_TOTAL ]; then
    echo -e "${GREEN}✓ ALL CHECKS PASSED ($CHECKS_PASSED/$CHECKS_TOTAL)${NC} $MODE_MSG"
    echo ""
    echo "  Sentinel is fully operational!"
    echo ""
    exit 0
elif [ $PASS_RATE -ge 80 ]; then
    echo -e "${GREEN}✓ VERIFICATION PASSED ($CHECKS_PASSED/$CHECKS_TOTAL - $PASS_RATE%)${NC} $MODE_MSG"
    if [ $CHECKS_SKIPPED -gt 0 ]; then
        echo -e "  ${CYAN}($CHECKS_SKIPPED checks skipped - not applicable to current setup)${NC}"
    fi
    echo ""
    echo "  Sentinel is operational!"
    echo ""
    exit 0
elif [ $PASS_RATE -ge 60 ]; then
    echo -e "${YELLOW}⚠ MOSTLY WORKING ($CHECKS_PASSED/$CHECKS_TOTAL - $PASS_RATE%)${NC} $MODE_MSG"
    if [ $CHECKS_SKIPPED -gt 0 ]; then
        echo -e "  ${CYAN}($CHECKS_SKIPPED checks skipped)${NC}"
    fi
    echo ""
    echo "  Some components may need attention."
    echo ""
    exit 0
else
    echo -e "${RED}✗ VERIFICATION FAILED ($CHECKS_PASSED/$CHECKS_TOTAL - $PASS_RATE%)${NC}"
    echo ""
    echo "  Please check the failed components above."
    echo ""
    exit 1
fi
