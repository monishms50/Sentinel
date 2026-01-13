#!/bin/bash
# =============================================================================
# SENTINEL - Data Simulator
# =============================================================================
# Generates realistic test data for the Sentinel API
# Simulates pod entropy scores, drift events, and attack scenarios
# =============================================================================

set -e

# Configuration from environment
API_ENDPOINT="${API_ENDPOINT:-http://localhost:8080}"
SIMULATION_SPEED="${SIMULATION_SPEED:-1.0}"
POD_COUNT="${POD_COUNT:-10}"
DRIFT_FREQUENCY="${DRIFT_FREQUENCY:-medium}"
ATTACK_PROBABILITY="${ATTACK_PROBABILITY:-0.05}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Drift frequency intervals (in seconds)
declare -A DRIFT_INTERVALS
DRIFT_INTERVALS[low]=30
DRIFT_INTERVALS[medium]=15
DRIFT_INTERVALS[high]=5

# Pod name prefixes
POD_PREFIXES=("web-frontend" "api-gateway" "user-service" "order-service" "payment-service" "inventory-service" "notification-service" "cache-service" "worker" "scheduler")

# Namespaces
NAMESPACES=("demo-app" "production" "staging")

# Drift categories
DRIFT_CATEGORIES=("filesystem" "process" "network" "package" "permission")

# Event types by category
declare -A EVENT_TYPES
EVENT_TYPES[filesystem]="file_created file_modified file_deleted"
EVENT_TYPES[process]="process_started process_stopped suspicious_process"
EVENT_TYPES[network]="port_opened port_closed connection_established"
EVENT_TYPES[package]="package_installed package_removed package_modified"
EVENT_TYPES[permission]="permission_changed user_added user_removed"

# Severity levels and their weights
SEVERITIES=("low" "medium" "high" "critical")
SEVERITY_WEIGHTS=(40 35 20 5)

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

# Generate a random UUID
generate_uuid() {
    cat /proc/sys/kernel/random/uuid 2>/dev/null || \
        (echo "$(date +%s)-$RANDOM-$RANDOM-$RANDOM-$RANDOM" | md5sum | cut -c1-32)
}

# Pick random element from array
random_element() {
    local arr=("$@")
    echo "${arr[$RANDOM % ${#arr[@]}]}"
}

# Weighted random selection for severity
weighted_severity() {
    local rand=$((RANDOM % 100))
    local cumulative=0
    
    for i in "${!SEVERITIES[@]}"; do
        cumulative=$((cumulative + SEVERITY_WEIGHTS[i]))
        if [ $rand -lt $cumulative ]; then
            echo "${SEVERITIES[i]}"
            return
        fi
    done
    echo "medium"
}

# Calculate sleep duration based on simulation speed
calc_sleep() {
    local base_duration=$1
    echo "scale=2; $base_duration / $SIMULATION_SPEED" | bc
}

# Wait for API to be ready
wait_for_api() {
    log_info "Waiting for API at $API_ENDPOINT..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -sf "$API_ENDPOINT/health" > /dev/null 2>&1; then
            log_success "API is ready"
            return 0
        fi
        
        attempt=$((attempt + 1))
        sleep 2
    done
    
    log_error "API did not become ready after $max_attempts attempts"
    return 1
}

# =============================================================================
# Data Generation Functions
# =============================================================================

