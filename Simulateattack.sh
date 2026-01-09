#!/usr/bin/env bash
# =============================================================================
# SENTINEL - Drift Attack Simulation Script
# =============================================================================
# PURPOSE:
#   Simulate various types of container drift to test Sentinel's detection
#   capabilities. Creates realistic attack scenarios that the agent should
#   detect and report.
#
# WHEN TO USE:
#   - Testing drift detection after deployment
#   - Demonstrating Sentinel capabilities
#   - Validating scoring algorithm works correctly
#   - CI/CD pipeline integration tests
#   - Training/education on container security
#
# PREREQUISITES:
#   - Kubernetes cluster running with Sentinel deployed
#   - Demo applications deployed (demo-app namespace)
#   - kubectl configured and connected
#
# USAGE:
#   chmod +x scripts/simulate-attack.sh
#   ./scripts/simulate-attack.sh [options]
#
# OPTIONS:
#   --type=TYPE        Attack type: filesystem|process|network|package|all
#   --target=POD       Target pod name (default: auto-select from demo-app)
#   --namespace=NS     Target namespace (default: demo-app)
#   --severity=LEVEL   Severity: low|medium|high|critical (default: medium)
#   --cleanup          Remove attack artifacts after simulation
#   --dry-run          Show what would be done without executing
#   --help             Show this help message
#
# ATTACK TYPES:
#   filesystem  - Create suspicious files, modify configs
#   process     - Start unexpected processes (miners, shells)
#   network     - Open suspicious ports, create connections
#   package     - Install unauthorized packages
#   all         - Run all attack simulations
#
# EXPECTED RESULTS:
#   - Agent detects drift events and reports to API
#   - Pod entropy score decreases based on severity
#   - Events visible in API endpoints and UI
#   - Controller may trigger purge (if above threshold)
#
# SCORING IMPACT:
#   Low:      -5 to -10 points
#   Medium:   -10 to -20 points
#   High:     -20 to -30 points
#   Critical: -30 to -50 points
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
MAGENTA='\033[0;35m'
NC='\033[0m'

# Default configuration
ATTACK_TYPE="${ATTACK_TYPE:-all}"
TARGET_POD="${TARGET_POD:-}"
NAMESPACE="${NAMESPACE:-demo-app}"
SEVERITY="${SEVERITY:-medium}"
CLEANUP=false
DRY_RUN=false

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# =============================================================================
# FUNCTIONS
# =============================================================================

print_banner() {
    echo -e "${RED}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ⚠️  SENTINEL - Drift Attack Simulation  ⚠️"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${NC}"
    echo -e "${YELLOW}This script simulates container drift for testing purposes.${NC}"
    echo -e "${YELLOW}Only run in development/test environments!${NC}"
    echo ""
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

log_attack() {
    echo -e "${MAGENTA}[ATTACK]${NC} $1"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --type=*)
                ATTACK_TYPE="${1#*=}"
                shift
                ;;
            --target=*)
                TARGET_POD="${1#*=}"
                shift
                ;;
            --namespace=*)
                NAMESPACE="${1#*=}"
                shift
                ;;
            --severity=*)
                SEVERITY="${1#*=}"
                shift
                ;;
            --cleanup)
                CLEANUP=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
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
        exit 1
    fi
    
    # Check namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_error "Namespace '$NAMESPACE' not found"
        echo "Deploy demo apps first: make deploy-demo"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

select_target_pod() {
    if [[ -n "$TARGET_POD" ]]; then
        # Verify pod exists
        if ! kubectl get pod "$TARGET_POD" -n "$NAMESPACE" &> /dev/null; then
            log_error "Pod '$TARGET_POD' not found in namespace '$NAMESPACE'"
            exit 1
        fi
        return
    fi
    
    # Auto-select first running pod
    TARGET_POD=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [[ -z "$TARGET_POD" ]]; then
        log_error "No pods found in namespace '$NAMESPACE'"
        echo "Deploy demo apps first: make deploy-demo"
        exit 1
    fi
    
    log_info "Selected target pod: $TARGET_POD"
}

