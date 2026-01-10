#!/usr/bin/env bash
# =============================================================================
# SENTINEL - Full Stack Deployment Script
# =============================================================================
# PURPOSE:
#   Deploy the complete Sentinel stack to Kubernetes in the correct order,
#   with proper dependency handling and health verification.
#
# WHEN TO USE:
#   - Initial deployment of Sentinel to a new cluster
#   - After running setup-minikube.sh
#   - Re-deploying after making changes to K8s manifests
#   - CI/CD pipeline deployments
#
# PREREQUISITES:
#   - Kubernetes cluster running (minikube, kind, EKS, GKE, etc.)
#   - kubectl configured and connected to cluster
#   - Docker images built and accessible
#   - For minikube: images loaded (make minikube-load-images)
#
# USAGE:
#   chmod +x scripts/deploy-all.sh
#   ./scripts/deploy-all.sh [options]
#
# OPTIONS:
#   --skip-demo        Don't deploy demo applications
#   --skip-wait        Don't wait for pods to be ready
#   --dry-run          Show what would be deployed without applying
#   --namespace=NS     Override sentinel namespace (default: sentinel)
#   --timeout=SEC      Timeout for waiting (default: 300)
#   --help             Show this help message
#
# DEPLOYMENT ORDER:
#   1. Namespaces (sentinel, demo-app)
#   2. RBAC (ServiceAccount, Role, RoleBinding)
#   3. ConfigMap (configuration)
#   4. API Server (central hub)
#   5. Agent DaemonSet (depends on API)
#   6. Controller (depends on API)
#   7. Demo Apps (nginx, redis - for testing)
#
# AFTER RUNNING:
#   kubectl get all -n sentinel           # View deployed resources
#   make k8s-logs-api                     # View API logs
#   make simulate-attack                  # Test drift detection
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default configuration
SENTINEL_NS="${SENTINEL_NS:-sentinel}"
DEMO_NS="${DEMO_NS:-demo-app}"
SKIP_DEMO=false
SKIP_WAIT=false
DRY_RUN=false
TIMEOUT=300

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
K8S_DIR="$PROJECT_ROOT/k8s"

# Track deployment status
DEPLOYED_RESOURCES=()

# =============================================================================
# FUNCTIONS
# =============================================================================

print_banner() {
    echo -e "${BLUE}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  SENTINEL - Full Stack Deployment"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${NC}"
}

print_help() {
    grep '^#' "$0" | grep -v '#!/' | sed 's/^# //' | sed 's/^#//'
    exit 0
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo ""
    echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-demo)
                SKIP_DEMO=true
                shift
                ;;
            --skip-wait)
                SKIP_WAIT=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --namespace=*)
                SENTINEL_NS="${1#*=}"
                shift
                ;;
            --timeout=*)
                TIMEOUT="${1#*=}"
                shift
                ;;
            --help|-h)
                print_help
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        echo "Make sure your cluster is running and kubectl is configured"
        exit 1
    fi
    
    # Check K8s manifests exist
    if [[ ! -d "$K8S_DIR" ]]; then
        log_error "K8s manifests directory not found: $K8S_DIR"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

apply_manifest() {
    local file=$1
    local description=$2
    
    if [[ ! -f "$file" ]]; then
        log_warn "Manifest not found: $file"
        return 1
    fi
    
    log_info "Deploying $description..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "  Would apply: $file"
        kubectl apply -f "$file" --dry-run=client
    else
        kubectl apply -f "$file"
        DEPLOYED_RESOURCES+=("$description")
    fi
    
    return 0
}

wait_for_deployment() {
    local deployment=$1
    local namespace=$2
    
    if [[ "$SKIP_WAIT" == "true" ]]; then
        return 0
    fi
    
    log_info "Waiting for $deployment to be ready..."
    
    if ! kubectl wait --for=condition=available \
        deployment/"$deployment" \
        -n "$namespace" \
        --timeout="${TIMEOUT}s" 2>/dev/null; then
        log_warn "$deployment not ready within timeout"
        return 1
    fi
    
    log_success "$deployment is ready"
    return 0
}

wait_for_daemonset() {
    local daemonset=$1
    local namespace=$2
    
    if [[ "$SKIP_WAIT" == "true" ]]; then
        return 0
    fi
    
    log_info "Waiting for $daemonset to be ready..."
    
    # DaemonSets don't have a simple "available" condition
    # Wait for desired number to equal ready number
    local attempts=0
    local max_attempts=$((TIMEOUT / 5))
    
    while [[ $attempts -lt $max_attempts ]]; do
        local desired=$(kubectl get daemonset "$daemonset" -n "$namespace" -o jsonpath='{.status.desiredNumberScheduled}' 2>/dev/null || echo "0")
        local ready=$(kubectl get daemonset "$daemonset" -n "$namespace" -o jsonpath='{.status.numberReady}' 2>/dev/null || echo "0")
        
        if [[ "$desired" -gt 0 ]] && [[ "$desired" == "$ready" ]]; then
            log_success "$daemonset is ready ($ready/$desired)"
            return 0
        fi
        
        echo -n "."
        sleep 5
        ((attempts++))
    done
    
    echo ""
    log_warn "$daemonset not ready within timeout"
    return 1
}

# =============================================================================
# DEPLOYMENT STEPS
# =============================================================================

deploy_namespaces() {
    log_step "Step 1/7: Deploying Namespaces"
    
    # Sentinel namespace
    apply_manifest "$K8S_DIR/sentinel/namespace.yaml" "sentinel namespace"
    
    # Demo namespace (if not skipped)
    if [[ "$SKIP_DEMO" == "false" ]]; then
        apply_manifest "$K8S_DIR/demo-app/namespace.yaml" "demo-app namespace"
    fi
}

