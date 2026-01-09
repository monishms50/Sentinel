#!/usr/bin/env bash
# =============================================================================
# SENTINEL - Minikube Cluster Setup Script
# =============================================================================
# PURPOSE:
#   Bootstrap a minikube cluster configured for Sentinel development and testing.
#   Sets up the cluster with appropriate resources, addons, and registry.
#
# WHEN TO USE:
#   - First time setting up local Kubernetes development environment
#   - After deleting minikube cluster (minikube delete)
#   - When you need a fresh cluster for testing
#
# PREREQUISITES:
#   - minikube installed (https://minikube.sigs.k8s.io/docs/start/)
#   - Docker installed and running
#   - kubectl installed
#   - At least 8GB RAM and 4 CPU cores available
#
# USAGE:
#   chmod +x scripts/setup-minikube.sh
#   ./scripts/setup-minikube.sh [options]
#
# OPTIONS:
#   --driver=DRIVER    Docker driver (default: docker)
#   --cpus=N           Number of CPUs (default: 4)
#   --memory=MB        Memory in MB (default: 8192)
#   --disk-size=GB     Disk size (default: 20g)
#   --kubernetes=VER   Kubernetes version (default: v1.28.0)
#   --profile=NAME     Minikube profile name (default: sentinel)
#   --reset            Delete existing cluster first
#   --help             Show this help message
#
# WHAT THIS SCRIPT DOES:
#   1. Checks prerequisites (minikube, docker, kubectl)
#   2. Stops/deletes existing cluster if --reset flag used
#   3. Creates new minikube cluster with specified resources
#   4. Enables required addons (ingress, metrics-server, dashboard)
#   5. Configures local Docker registry
#   6. Creates required namespaces (sentinel, demo-app)
#   7. Applies RBAC configuration
#   8. Verifies cluster is ready
#
# AFTER RUNNING:
#   make docker                    # Build Docker images
#   make minikube-load-images      # Load images into minikube
#   make deploy-all                # Deploy Sentinel stack
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
NC='\033[0m' # No Color

# Default configuration
DRIVER="${DRIVER:-docker}"
CPUS="${CPUS:-4}"
MEMORY="${MEMORY:-8192}"
DISK_SIZE="${DISK_SIZE:-20g}"
K8S_VERSION="${K8S_VERSION:-v1.28.0}"
PROFILE="${PROFILE:-sentinel}"
RESET=false

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# =============================================================================
# FUNCTIONS
# =============================================================================

print_banner() {
    echo -e "${BLUE}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  SENTINEL - Minikube Cluster Setup"
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

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --driver=*)
                DRIVER="${1#*=}"
                shift
                ;;
            --cpus=*)
                CPUS="${1#*=}"
                shift
                ;;
            --memory=*)
                MEMORY="${1#*=}"
                shift
                ;;
            --disk-size=*)
                DISK_SIZE="${1#*=}"
                shift
                ;;
            --kubernetes=*)
                K8S_VERSION="${1#*=}"
                shift
                ;;
            --profile=*)
                PROFILE="${1#*=}"
                shift
                ;;
            --reset)
                RESET=true
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
    
    check_command minikube
    check_command docker
    check_command kubectl
    
    # Check Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check available resources
    AVAILABLE_MEM=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}' || echo "0")
    if [[ "$AVAILABLE_MEM" -lt 4096 ]] && [[ "$AVAILABLE_MEM" -gt 0 ]]; then
        log_warn "Less than 4GB RAM available. Consider closing other applications."
    fi
    
    log_success "Prerequisites check passed"
}

stop_existing_cluster() {
    if minikube status -p "$PROFILE" &> /dev/null; then
        if [[ "$RESET" == "true" ]]; then
            log_info "Deleting existing cluster (--reset flag)..."
            minikube delete -p "$PROFILE"
            log_success "Existing cluster deleted"
        else
            log_warn "Cluster '$PROFILE' already exists"
            echo -e "${YELLOW}Options:${NC}"
            echo "  1. Use existing cluster: exit and run 'make deploy-all'"
            echo "  2. Reset cluster: run with --reset flag"
            echo ""
            read -p "Continue with existing cluster? [y/N] " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_info "Exiting. Run with --reset to recreate cluster."
                exit 0
            fi
            return 0
        fi
    fi
}