exec_in_pod() {
    local cmd=$1
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "  [DRY-RUN] kubectl exec -n $NAMESPACE $TARGET_POD -- $cmd"
        return 0
    fi
    
    kubectl exec -n "$NAMESPACE" "$TARGET_POD" -- /bin/sh -c "$cmd" 2>/dev/null || true
}

# =============================================================================
# ATTACK SIMULATIONS
# =============================================================================

simulate_filesystem_attack() {
    echo ""
    echo -e "${CYAN}━━━ Filesystem Attack Simulation ━━━${NC}"
    
    log_attack "Creating suspicious files..."
    
    case $SEVERITY in
        low)
            # Low severity: create temp files
            exec_in_pod "touch /tmp/suspicious_file.txt"
            exec_in_pod "echo 'test data' > /tmp/data.log"
            ;;
        medium)
            # Medium severity: modify config files, create scripts
            exec_in_pod "touch /tmp/miner"
            exec_in_pod "touch /tmp/backdoor.sh"
            exec_in_pod "echo '#!/bin/sh' > /tmp/shell.sh"
            exec_in_pod "mkdir -p /tmp/.hidden"
            ;;
        high)
            # High severity: create in sensitive locations
            exec_in_pod "touch /etc/cron.d/evil 2>/dev/null || true"
            exec_in_pod "touch /tmp/rootkit.so"
            exec_in_pod "mkdir -p /tmp/.ssh"
            exec_in_pod "touch /tmp/.ssh/authorized_keys"
            ;;
        critical)
            # Critical severity: multiple sensitive modifications
            exec_in_pod "touch /etc/passwd.bak 2>/dev/null || true"
            exec_in_pod "touch /tmp/cryptominer"
            exec_in_pod "touch /tmp/reverse_shell"
            exec_in_pod "mkdir -p /var/tmp/.malware"
            exec_in_pod "echo 'malicious' > /var/tmp/.malware/payload"
            ;;
    esac
    
    log_success "Filesystem attack completed"
    echo "  Expected impact: Filesystem score penalty"
}

simulate_process_attack() {
    echo ""
    echo -e "${CYAN}━━━ Process Attack Simulation ━━━${NC}"
    
    log_attack "Simulating suspicious processes..."
    
    case $SEVERITY in
        low)
            # Low: background process
            exec_in_pod "sleep 30 &"
            ;;
        medium)
            # Medium: suspicious looking processes
            exec_in_pod "(while true; do sleep 60; done) &"
            exec_in_pod "touch /tmp/miner && chmod +x /tmp/miner 2>/dev/null || true"
            ;;
        high)
            # High: shell spawning
            exec_in_pod "(sh -c 'sleep 120') &"
            exec_in_pod "touch /tmp/nc && chmod +x /tmp/nc 2>/dev/null || true"
            ;;
        critical)
            # Critical: multiple suspicious processes
            exec_in_pod "(while true; do echo mining; sleep 30; done) &"
            exec_in_pod "(sh -c 'while true; do sleep 10; done') &"
            ;;
    esac
    
    log_success "Process attack completed"
    echo "  Expected impact: Process score penalty"
}

simulate_network_attack() {
    echo ""
    echo -e "${CYAN}━━━ Network Attack Simulation ━━━${NC}"
    
    log_attack "Simulating network anomalies..."
    
    # Note: Most containers won't have network tools, so we simulate by creating markers
    case $SEVERITY in
        low)
            # Low: marker for connection attempt
            exec_in_pod "echo 'connection_marker' > /tmp/net_activity"
            ;;
        medium)
            # Medium: simulate port listening marker
            exec_in_pod "echo 'listening:4444' > /tmp/ports"
            exec_in_pod "touch /tmp/socket_4444"
            ;;
        high)
            # High: simulate reverse shell marker
            exec_in_pod "echo 'reverse_shell:attacker.com:443' > /tmp/connections"
            exec_in_pod "touch /tmp/tunnel"
            ;;
        critical)
            # Critical: multiple suspicious network markers
            exec_in_pod "echo 'c2:evil.com:8080' > /tmp/c2_connection"
            exec_in_pod "echo 'exfil:data.evil.com:443' > /tmp/exfil"
            exec_in_pod "touch /tmp/proxy /tmp/tunnel /tmp/beacon"
            ;;
    esac
    
    log_success "Network attack completed"
    echo "  Expected impact: Network score penalty"
}