deploy_rbac() {
    log_step "Step 2/7: Deploying RBAC"
    apply_manifest "$K8S_DIR/sentinel/rbac.yaml" "RBAC (ServiceAccount, Role, RoleBinding)"
}

deploy_configmap() {
    log_step "Step 3/7: Deploying ConfigMap"
    apply_manifest "$K8S_DIR/sentinel/configmap.yaml" "ConfigMap"
}

deploy_api() {
    log_step "Step 4/7: Deploying API Server"
    apply_manifest "$K8S_DIR/sentinel/api-deployment.yaml" "API Deployment"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        wait_for_deployment "sentinel-api" "$SENTINEL_NS"
    fi
}

deploy_agent() {
    log_step "Step 5/7: Deploying Agent DaemonSet"
    apply_manifest "$K8S_DIR/sentinel/agent-daemonset.yaml" "Agent DaemonSet"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        wait_for_daemonset "sentinel-agent" "$SENTINEL_NS"
    fi
}

deploy_controller() {
    log_step "Step 6/7: Deploying Controller"
    apply_manifest "$K8S_DIR/sentinel/controller-deployment.yaml" "Controller Deployment"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        wait_for_deployment "sentinel-controller" "$SENTINEL_NS"
    fi
}

deploy_demo_apps() {
    if [[ "$SKIP_DEMO" == "true" ]]; then
        log_step "Step 7/7: Skipping Demo Apps (--skip-demo)"
        return 0
    fi
    
    log_step "Step 7/7: Deploying Demo Applications"
    
    apply_manifest "$K8S_DIR/demo-app/nginx-deployment.yaml" "Demo Nginx"
    apply_manifest "$K8S_DIR/demo-app/redis-deployment.yaml" "Demo Redis"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        wait_for_deployment "demo-nginx" "$DEMO_NS" || true
        wait_for_deployment "demo-redis" "$DEMO_NS" || true
    fi
}

# =============================================================================
# VERIFICATION
# =============================================================================

verify_deployment() {
    if [[ "$DRY_RUN" == "true" ]]; then
        return 0
    fi
    
    log_step "Verification"
    
    echo ""
    echo -e "${CYAN}Sentinel Namespace Resources:${NC}"
    kubectl get all -n "$SENTINEL_NS"
    
    if [[ "$SKIP_DEMO" == "false" ]]; then
        echo ""
        echo -e "${CYAN}Demo App Resources:${NC}"
        kubectl get all -n "$DEMO_NS"
    fi
    
    # Check API health
    echo ""
    log_info "Checking API health..."
    
    # Get API pod name
    local api_pod=$(kubectl get pods -n "$SENTINEL_NS" -l app=sentinel-api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [[ -n "$api_pod" ]]; then
        # Port forward and check health
        kubectl port-forward -n "$SENTINEL_NS" "pod/$api_pod" 8080:8080 &
        local pf_pid=$!
        sleep 3
        
        if curl -s http://localhost:8080/health | grep -q "ok"; then
            log_success "API health check passed"
        else
            log_warn "API health check failed"
        fi
        
        kill $pf_pid 2>/dev/null || true
    fi
}

print_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "${YELLOW}  DRY RUN COMPLETE${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""
        echo "Run without --dry-run to apply changes"
        return
    fi
    
    echo -e "${GREEN}  DEPLOYMENT COMPLETE${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${CYAN}Deployed Resources:${NC}"
    for resource in "${DEPLOYED_RESOURCES[@]}"; do
        echo "  ✓ $resource"
    done
    echo ""
    echo -e "${YELLOW}Access the API:${NC}"
    echo "  Option 1: Port forward"
    echo "    kubectl port-forward -n $SENTINEL_NS svc/sentinel-api 8080:8080"
    echo "    curl http://localhost:8080/health"
    echo ""
    echo "  Option 2: Minikube service (if using minikube)"
    echo "    minikube service sentinel-api -n $SENTINEL_NS"
    echo ""
    echo -e "${YELLOW}View Logs:${NC}"
    echo "  kubectl logs -f -n $SENTINEL_NS -l app=sentinel-api"
    echo "  kubectl logs -f -n $SENTINEL_NS -l app=sentinel-agent"
    echo "  kubectl logs -f -n $SENTINEL_NS -l app=sentinel-controller"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  make simulate-attack    # Test drift detection"
    echo "  make k8s-status         # View deployment status"
    echo ""
}

# =============================================================================
# CLEANUP ON ERROR
# =============================================================================

cleanup_on_error() {
    log_error "Deployment failed!"
    echo ""
    echo -e "${YELLOW}To rollback, run:${NC}"
    echo "  make undeploy-all"
    echo ""
    echo -e "${YELLOW}To view error details:${NC}"
    echo "  kubectl describe pods -n $SENTINEL_NS"
    echo "  kubectl logs -n $SENTINEL_NS -l app=sentinel-api"
    exit 1
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    # Set trap for cleanup on error
    trap cleanup_on_error ERR
    
    print_banner
    parse_args "$@"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "DRY RUN MODE - No changes will be applied"
    fi
    
    echo -e "${CYAN}Configuration:${NC}"
    echo "  Sentinel Namespace: $SENTINEL_NS"
    echo "  Demo Namespace:     $DEMO_NS"
    echo "  Skip Demo Apps:     $SKIP_DEMO"
    echo "  Skip Wait:          $SKIP_WAIT"
    echo "  Timeout:            ${TIMEOUT}s"
    echo ""
    
    check_prerequisites
    
    # Deploy in order
    deploy_namespaces
    deploy_rbac
    deploy_configmap
    deploy_api
    deploy_agent
    deploy_controller
    deploy_demo_apps
    
    # Verify
    verify_deployment
    
    # Summary
    print_summary
}

main "$@"
