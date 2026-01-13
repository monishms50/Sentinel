#!/bin/bash
# =============================================================================
# SENTINEL - Data Seeder
# =============================================================================
# Seeds initial test data into the Sentinel API for testing
# =============================================================================

set -e

# Configuration
API_ENDPOINT="${API_ENDPOINT:-http://localhost:8080}"
POD_COUNT="${POD_COUNT:-10}"
EVENT_COUNT="${EVENT_COUNT:-50}"
SEED_INTERVAL="${SEED_INTERVAL:-0}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }

# Generate UUID
generate_uuid() {
    cat /proc/sys/kernel/random/uuid 2>/dev/null || \
        echo "$(date +%s%N)-$RANDOM" | md5sum | cut -c1-36
}

# Wait for API
wait_for_api() {
    log_info "Waiting for API at $API_ENDPOINT..."
    for i in $(seq 1 30); do
        if curl -sf "$API_ENDPOINT/health" > /dev/null 2>&1; then
            log_success "API is ready"
            return 0
        fi
        sleep 2
    done
    return 1
}

# Seed pods
seed_pods() {
    log_info "Seeding $POD_COUNT pods..."
    
    local prefixes=("web-frontend" "api-gateway" "user-service" "order-service" "payment-service")
    local namespaces=("demo-app" "production" "staging")
    
    for i in $(seq 1 $POD_COUNT); do
        local prefix=${prefixes[$((RANDOM % ${#prefixes[@]}))]}
        local namespace=${namespaces[$((RANDOM % ${#namespaces[@]}))]}
        local uid=$(generate_uuid)
        local suffix=$(echo "$RANDOM" | md5sum | cut -c1-8)
        local score=$((RANDOM % 40 + 60))
        
        local pod_json=$(cat << EOF
{
    "podUID": "$uid",
    "podName": "${prefix}-${suffix}",
    "namespace": "$namespace",
    "nodeName": "node-$(printf '%02d' $((i % 3 + 1)))",
    "containerName": "$prefix",
    "status": "running",
    "score": $score,
    "baselineTimestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)
        
        curl -sf -X POST "$API_ENDPOINT/api/pods" \
            -H "Content-Type: application/json" \
            -d "$pod_json" > /dev/null 2>&1
        
        echo "  Created: ${prefix}-${suffix} (score: $score)"
    done
    
    log_success "Pods seeded"
}

# Seed events
seed_events() {
    log_info "Seeding $EVENT_COUNT events..."
    
    # Get pod list
    local pods=$(curl -sf "$API_ENDPOINT/api/pods" | jq -r '.data[]? | "\(.podUID)|\(.podName)|\(.namespace)"' 2>/dev/null)
    
    if [ -z "$pods" ]; then
        log_info "No pods found, skipping events"
        return
    fi
    
    local categories=("filesystem" "process" "network" "package" "permission")
    local severities=("low" "medium" "high" "critical")
    
    for i in $(seq 1 $EVENT_COUNT); do
        local pod_data=$(echo "$pods" | shuf -n 1)
        IFS='|' read -r pod_uid pod_name namespace <<< "$pod_data"
        
        local category=${categories[$((RANDOM % ${#categories[@]}))]}
        local severity=${severities[$((RANDOM % ${#severities[@]}))]}
        
        local event_json=$(cat << EOF
{
    "eventId": "$(generate_uuid)",
    "podUID": "$pod_uid",
    "podName": "$pod_name",
    "namespace": "$namespace",
    "container": "${pod_name%%-*}",
    "timestamp": "$(date -u -d "-$((RANDOM % 3600)) seconds" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)",
    "category": "$category",
    "severity": "$severity",
    "eventType": "${category}_change",
    "description": "Seeded test event #$i for $pod_name",
    "details": "{\"seeded\": true, \"index\": $i}"
}
EOF
)
        
        curl -sf -X POST "$API_ENDPOINT/api/events" \
            -H "Content-Type: application/json" \
            -d "$event_json" > /dev/null 2>&1
    done
    
    log_success "Events seeded"
}

# Main
main() {
    log_info "Starting Sentinel Data Seeder"
    log_info "  API: $API_ENDPOINT"
    log_info "  Pods: $POD_COUNT"
    log_info "  Events: $EVENT_COUNT"
    
    wait_for_api || exit 1
    
    seed_pods
    seed_events
    
    log_success "Seeding complete!"
    
    # If interval is set, continue seeding
    if [ "$SEED_INTERVAL" -gt 0 ]; then
        log_info "Continuing to seed every ${SEED_INTERVAL}s..."
        while true; do
            sleep "$SEED_INTERVAL"
            seed_events
        done
    fi
}

main "$@"