simulate_package_attack() {
    echo ""
    echo -e "${CYAN}━━━ Package Attack Simulation ━━━${NC}"
    
    log_attack "Simulating package installation markers..."
    
    # We can't actually install packages in most containers, so we simulate
    case $SEVERITY in
        low)
            # Low: package cache marker
            exec_in_pod "mkdir -p /tmp/apt/cache"
            exec_in_pod "echo 'curl' > /tmp/installed_packages"
            ;;
        medium)
            # Medium: suspicious packages
            exec_in_pod "echo 'nmap' >> /tmp/installed_packages"
            exec_in_pod "echo 'netcat' >> /tmp/installed_packages"
            exec_in_pod "mkdir -p /tmp/bin && touch /tmp/bin/nmap"
            ;;
        high)
            # High: hacking tools markers
            exec_in_pod "echo 'metasploit' >> /tmp/installed_packages"
            exec_in_pod "echo 'john' >> /tmp/installed_packages"
            exec_in_pod "mkdir -p /opt/tools"
            ;;
        critical)
            # Critical: rootkit/malware markers
            exec_in_pod "echo 'rootkit' >> /tmp/installed_packages"
            exec_in_pod "echo 'cryptominer' >> /tmp/installed_packages"
            exec_in_pod "mkdir -p /usr/local/malware"
            exec_in_pod "touch /usr/local/malware/dropper"
            ;;
    esac
    
    log_success "Package attack completed"
    echo "  Expected impact: Package score penalty"
}

cleanup_attacks() {
    echo ""
    echo -e "${CYAN}━━━ Cleaning Up Attack Artifacts ━━━${NC}"
    
    log_info "Removing attack artifacts from $TARGET_POD..."
    
    # Clean up files
    exec_in_pod "rm -rf /tmp/suspicious* /tmp/data.log /tmp/miner /tmp/backdoor* /tmp/shell* /tmp/.hidden /tmp/.ssh /tmp/rootkit* /tmp/cryptominer /tmp/reverse_shell 2>/dev/null || true"
    exec_in_pod "rm -rf /tmp/net_activity /tmp/ports /tmp/socket* /tmp/connections /tmp/tunnel /tmp/c2* /tmp/exfil /tmp/proxy /tmp/beacon 2>/dev/null || true"
    exec_in_pod "rm -rf /tmp/apt /tmp/installed_packages /tmp/bin 2>/dev/null || true"
    exec_in_pod "rm -rf /var/tmp/.malware /opt/tools /usr/local/malware 2>/dev/null || true"
    exec_in_pod "rm -f /etc/cron.d/evil /etc/passwd.bak 2>/dev/null || true"
    
    # Kill background processes we started
    exec_in_pod "pkill -f 'sleep 30' 2>/dev/null || true"
    exec_in_pod "pkill -f 'sleep 60' 2>/dev/null || true"
    exec_in_pod "pkill -f 'sleep 120' 2>/dev/null || true"
    exec_in_pod "pkill -f 'echo mining' 2>/dev/null || true"
    
    log_success "Cleanup completed"
}

# =============================================================================
# MONITORING & VERIFICATION
# =============================================================================