create_cluster() {
    log_info "Creating minikube cluster..."
    echo -e "${CYAN}Configuration:${NC}"
    echo "  Profile:     $PROFILE"
    echo "  Driver:      $DRIVER"
    echo "  CPUs:        $CPUS"
    echo "  Memory:      ${MEMORY}MB"
    echo "  Disk:        $DISK_SIZE"
    echo "  Kubernetes:  $K8S_VERSION"
    echo ""
    
    minikube start \
        --profile="$PROFILE" \
        --driver="$DRIVER" \
        --cpus="$CPUS" \
        --memory="$MEMORY" \
        --disk-size="$DISK_SIZE" \
        --kubernetes-version="$K8S_VERSION" \
        --container-runtime=docker \
        --extra-config=kubelet.housekeeping-interval=10s \
        --addons=default-storageclass \
        --addons=storage-provisioner
    
    log_success "Minikube cluster created"
}

enable_addons() {
    log_info "Enabling addons..."
    
    # Enable ingress for external access
    minikube addons enable ingress -p "$PROFILE"
    
    # Enable metrics-server for resource monitoring
    minikube addons enable metrics-server -p "$PROFILE"
    
    # Enable dashboard for visual management
    minikube addons enable dashboard -p "$PROFILE"
    
    # Enable registry for local image storage
    minikube addons enable registry -p "$PROFILE"
    
    log_success "Addons enabled: ingress, metrics-server, dashboard, registry"
}

setup_namespaces() {
    log_info "Creating namespaces..."
    
    # Sentinel namespace
    kubectl create namespace sentinel --dry-run=client -o yaml | kubectl apply -f -
    
    # Demo application namespace
    kubectl create namespace demo-app --dry-run=client -o yaml | kubectl apply -f -
    
    # Add labels
    kubectl label namespace sentinel app.kubernetes.io/part-of=sentinel --overwrite
    kubectl label namespace demo-app app.kubernetes.io/part-of=sentinel-demo --overwrite
    
    log_success "Namespaces created: sentinel, demo-app"
}

setup_rbac() {
    log_info "Setting up RBAC..."
    
    # Check if RBAC file exists
    RBAC_FILE="$PROJECT_ROOT/k8s/sentinel/rbac.yaml"
    if [[ -f "$RBAC_FILE" ]]; then
        kubectl apply -f "$RBAC_FILE"
        log_success "RBAC configuration applied"
    else
        log_warn "RBAC file not found at $RBAC_FILE, skipping..."
    fi
}

configure_docker_env() {
    log_info "Configuring Docker environment..."
    
    echo ""
    echo -e "${CYAN}To use minikube's Docker daemon, run:${NC}"
    echo -e "  ${GREEN}eval \$(minikube docker-env -p $PROFILE)${NC}"
    echo ""
    echo -e "${CYAN}Then build images directly into minikube:${NC}"
    echo -e "  ${GREEN}make docker${NC}"
    echo ""
}

verify_cluster() {
    log_info "Verifying cluster..."
    
    # Wait for nodes to be ready
    echo -n "Waiting for node to be ready"
    for i in {1..30}; do
        if kubectl get nodes | grep -q "Ready"; then
            echo ""
            break
        fi
        echo -n "."
        sleep 2
    done
    
    # Show cluster info
    echo ""
    echo -e "${CYAN}Cluster Info:${NC}"
    kubectl cluster-info
    echo ""
    
    echo -e "${CYAN}Nodes:${NC}"
    kubectl get nodes
    echo ""
    
    echo -e "${CYAN}Namespaces:${NC}"
    kubectl get namespaces
    echo ""
    
    log_success "Cluster verification complete"
}

print_next_steps() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Minikube cluster is ready!${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo ""
    echo "  1. Configure Docker to use minikube:"
    echo -e "     ${GREEN}eval \$(minikube docker-env -p $PROFILE)${NC}"
    echo ""
    echo "  2. Build Docker images:"
    echo -e "     ${GREEN}make docker${NC}"
    echo ""
    echo "  3. Deploy Sentinel stack:"
    echo -e "     ${GREEN}make deploy-all${NC}"
    echo ""
    echo "  4. (Optional) Open dashboard:"
    echo -e "     ${GREEN}minikube dashboard -p $PROFILE${NC}"
    echo ""
    echo "  5. (Optional) Start tunnel for LoadBalancer services:"
    echo -e "     ${GREEN}minikube tunnel -p $PROFILE${NC}"
    echo ""
    echo -e "${CYAN}Useful Commands:${NC}"
    echo "  minikube status -p $PROFILE     # Check cluster status"
    echo "  minikube stop -p $PROFILE       # Stop cluster"
    echo "  minikube delete -p $PROFILE     # Delete cluster"
    echo "  kubectl get all -n sentinel     # View Sentinel resources"
    echo ""
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    print_banner
    parse_args "$@"
    check_prerequisites
    stop_existing_cluster
    create_cluster
    enable_addons
    setup_namespaces
    setup_rbac
    configure_docker_env
    verify_cluster
    print_next_steps
}

main "$@"