# Generate pod data
generate_pod() {
    local index=$1
    local prefix=$(random_element "${POD_PREFIXES[@]}")
    local namespace=$(random_element "${NAMESPACES[@]}")
    local uid=$(generate_uuid)
    local suffix=$(echo "$RANDOM" | md5sum | cut -c1-8)
    
    cat << EOF
{
    "podUID": "$uid",
    "podName": "${prefix}-${suffix}",
    "namespace": "$namespace",
    "nodeName": "node-$(printf '%02d' $((index % 3 + 1)))",
    "containerName": "${prefix}",
    "status": "running",
    "score": $((RANDOM % 30 + 70)),
    "baselineTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# Generate drift event
generate_drift_event() {
    local pod_uid=$1
    local pod_name=$2
    local namespace=$3
    
    local category=$(random_element "${DRIFT_CATEGORIES[@]}")
    local event_types_str="${EVENT_TYPES[$category]}"
    local event_types_arr=($event_types_str)
    local event_type=$(random_element "${event_types_arr[@]}")
    local severity=$(weighted_severity)
    local event_id=$(generate_uuid)
    
    # Generate description based on event type
    local description=""
    case $event_type in
        file_created)
            description="New file created: /tmp/$(cat /dev/urandom | tr -dc 'a-z0-9' | head -c 8)"
            ;;
        file_modified)
            description="File modified: /etc/$(random_element passwd shadow hosts nginx/nginx.conf)"
            ;;
        file_deleted)
            description="File deleted: /var/log/$(cat /dev/urandom | tr -dc 'a-z0-9' | head -c 6).log"
            ;;
        process_started)
            description="New process started: $(random_element curl wget nc python bash sh)"
            ;;
        process_stopped)
            description="Process stopped unexpectedly: $(random_element nginx postgres redis)"
            ;;
        suspicious_process)
            description="Suspicious process detected: $(random_element 'nc -l 4444' 'python -c' '/tmp/miner')"
            ;;
        port_opened)
            description="New port listening: $((RANDOM % 60000 + 1024))/tcp"
            ;;
        port_closed)
            description="Port closed: $(random_element 80 443 8080 3000)/tcp"
            ;;
        connection_established)
            description="Outbound connection to: $(random_element '10.0.0.' '192.168.1.' '172.16.0.')$((RANDOM % 255)):$((RANDOM % 65535))"
            ;;
        package_installed)
            description="Package installed: $(random_element curl wget nmap tcpdump strace)"
            ;;
        package_removed)
            description="Package removed: $(random_element openssl libssl sudo)"
            ;;
        package_modified)
            description="Package checksum changed: $(random_element bash sh coreutils)"
            ;;
        permission_changed)
            description="Permissions changed on: /etc/$(random_element passwd shadow sudoers)"
            ;;
        user_added)
            description="New user created: user$(cat /dev/urandom | tr -dc 'a-z0-9' | head -c 4)"
            ;;
        user_removed)
            description="User removed: $(random_element guest test backup)"
            ;;
    esac
    
    cat << EOF
{
    "eventId": "$event_id",
    "podUID": "$pod_uid",
    "podName": "$pod_name",
    "namespace": "$namespace",
    "container": "${pod_name%%-*}",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "category": "$category",
    "severity": "$severity",
    "eventType": "$event_type",
    "description": "$description",
    "details": "{\"source\": \"simulator\", \"simulated\": true}"
}
EOF
}

# Update pod score based on drift events
update_pod_score() {
    local pod_uid=$1
    local current_score=$2
    local severity=$3
    
    local penalty=0
    case $severity in
        low) penalty=$((RANDOM % 3 + 1)) ;;
        medium) penalty=$((RANDOM % 5 + 3)) ;;
        high) penalty=$((RANDOM % 10 + 8)) ;;
        critical) penalty=$((RANDOM % 15 + 15)) ;;
    esac
    
    local new_score=$((current_score - penalty))
    if [ $new_score -lt 0 ]; then
        new_score=0
    fi
    
    echo $new_score
}

# Simulate an attack scenario
simulate_attack() {
    local pod_uid=$1
    local pod_name=$2
    local namespace=$3
    
    log_warning "Simulating attack on $pod_name..."
    
    # Generate rapid sequence of high-severity events
    local attack_events=(
        "suspicious_process|critical|Cryptocurrency miner detected: /tmp/.hidden/xmrig"
        "port_opened|critical|Reverse shell listener on port 4444"
        "file_created|high|Suspicious script created: /tmp/payload.sh"
        "permission_changed|high|Sudo permissions modified for user nobody"
        "connection_established|critical|C2 connection to 185.220.101.47:8443"
    )
    
    for event_data in "${attack_events[@]}"; do
        IFS='|' read -r event_type severity description <<< "$event_data"
        
        local event_json=$(cat << EOF
{
    "eventId": "$(generate_uuid)",
    "podUID": "$pod_uid",
    "podName": "$pod_name",
    "namespace": "$namespace",
    "container": "${pod_name%%-*}",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "category": "$(random_element filesystem process network)",
    "severity": "$severity",
    "eventType": "$event_type",
    "description": "$description",
    "details": "{\"source\": \"attack_simulation\", \"attack\": true}"
}
EOF
)
        
        curl -sf -X POST "$API_ENDPOINT/api/events" \
            -H "Content-Type: application/json" \
            -d "$event_json" > /dev/null 2>&1
        
        sleep 0.5
    done
    
    log_warning "Attack simulation complete on $pod_name"
}