check_detection() {
    echo ""
    echo -e "${CYAN}━━━ Checking Detection ━━━${NC}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would check API for detection events"
        return
    fi
    
    # Give agent time to detect
    log_info "Waiting 10 seconds for agent to detect changes..."
    sleep 10
    
    # Check API for events (if port-forward is active)
    if curl -s http://localhost:8080/health &> /dev/null; then
        log_info "Checking API for drift events..."
        
        # Get recent events
        local events=$(curl -s http://localhost:8080/api/events?limit=10 2>/dev/null || echo "")
        if [[ -n "$events" ]]; then
            echo ""
            echo -e "${CYAN}Recent Events:${NC}"
            echo "$events" | jq -r '.events[]? | "  [\(.severity)] \(.type): \(.description)"' 2>/dev/null || echo "$events"
        fi
        
        # Get pod score
        local score=$(curl -s "http://localhost:8080/api/pods?name=$TARGET_POD" 2>/dev/null || echo "")
        if [[ -n "$score" ]]; then
            echo ""
            echo -e "${CYAN}Pod Score:${NC}"
            echo "$score" | jq -r '.pods[]? | "  \(.name): \(.entropy_score) (was \(.baseline_score // 100))"' 2>/dev/null || echo "  Score data available via API"
        fi
    else
        log_warn "API not accessible on localhost:8080"
        echo "  Run: kubectl port-forward -n sentinel svc/sentinel-api 8080:8080"
        echo "  Then check: curl http://localhost:8080/api/events"
    fi
}

# =============================================================================
# MAIN
# =============================================================================

print_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Attack Simulation Complete${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${CYAN}Summary:${NC}"
    echo "  Target Pod:   $TARGET_POD"
    echo "  Namespace:    $NAMESPACE"
    echo "  Attack Type:  $ATTACK_TYPE"
    echo "  Severity:     $SEVERITY"
    echo ""
    echo -e "${YELLOW}Expected Sentinel Response:${NC}"
    echo "  1. Agent detects filesystem/process changes"
    echo "  2. Drift events sent to API"
    echo "  3. Pod entropy score decreases"
    echo "  4. Events visible in dashboard"
    
    case $SEVERITY in
        low)
            echo "  5. Score impact: -5 to -10 points"
            ;;
        medium)
            echo "  5. Score impact: -10 to -20 points"
            ;;
        high)
            echo "  5. Score impact: -20 to -30 points"
            echo "  6. May trigger purge warning"
            ;;
        critical)
            echo "  5. Score impact: -30 to -50 points"
            echo "  6. Should trigger pod purge (if enabled)"
            ;;
    esac
    
    echo ""
    echo -e "${YELLOW}Verify Detection:${NC}"
    echo "  kubectl port-forward -n sentinel svc/sentinel-api 8080:8080"
    echo "  curl http://localhost:8080/api/events"
    echo "  curl http://localhost:8080/api/leaderboard"
    echo ""
}

main() {
    print_banner
    parse_args "$@"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_warn "DRY RUN MODE - No actual attacks will be performed"
    fi
    
    check_prerequisites
    select_target_pod
    
    echo ""
    echo -e "${CYAN}Configuration:${NC}"
    echo "  Target Pod:   $TARGET_POD"
    echo "  Namespace:    $NAMESPACE"
    echo "  Attack Type:  $ATTACK_TYPE"
    echo "  Severity:     $SEVERITY"
    echo ""
    
    # Confirm before proceeding
    if [[ "$DRY_RUN" == "false" ]]; then
        read -p "Proceed with attack simulation? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Aborted"
            exit 0
        fi
    fi
    
    # Run attacks based on type
    case $ATTACK_TYPE in
        filesystem)
            simulate_filesystem_attack
            ;;
        process)
            simulate_process_attack
            ;;
        network)
            simulate_network_attack
            ;;
        package)
            simulate_package_attack
            ;;
        all)
            simulate_filesystem_attack
            simulate_process_attack
            simulate_network_attack
            simulate_package_attack
            ;;
        *)
            log_error "Unknown attack type: $ATTACK_TYPE"
            echo "Valid types: filesystem, process, network, package, all"
            exit 1
            ;;
    esac
    
    # Check if Sentinel detected the attack
    check_detection
    
    # Cleanup if requested
    if [[ "$CLEANUP" == "true" ]]; then
        cleanup_attacks
    fi
    
    print_summary
}

main "$@"
