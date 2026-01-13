#!/bin/bash
# =============================================================================
# SENTINEL - Quick Fix for exec format error
# =============================================================================
# This script fixes the architecture mismatch that causes:
#   "exec /usr/local/bin/api: exec format error"
#
# The issue occurs when Docker Buildx compiles for a different architecture
# than your host system.
#
# Usage:
#   chmod +x fix-and-build.sh
#   ./fix-and-build.sh [phase1|phase2|phase3|all]
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== SENTINEL Build Fix ===${NC}"

# Detect host architecture
HOST_ARCH=$(uname -m)
case $HOST_ARCH in
    x86_64)
        DOCKER_PLATFORM="linux/amd64"
        GO_ARCH="amd64"
        ;;
    aarch64|arm64)
        DOCKER_PLATFORM="linux/arm64"
        GO_ARCH="arm64"
        ;;
    armv7l)
        DOCKER_PLATFORM="linux/arm/v7"
        GO_ARCH="arm"
        ;;
    *)
        echo -e "${RED}Unknown architecture: $HOST_ARCH${NC}"
        exit 1
        ;;
esac

echo -e "${YELLOW}Detected host architecture: $HOST_ARCH${NC}"
echo -e "${YELLOW}Using Docker platform: $DOCKER_PLATFORM${NC}"

# Set environment variable for Docker
export DOCKER_DEFAULT_PLATFORM=$DOCKER_PLATFORM

# Clean up previous builds
echo -e "${GREEN}Cleaning up previous builds...${NC}"
docker system prune -f

# Determine which phase to build
PHASE=${1:-all}

build_phase() {
    local compose_file=$1
    local phase_name=$2
    
    echo -e "${GREEN}Building $phase_name...${NC}"
    
    if [ -f "$compose_file" ]; then
        docker compose -f "$compose_file" build --no-cache --build-arg TARGETARCH=$GO_ARCH --build-arg TARGETOS=linux
        echo -e "${GREEN}$phase_name built successfully!${NC}"
    else
        echo -e "${RED}$compose_file not found!${NC}"
        return 1
    fi
}

case $PHASE in
    phase1)
        build_phase "docker-compose.phase1.yaml" "Phase 1 (Agent + API)"
        echo -e "${GREEN}Run with: docker compose -f docker-compose.phase1.yaml up${NC}"
        ;;
    phase2)
        build_phase "docker-compose.phase2.yaml" "Phase 2 (API only)"
        echo -e "${GREEN}Run with: docker compose -f docker-compose.phase2.yaml up${NC}"
        ;;
    phase3)
        build_phase "docker-compose.phase3.yaml" "Phase 3 (Controller + API)"
        echo -e "${GREEN}Run with: docker compose -f docker-compose.phase3.yaml up${NC}"
        ;;
    all)
        build_phase "docker-compose.yml" "All Components"
        echo -e "${GREEN}Run with: docker compose up${NC}"
        ;;
    *)
        echo -e "${RED}Unknown phase: $PHASE${NC}"
        echo "Usage: $0 [phase1|phase2|phase3|all]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}=== Build Complete ===${NC}"
echo -e "To start services: docker compose [-f <compose-file>] up -d"
echo -e "To view logs:      docker compose [-f <compose-file>] logs -f"
echo -e "To stop services:  docker compose [-f <compose-file>] down"