# =============================================================================
# Main Simulation Loop
# =============================================================================

main() {
    log_info "Starting Sentinel Data Simulator"
    log_info "Configuration:"
    log_info "  API Endpoint: $API_ENDPOINT"
    log_info "  Simulation Speed: ${SIMULATION_SPEED}x"
    log_info "  Pod Count: $POD_COUNT"
    log_info "  Drift Frequency: $DRIFT_FREQUENCY"
    log_info "  Attack Probability: $ATTACK_PROBABILITY"
    
    # Wait for API
    wait_for_api || exit 1
    
    # Initialize pods array
    declare -a PODS
    declare -A POD_SCORES
    
    # Generate initial pods
    log_info "Generating $POD_COUNT simulated pods..."
    for i in $(seq 1 $POD_COUNT); do
        pod_json=$(generate_pod $i)
        pod_uid=$(echo "$pod_json" | jq -r '.podUID')
        pod_name=$(echo "$pod_json" | jq -r '.podName')
        namespace=$(echo "$pod_json" | jq -r '.namespace')
        score=$(echo "$pod_json" | jq -r '.score')
        
        # Register pod with API
        curl -sf -X POST "$API_ENDPOINT/api/pods" \
            -H "Content-Type: application/json" \
            -d "$pod_json" > /dev/null 2>&1
        
        PODS+=("$pod_uid|$pod_name|$namespace")
        POD_SCORES[$pod_uid]=$score
        
        log_success "Created pod: $pod_name (score: $score)"
    done
    
    # Calculate drift interval
    local drift_interval=${DRIFT_INTERVALS[$DRIFT_FREQUENCY]:-15}
    drift_interval=$(calc_sleep $drift_interval)
    
    log_info "Starting simulation loop (drift every ${drift_interval}s)..."
    
    # Main loop
    while true; do
        # Pick a random pod
        local pod_data=$(random_element "${PODS[@]}")
        IFS='|' read -r pod_uid pod_name namespace <<< "$pod_data"
        local current_score=${POD_SCORES[$pod_uid]}
        
        # Check if we should simulate an attack
        local attack_roll=$(echo "scale=2; $RANDOM / 32767" | bc)
        if (( $(echo "$attack_roll < $ATTACK_PROBABILITY" | bc -l) )); then
            simulate_attack "$pod_uid" "$pod_name" "$namespace"
            POD_SCORES[$pod_uid]=0
        else
            # Generate normal drift event
            local event_json=$(generate_drift_event "$pod_uid" "$pod_name" "$namespace")
            local severity=$(echo "$event_json" | jq -r '.severity')
            
            # Send event to API
            if curl -sf -X POST "$API_ENDPOINT/api/events" \
                -H "Content-Type: application/json" \
                -d "$event_json" > /dev/null 2>&1; then
                
                # Update score
                local new_score=$(update_pod_score "$pod_uid" "$current_score" "$severity")
                POD_SCORES[$pod_uid]=$new_score
                
                log_info "[$severity] $pod_name: $(echo "$event_json" | jq -r '.description') (score: $current_score -> $new_score)"
            else
                log_error "Failed to send event for $pod_name"
            fi
        fi
        
        # Occasionally restore some score (simulating recovery)
        if [ $((RANDOM % 5)) -eq 0 ]; then
            for uid in "${!POD_SCORES[@]}"; do
                local score=${POD_SCORES[$uid]}
                if [ $score -lt 100 ]; then
                    POD_SCORES[$uid]=$((score + RANDOM % 5 + 1))
                    if [ ${POD_SCORES[$uid]} -gt 100 ]; then
                        POD_SCORES[$uid]=100
                    fi
                fi
            done
        fi
        
        sleep "$drift_interval"
    done
}

# Run main
main "$@"
