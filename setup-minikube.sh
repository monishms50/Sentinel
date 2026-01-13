#!/bin/bash
# =============================================================================
# SENTINEL - Minikube Setup Script
# =============================================================================
# Sets up a minikube cluster optimized for Sentinel development
#
# Usage:
#   ./scripts/setup-minikube.sh [options]
#
# Options:
#   --cpus NUM        Number of CPUs (default: 4)
#   --memory SIZE     Memory size (default: 8192)
#   --disk SIZE       Disk size (default: 30g)
#   --driver NAME     Driver (default: docker)
#   --delete          Delete existing cluster first
#   --skip-addons     Skip addon installation
#   --help            Show this help
#
# Requirements:
#   - minikube installed
#   - kubectl installed
#   - Docker running (if using docker driver)
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Default configuration
CPUS=${MINIKUBE_CPUS:-4}
MEMORY=${MINIKUBE_MEMORY:-8192}
DISK=${MINIKUBE_DISK:-30g}
DRIVER=${MINIKUBE_DRIVER:-docker}
KUBERNETES_VERSION=${KUBERNETES_VERSION:-v1.28.0}
DELETE_FIRST=false
SKIP_ADDONS=false

# =============================================================================
# Helper Functions
# =============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${MAGENTA}=== $1 ===${NC}\n"
}

show_help() {
    head -30 "$0" | tail -25 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# =============================================================================
# Parse Arguments
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --cpus)
            CPUS="$2"
            shift 2
            ;;
        --memory)
            MEMORY="$2"
            shift 2
            ;;
        --disk)
            DISK="$2"
            shift 2
            ;;
        --driver)
            DRIVER="$2"
            shift 2
            ;;
        --delete)
            DELETE_FIRST=true
            shift
            ;;
        --skip-addons)
            SKIP_ADDONS=true
            shift
            ;;
        --help|-h)
            show_help
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# =============================================================================
# Pre-flight Checks
# =============================================================================

log_step "Pre-flight Checks"

log_info "Checking required tools..."

check_command "minikube"
check_command "kubectl"
check_command "docker"

log_success "All required tools found"

# Check Docker is running
if ! docker info &> /dev/null; then
    log_error "Docker is not running. Please start Docker first."
    exit 1
fi
log_success "Docker is running"

# Check available resources
log_info "Checking system resources..."
AVAILABLE_MEMORY=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "16000")
AVAILABLE_CPUS=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "4")

if [ "$AVAILABLE_MEMORY" -lt "$MEMORY" ]; then
    log_warning "Requested ${MEMORY}MB but only ${AVAILABLE_MEMORY}MB available"
    MEMORY=$((AVAILABLE_MEMORY - 2048))
    log_info "Adjusting memory to ${MEMORY}MB"
fi

if [ "$AVAILABLE_CPUS" -lt "$CPUS" ]; then
    log_warning "Requested ${CPUS} CPUs but only ${AVAILABLE_CPUS} available"
    CPUS=$((AVAILABLE_CPUS - 1))
    log_info "Adjusting CPUs to ${CPUS}"
fi

# =============================================================================
# Cluster Setup
# =============================================================================

log_step "Cluster Setup"

# Delete existing cluster if requested
if [ "$DELETE_FIRST" = true ]; then
    if minikube status &> /dev/null; then
        log_info "Deleting existing cluster..."
        minikube delete
        log_success "Existing cluster deleted"
    fi
fi

# Check if cluster already exists
if minikube status &> /dev/null; then
    log_info "Minikube cluster already exists"
    
    # Check if it's running
    STATUS=$(minikube status --format='{{.Host}}' 2>/dev/null || echo "Unknown")
    if [ "$STATUS" = "Running" ]; then
        log_success "Cluster is already running"
    else
        log_info "Starting existing cluster..."
        minikube start
        log_success "Cluster started"
    fi
else
    log_info "Creating new minikube cluster..."
    log_info "  CPUs: $CPUS"
    log_info "  Memory: ${MEMORY}MB"
    log_info "  Disk: $DISK"
    log_info "  Driver: $DRIVER"
    log_info "  Kubernetes: $KUBERNETES_VERSION"
    
    minikube start \
        --cpus="$CPUS" \
        --memory="${MEMORY}m" \
        --disk-size="$DISK" \
        --driver="$DRIVER" \
        --kubernetes-version="$KUBERNETES_VERSION" \
        --container-runtime=docker \
        --extra-config=kubelet.housekeeping-interval=10s
    
    log_success "Cluster created successfully"
fi

# =============================================================================
# Enable Addons
# =============================================================================

if [ "$SKIP_ADDONS" = false ]; then
    log_step "Enabling Addons"
    
    ADDONS=(
        "metrics-server"
        "dashboard"
        "ingress"
        "storage-provisioner"
    )
    
    for addon in "${ADDONS[@]}"; do
        log_info "Enabling $addon..."
        minikube addons enable "$addon" 2>/dev/null || log_warning "Failed to enable $addon"
    done
    
    log_success "Addons configured"
fi

# =============================================================================
# Configure Local Registry (Optional)
# =============================================================================

log_step "Configure Docker Environment"

log_info "Setting up Docker environment for minikube..."
echo ""
echo "To use minikube's Docker daemon, run:"
echo ""
echo -e "  ${CYAN}eval \$(minikube docker-env)${NC}"
echo ""

# =============================================================================
# Create Namespaces
# =============================================================================

log_step "Creating Namespaces"

# Create sentinel namespace
if kubectl get namespace sentinel &> /dev/null; then
    log_info "Namespace 'sentinel' already exists"
else
    kubectl create namespace sentinel
    log_success "Created namespace 'sentinel'"
fi

# Create demo-app namespace
if kubectl get namespace demo-app &> /dev/null; then
    log_info "Namespace 'demo-app' already exists"
else
    kubectl create namespace demo-app
    log_success "Created namespace 'demo-app'"
fi

# =============================================================================
# Verification
# =============================================================================

log_step "Verification"

log_info "Cluster Info:"
kubectl cluster-info

log_info ""
log_info "Nodes:"
kubectl get nodes

log_info ""
log_info "Namespaces:"
kubectl get namespaces

# =============================================================================
# Summary
# =============================================================================

log_step "Setup Complete!"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              MINIKUBE CLUSTER READY FOR SENTINEL                 ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}                                                                  ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Cluster:     $(minikube ip 2>/dev/null || echo 'minikube')                                        ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Kubernetes:  $KUBERNETES_VERSION                                       ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Resources:   ${CPUS} CPUs, ${MEMORY}MB RAM                              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                  ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Next Steps:                                                     ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  1. ${CYAN}eval \$(minikube docker-env)${NC}                                 ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  2. ${CYAN}make docker${NC}                                                  ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  3. ${CYAN}./scripts/deploy-all.sh${NC}                                      ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                  ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Dashboard:   ${CYAN}minikube dashboard${NC}                                 ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  SSH:         ${CYAN}minikube ssh${NC}                                       ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Stop:        ${CYAN}minikube stop${NC}                                      ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                  ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
