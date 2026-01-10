# =============================================================================
# SENTINEL - Kubernetes Pod Entropy Monitoring System
# =============================================================================
# Makefile for build, test, and deployment automation
#
# Quick Start:
#   make help              # Show all available targets
#   make deps              # Install dependencies
#   make build             # Build all components
#   make compose-up        # Start local development environment
#   make test              # Run all tests
#
# For Kubernetes:
#   make minikube-setup    # Setup minikube cluster
#   make deploy-all        # Deploy full stack to K8s
#   make simulate-attack   # Test drift detection
# =============================================================================

.PHONY: all build build-agent build-api build-controller build-ui \
        test test-unit test-integration test-e2e test-coverage \
        docker docker-agent docker-api docker-controller docker-ui \
        push push-all \
        compose-up compose-down compose-logs compose-restart compose-rebuild \
        compose-phase1 compose-phase2 compose-phase3 \
        deploy deploy-all deploy-demo undeploy undeploy-all \
        minikube-setup minikube-start minikube-stop minikube-delete minikube-load-images \
        lint lint-go lint-ui fmt clean deps \
        run-api run-agent run-controller run-ui dev \
        health-check api-test simulate-attack \
        help version info

# =============================================================================
# CONFIGURATION
# =============================================================================

# Project settings
PROJECT_NAME := sentinel
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "v0.1.0-dev")
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S')

# Go settings
GO := go
GOFLAGS := -ldflags "-X main.Version=$(VERSION) -X main.GitCommit=$(GIT_COMMIT) -X main.BuildTime=$(BUILD_TIME)"
GOOS ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)

# Docker settings
DOCKER_REGISTRY ?= localhost:5000
DOCKER_TAG ?= $(VERSION)
DOCKER_PLATFORM ?= linux/amd64

# Kubernetes settings
KUBECONFIG ?= $(HOME)/.kube/config
K8S_NAMESPACE := sentinel
K8S_DEMO_NAMESPACE := demo-app

# Directories
ROOT_DIR := $(shell pwd)
AGENT_DIR := $(ROOT_DIR)/agent
API_DIR := $(ROOT_DIR)/api
CONTROLLER_DIR := $(ROOT_DIR)/controller
UI_DIR := $(ROOT_DIR)/ui
K8S_DIR := $(ROOT_DIR)/k8s
SCRIPTS_DIR := $(ROOT_DIR)/scripts
BIN_DIR := $(ROOT_DIR)/bin

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[0;33m
BLUE := \033[0;34m
MAGENTA := \033[0;35m
CYAN := \033[0;36m
NC := \033[0m

# =============================================================================
# DEFAULT TARGET
# =============================================================================

all: build

# =============================================================================
# BUILD TARGETS
# =============================================================================

## build: Build all Go components
build: build-agent build-api build-controller
	@echo "$(GREEN)✓ All components built successfully$(NC)"

## build-agent: Build the entropy agent binary
build-agent:
	@echo "$(BLUE)Building entropy agent...$(NC)"
	@mkdir -p $(BIN_DIR)
	cd $(AGENT_DIR) && CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) $(GO) build $(GOFLAGS) -o $(BIN_DIR)/sentinel-agent .
	@echo "$(GREEN)✓ Agent built: $(BIN_DIR)/sentinel-agent$(NC)"

## build-api: Build the API server binary
build-api:
	@echo "$(BLUE)Building API server...$(NC)"
	@mkdir -p $(BIN_DIR)
	cd $(API_DIR) && CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) $(GO) build $(GOFLAGS) -o $(BIN_DIR)/sentinel-api .
	@echo "$(GREEN)✓ API built: $(BIN_DIR)/sentinel-api$(NC)"

## build-controller: Build the purge controller binary
build-controller:
	@echo "$(BLUE)Building purge controller...$(NC)"
	@mkdir -p $(BIN_DIR)
	cd $(CONTROLLER_DIR) && CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) $(GO) build $(GOFLAGS) -o $(BIN_DIR)/sentinel-controller .
	@echo "$(GREEN)✓ Controller built: $(BIN_DIR)/sentinel-controller$(NC)"

## build-ui: Build the UI for production
build-ui:
	@echo "$(BLUE)Building UI...$(NC)"
	cd $(UI_DIR) && npm run build
	@echo "$(GREEN)✓ UI built$(NC)"

## build-linux: Cross-compile all binaries for Linux
build-linux:
	@echo "$(BLUE)Cross-compiling for Linux/amd64...$(NC)"
	GOOS=linux GOARCH=amd64 $(MAKE) build
	@echo "$(GREEN)✓ Linux binaries built$(NC)"

# =============================================================================
# TEST TARGETS
# =============================================================================

## test: Run all tests
test: test-unit
	@echo "$(GREEN)✓ All tests passed$(NC)"

## test-unit: Run unit tests for all Go components
test-unit:
	@echo "$(BLUE)Running unit tests...$(NC)"
	cd $(AGENT_DIR) && $(GO) test -v -race -cover ./...
	cd $(API_DIR) && $(GO) test -v -race -cover ./...
	cd $(CONTROLLER_DIR) && $(GO) test -v -race -cover ./...
	@echo "$(GREEN)✓ Unit tests passed$(NC)"

## test-integration: Run integration tests (requires running services)
test-integration:
	@echo "$(BLUE)Running integration tests...$(NC)"
	@echo "$(YELLOW)Ensure services are running: make compose-up$(NC)"
	cd $(API_DIR) && $(GO) test -v -tags=integration ./...
	@echo "$(GREEN)✓ Integration tests passed$(NC)"

## test-e2e: Run end-to-end tests
test-e2e:
	@echo "$(BLUE)Running E2E tests...$(NC)"
	@$(SCRIPTS_DIR)/run-e2e-tests.sh
	@echo "$(GREEN)✓ E2E tests passed$(NC)"

## test-coverage: Run tests with coverage report
test-coverage:
	@echo "$(BLUE)Running tests with coverage...$(NC)"
	@mkdir -p coverage
	cd $(AGENT_DIR) && $(GO) test -coverprofile=../coverage/agent.out ./...
	cd $(API_DIR) && $(GO) test -coverprofile=../coverage/api.out ./...
	cd $(CONTROLLER_DIR) && $(GO) test -coverprofile=../coverage/controller.out ./...
	@echo "$(GREEN)✓ Coverage reports generated in ./coverage/$(NC)"

## test-ui: Run UI tests
test-ui:
	@echo "$(BLUE)Running UI tests...$(NC)"
	cd $(UI_DIR) && npm test
	@echo "$(GREEN)✓ UI tests passed$(NC)"

# =============================================================================
# DOCKER TARGETS
# =============================================================================

## docker: Build all Docker images
docker: docker-agent docker-api docker-controller docker-ui
	@echo "$(GREEN)✓ All Docker images built$(NC)"

## docker-agent: Build agent Docker image
docker-agent:
	@echo "$(BLUE)Building agent Docker image...$(NC)"
	docker build -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG) \
		--platform $(DOCKER_PLATFORM) \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_COMMIT=$(GIT_COMMIT) \
		$(AGENT_DIR)
	@echo "$(GREEN)✓ Agent image: $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG)$(NC)"

## docker-api: Build API Docker image
docker-api:
	@echo "$(BLUE)Building API Docker image...$(NC)"
	docker build -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG) \
		--platform $(DOCKER_PLATFORM) \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_COMMIT=$(GIT_COMMIT) \
		$(API_DIR)
	@echo "$(GREEN)✓ API image: $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG)$(NC)"

## docker-controller: Build controller Docker image
docker-controller:
	@echo "$(BLUE)Building controller Docker image...$(NC)"
	docker build -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG) \
		--platform $(DOCKER_PLATFORM) \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_COMMIT=$(GIT_COMMIT) \
		$(CONTROLLER_DIR)
	@echo "$(GREEN)✓ Controller image: $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG)$(NC)"

## docker-ui: Build UI Docker image
docker-ui:
	@echo "$(BLUE)Building UI Docker image...$(NC)"
	docker build -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG) \
		--platform $(DOCKER_PLATFORM) \
		$(UI_DIR)
	@echo "$(GREEN)✓ UI image: $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG)$(NC)"

## docker-no-cache: Build all Docker images without cache
docker-no-cache:
	@echo "$(BLUE)Building all Docker images (no cache)...$(NC)"
	docker build --no-cache -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG) --platform $(DOCKER_PLATFORM) $(AGENT_DIR)
	docker build --no-cache -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG) --platform $(DOCKER_PLATFORM) $(API_DIR)
	docker build --no-cache -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG) --platform $(DOCKER_PLATFORM) $(CONTROLLER_DIR)
	docker build --no-cache -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG) --platform $(DOCKER_PLATFORM) $(UI_DIR)
	@echo "$(GREEN)✓ All images rebuilt$(NC)"

## push: Push all images to registry
push: push-all

## push-all: Push all Docker images to registry
push-all:
	@echo "$(BLUE)Pushing images to $(DOCKER_REGISTRY)...$(NC)"
	docker push $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG)
	docker push $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG)
	docker push $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG)
	docker push $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG)
	@echo "$(GREEN)✓ All images pushed$(NC)"

# =============================================================================
# DOCKER COMPOSE TARGETS
# =============================================================================

## compose-up: Start all services with Docker Compose
compose-up:
	@echo "$(BLUE)Starting services with Docker Compose...$(NC)"
	@echo "$(YELLOW)Detecting architecture...$(NC)"
	$(eval HOST_ARCH := $(shell uname -m))
	$(eval TARGETARCH := $(if $(filter x86_64,$(HOST_ARCH)),amd64,$(if $(filter aarch64 arm64,$(HOST_ARCH)),arm64,amd64)))
	@echo "  Host: $(HOST_ARCH) -> Target: $(TARGETARCH)"
	TARGETARCH=$(TARGETARCH) TARGETOS=linux docker compose up -d --build
	@echo "$(GREEN)✓ Services started$(NC)"
	@echo ""
	@echo "$(CYAN)Access Points:$(NC)"
	@echo "  API:        http://localhost:8080"
	@echo "  Health:     http://localhost:8080/health"
	@echo "  WebSocket:  ws://localhost:8080/ws"
	@echo ""
	@echo "$(YELLOW)View logs: make compose-logs$(NC)"

## compose-up-full: Start all services including UI and demo apps
compose-up-full:
	@echo "$(BLUE)Starting full stack with Docker Compose...$(NC)"
	$(eval HOST_ARCH := $(shell uname -m))
	$(eval TARGETARCH := $(if $(filter x86_64,$(HOST_ARCH)),amd64,$(if $(filter aarch64 arm64,$(HOST_ARCH)),arm64,amd64)))
	TARGETARCH=$(TARGETARCH) TARGETOS=linux docker compose --profile full up -d --build
	@echo "$(GREEN)✓ Full stack started$(NC)"
	@echo ""
	@echo "$(CYAN)Access Points:$(NC)"
	@echo "  API:        http://localhost:8080"
	@echo "  UI:         http://localhost:3000"
	@echo "  Health:     http://localhost:8080/health"

## compose-down: Stop all Docker Compose services
compose-down:
	@echo "$(BLUE)Stopping services...$(NC)"
	docker compose --profile full down
	@echo "$(GREEN)✓ Services stopped$(NC)"

## compose-down-v: Stop services and remove volumes
compose-down-v:
	@echo "$(BLUE)Stopping services and removing volumes...$(NC)"
	docker compose --profile full down -v
	@echo "$(GREEN)✓ Services stopped and volumes removed$(NC)"

## compose-logs: View Docker Compose logs
compose-logs:
	docker compose logs -f

## compose-logs-api: View API server logs
compose-logs-api:
	docker compose logs -f api

## compose-logs-agent: View agent logs
compose-logs-agent:
	docker compose logs -f agent

## compose-logs-controller: View controller logs
compose-logs-controller:
	docker compose logs -f controller

## compose-restart: Restart all services
compose-restart: compose-down compose-up

## compose-rebuild: Rebuild and restart all services
compose-rebuild:
	@echo "$(BLUE)Rebuilding and restarting services...$(NC)"
	$(eval HOST_ARCH := $(shell uname -m))
	$(eval TARGETARCH := $(if $(filter x86_64,$(HOST_ARCH)),amd64,$(if $(filter aarch64 arm64,$(HOST_ARCH)),arm64,amd64)))
	docker compose down
	TARGETARCH=$(TARGETARCH) TARGETOS=linux docker compose build --no-cache
	TARGETARCH=$(TARGETARCH) TARGETOS=linux docker compose up -d
	@echo "$(GREEN)✓ Services rebuilt and restarted$(NC)"

## compose-ps: Show running services
compose-ps:
	docker compose ps

## compose-phase1: Run Phase 1 (Agent + API) tests
compose-phase1:
	@echo "$(BLUE)Starting Phase 1 services...$(NC)"
	$(eval HOST_ARCH := $(shell uname -m))
	$(eval TARGETARCH := $(if $(filter x86_64,$(HOST_ARCH)),amd64,$(if $(filter aarch64 arm64,$(HOST_ARCH)),arm64,amd64)))
	TARGETARCH=$(TARGETARCH) TARGETOS=linux docker compose -f docker-compose.phase1.yml up -d --build
	@echo "$(GREEN)✓ Phase 1 services started$(NC)"
	@echo "  Tests: Agent → API communication"

## compose-phase2: Run Phase 2 (API only) standalone tests
compose-phase2:
	@echo "$(BLUE)Starting Phase 2 services...$(NC)"
	$(eval HOST_ARCH := $(shell uname -m))
	$(eval TARGETARCH := $(if $(filter x86_64,$(HOST_ARCH)),amd64,$(if $(filter aarch64 arm64,$(HOST_ARCH)),arm64,amd64)))
	TARGETARCH=$(TARGETARCH) TARGETOS=linux docker compose -f docker-compose.phase2.yml up -d --build
	@echo "$(GREEN)✓ Phase 2 services started$(NC)"
	@echo "  Tests: API endpoints, database, WebSocket"

## compose-phase3: Run Phase 3 (Controller + API) tests
compose-phase3:
	@echo "$(BLUE)Starting Phase 3 services...$(NC)"
	$(eval HOST_ARCH := $(shell uname -m))
	$(eval TARGETARCH := $(if $(filter x86_64,$(HOST_ARCH)),amd64,$(if $(filter aarch64 arm64,$(HOST_ARCH)),arm64,amd64)))
	TARGETARCH=$(TARGETARCH) TARGETOS=linux docker compose -f docker-compose.phase3.yml up -d --build
	@echo "$(GREEN)✓ Phase 3 services started$(NC)"
	@echo "  Tests: Controller ↔ API integration"

# =============================================================================
# KUBERNETES DEPLOYMENT TARGETS
# =============================================================================

## deploy: Deploy Sentinel to Kubernetes
deploy: deploy-k8s
	@echo "$(GREEN)✓ Sentinel deployed to Kubernetes$(NC)"

## deploy-k8s: Deploy Sentinel components to Kubernetes
deploy-k8s:
	@echo "$(BLUE)Deploying Sentinel to Kubernetes...$(NC)"
	kubectl apply -f $(K8S_DIR)/sentinel/namespace.yaml
	kubectl apply -f $(K8S_DIR)/sentinel/rbac.yaml
	kubectl apply -f $(K8S_DIR)/sentinel/configmap.yaml
	kubectl apply -f $(K8S_DIR)/sentinel/api-deployment.yaml
	kubectl apply -f $(K8S_DIR)/sentinel/agent-daemonset.yaml
	kubectl apply -f $(K8S_DIR)/sentinel/controller-deployment.yaml
	@echo "$(GREEN)✓ Sentinel components deployed$(NC)"

## deploy-demo: Deploy demo application for testing
deploy-demo:
	@echo "$(BLUE)Deploying demo application...$(NC)"
	kubectl apply -f $(K8S_DIR)/demo-app/namespace.yaml
	kubectl apply -f $(K8S_DIR)/demo-app/nginx-deployment.yaml
	kubectl apply -f $(K8S_DIR)/demo-app/redis-deployment.yaml
	@echo "$(GREEN)✓ Demo application deployed$(NC)"

## deploy-all: Deploy everything (Sentinel + demo apps)
deploy-all:
	@echo "$(BLUE)Deploying full stack...$(NC)"
	@$(SCRIPTS_DIR)/deploy-all.sh
	@echo "$(GREEN)✓ Full stack deployed$(NC)"

## undeploy: Remove Sentinel from Kubernetes
undeploy:
	@echo "$(BLUE)Removing Sentinel from Kubernetes...$(NC)"
	-kubectl delete -f $(K8S_DIR)/sentinel/controller-deployment.yaml
	-kubectl delete -f $(K8S_DIR)/sentinel/agent-daemonset.yaml
	-kubectl delete -f $(K8S_DIR)/sentinel/api-deployment.yaml
	-kubectl delete -f $(K8S_DIR)/sentinel/configmap.yaml
	-kubectl delete -f $(K8S_DIR)/sentinel/rbac.yaml
	-kubectl delete -f $(K8S_DIR)/sentinel/namespace.yaml
	@echo "$(GREEN)✓ Sentinel removed$(NC)"

## undeploy-demo: Remove demo application
undeploy-demo:
	@echo "$(BLUE)Removing demo application...$(NC)"
	-kubectl delete -f $(K8S_DIR)/demo-app/
	@echo "$(GREEN)✓ Demo application removed$(NC)"

## undeploy-all: Remove everything from Kubernetes
undeploy-all: undeploy-demo undeploy
	@echo "$(GREEN)✓ All components removed$(NC)"

## k8s-status: Show Kubernetes deployment status
k8s-status:
	@echo "$(BLUE)Sentinel Namespace:$(NC)"
	@kubectl get all -n $(K8S_NAMESPACE) 2>/dev/null || echo "  Namespace not found"
	@echo ""
	@echo "$(BLUE)Demo App Namespace:$(NC)"
	@kubectl get all -n $(K8S_DEMO_NAMESPACE) 2>/dev/null || echo "  Namespace not found"

## k8s-logs-api: View API logs in Kubernetes
k8s-logs-api:
	kubectl logs -f -n $(K8S_NAMESPACE) -l app=sentinel-api

## k8s-logs-agent: View agent logs in Kubernetes
k8s-logs-agent:
	kubectl logs -f -n $(K8S_NAMESPACE) -l app=sentinel-agent

## k8s-logs-controller: View controller logs in Kubernetes
k8s-logs-controller:
	kubectl logs -f -n $(K8S_NAMESPACE) -l app=sentinel-controller

# =============================================================================
# MINIKUBE TARGETS
# =============================================================================

## minikube-setup: Setup minikube cluster for Sentinel
minikube-setup:
	@echo "$(BLUE)Setting up minikube cluster...$(NC)"
	@$(SCRIPTS_DIR)/setup-minikube.sh
	@echo "$(GREEN)✓ Minikube cluster ready$(NC)"

## minikube-start: Start minikube cluster
minikube-start:
	@echo "$(BLUE)Starting minikube...$(NC)"
	minikube start --driver=docker --cpus=4 --memory=8192
	@echo "$(GREEN)✓ Minikube started$(NC)"

## minikube-stop: Stop minikube cluster
minikube-stop:
	@echo "$(BLUE)Stopping minikube...$(NC)"
	minikube stop
	@echo "$(GREEN)✓ Minikube stopped$(NC)"

## minikube-delete: Delete minikube cluster
minikube-delete:
	@echo "$(BLUE)Deleting minikube cluster...$(NC)"
	minikube delete
	@echo "$(GREEN)✓ Minikube deleted$(NC)"

## minikube-dashboard: Open Kubernetes dashboard
minikube-dashboard:
	@echo "$(BLUE)Opening Kubernetes dashboard...$(NC)"
	minikube dashboard &

## minikube-load-images: Load Docker images into minikube
minikube-load-images: docker
	@echo "$(BLUE)Loading images into minikube...$(NC)"
	minikube image load $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG)
	minikube image load $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG)
	minikube image load $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG)
	minikube image load $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG)
	@echo "$(GREEN)✓ Images loaded into minikube$(NC)"

## minikube-tunnel: Start minikube tunnel for LoadBalancer services
minikube-tunnel:
	@echo "$(BLUE)Starting minikube tunnel (requires sudo)...$(NC)"
	minikube tunnel

# =============================================================================
# DEVELOPMENT TARGETS
# =============================================================================

## run-api: Run API server locally
run-api: build-api
	@echo "$(BLUE)Starting API server...$(NC)"
	$(BIN_DIR)/sentinel-api --port 8080 --db-path ./sentinel.db

## run-agent: Run agent locally (demo mode)
run-agent: build-agent
	@echo "$(BLUE)Starting agent (demo mode)...$(NC)"
	DEMO_MODE=true API_ENDPOINT=http://localhost:8080 $(BIN_DIR)/sentinel-agent

## run-controller: Run controller locally (dry-run mode)
run-controller: build-controller
	@echo "$(BLUE)Starting controller (dry-run mode)...$(NC)"
	DRY_RUN=true API_ENDPOINT=http://localhost:8080 $(BIN_DIR)/sentinel-controller

## run-ui: Run UI development server
run-ui:
	@echo "$(BLUE)Starting UI dev server...$(NC)"
	cd $(UI_DIR) && npm run dev

## dev: Show development environment instructions
dev:
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo "$(BLUE)  Development Environment Setup$(NC)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "$(YELLOW)Option 1: Docker Compose (Recommended)$(NC)"
	@echo "  make compose-up       # Start all services"
	@echo "  make compose-logs     # View logs"
	@echo ""
	@echo "$(YELLOW)Option 2: Run components separately$(NC)"
	@echo "  Terminal 1: make run-api"
	@echo "  Terminal 2: make run-agent"
	@echo "  Terminal 3: make run-controller"
	@echo "  Terminal 4: make run-ui"
	@echo ""
	@echo "$(YELLOW)Option 3: Kubernetes (minikube)$(NC)"
	@echo "  make minikube-setup"
	@echo "  make deploy-all"
	@echo ""

# =============================================================================
# CODE QUALITY TARGETS
# =============================================================================

## lint: Run all linters
lint: lint-go lint-ui
	@echo "$(GREEN)✓ All linting passed$(NC)"

## lint-go: Run Go linter
lint-go:
	@echo "$(BLUE)Running Go linter...$(NC)"
	@which golangci-lint > /dev/null || (echo "$(YELLOW)Installing golangci-lint...$(NC)" && go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest)
	cd $(AGENT_DIR) && golangci-lint run ./...
	cd $(API_DIR) && golangci-lint run ./...
	cd $(CONTROLLER_DIR) && golangci-lint run ./...
	@echo "$(GREEN)✓ Go linting passed$(NC)"

## lint-ui: Run UI linter
lint-ui:
	@echo "$(BLUE)Running UI linter...$(NC)"
	cd $(UI_DIR) && npm run lint
	@echo "$(GREEN)✓ UI linting passed$(NC)"

## fmt: Format all Go code
fmt:
	@echo "$(BLUE)Formatting Go code...$(NC)"
	cd $(AGENT_DIR) && $(GO) fmt ./...
	cd $(API_DIR) && $(GO) fmt ./...
	cd $(CONTROLLER_DIR) && $(GO) fmt ./...
	@echo "$(GREEN)✓ Code formatted$(NC)"

## vet: Run go vet on all packages
vet:
	@echo "$(BLUE)Running go vet...$(NC)"
	cd $(AGENT_DIR) && $(GO) vet ./...
	cd $(API_DIR) && $(GO) vet ./...
	cd $(CONTROLLER_DIR) && $(GO) vet ./...
	@echo "$(GREEN)✓ Vet passed$(NC)"

# =============================================================================
# DEPENDENCY MANAGEMENT
# =============================================================================

## deps: Install all dependencies
deps: deps-go deps-ui
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

## deps-go: Download Go dependencies
deps-go:
	@echo "$(BLUE)Downloading Go dependencies...$(NC)"
	cd $(AGENT_DIR) && $(GO) mod download
	cd $(API_DIR) && $(GO) mod download
	cd $(CONTROLLER_DIR) && $(GO) mod download
	@echo "$(GREEN)✓ Go dependencies installed$(NC)"

## deps-ui: Install UI dependencies
deps-ui:
	@echo "$(BLUE)Installing UI dependencies...$(NC)"
	cd $(UI_DIR) && npm install
	@echo "$(GREEN)✓ UI dependencies installed$(NC)"

## deps-tools: Install development tools
deps-tools:
	@echo "$(BLUE)Installing development tools...$(NC)"
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install golang.org/x/tools/cmd/goimports@latest
	@echo "$(GREEN)✓ Development tools installed$(NC)"

# =============================================================================
# UTILITY TARGETS
# =============================================================================

## clean: Clean build artifacts
clean:
	@echo "$(BLUE)Cleaning build artifacts...$(NC)"
	rm -rf $(BIN_DIR)
	rm -rf coverage/
	rm -f sentinel.db
	cd $(UI_DIR) && rm -rf dist/ node_modules/.cache/
	@echo "$(GREEN)✓ Cleaned$(NC)"

## clean-docker: Remove Docker images and volumes
clean-docker:
	@echo "$(BLUE)Cleaning Docker resources...$(NC)"
	-docker compose down -v --rmi local
	-docker image rm $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG) 2>/dev/null
	-docker image rm $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG) 2>/dev/null
	-docker image rm $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG) 2>/dev/null
	-docker image rm $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG) 2>/dev/null
	@echo "$(GREEN)✓ Docker resources cleaned$(NC)"

## clean-all: Clean everything
clean-all: clean clean-docker
	@echo "$(GREEN)✓ All artifacts cleaned$(NC)"

## health-check: Check health of running services
health-check:
	@echo "$(BLUE)Checking service health...$(NC)"
	@echo ""
	@echo "$(CYAN)API Health:$(NC)"
	@curl -s http://localhost:8080/health | jq . 2>/dev/null || echo "  $(RED)API not responding$(NC)"
	@echo ""
	@echo "$(CYAN)Docker Services:$(NC)"
	@docker compose ps 2>/dev/null || echo "  No Docker services running"

## api-test: Quick API endpoint tests
api-test:
	@echo "$(BLUE)Testing API endpoints...$(NC)"
	@echo ""
	@echo "$(CYAN)GET /health$(NC)"
	@curl -s http://localhost:8080/health | jq .
	@echo ""
	@echo "$(CYAN)GET /api/stats$(NC)"
	@curl -s http://localhost:8080/api/stats | jq .
	@echo ""
	@echo "$(CYAN)GET /api/leaderboard$(NC)"
	@curl -s http://localhost:8080/api/leaderboard | jq .
	@echo ""
	@echo "$(GREEN)✓ API tests complete$(NC)"

## simulate-attack: Simulate a drift attack for testing
simulate-attack:
	@echo "$(BLUE)Simulating drift attack...$(NC)"
	@$(SCRIPTS_DIR)/simulate-attack.sh
	@echo "$(GREEN)✓ Attack simulation complete$(NC)"

# =============================================================================
# INFORMATION TARGETS
# =============================================================================

## version: Show version information
version:
	@echo "$(BLUE)Sentinel Version Information$(NC)"
	@echo "  Version:    $(VERSION)"
	@echo "  Git Commit: $(GIT_COMMIT)"
	@echo "  Build Time: $(BUILD_TIME)"
	@echo "  Go Version: $(shell $(GO) version 2>/dev/null || echo 'N/A')"
	@echo "  Docker:     $(shell docker --version 2>/dev/null || echo 'N/A')"

## info: Show project information
info:
	@echo "$(BLUE)Sentinel Project Information$(NC)"
	@echo "  Project:     $(PROJECT_NAME)"
	@echo "  Root:        $(ROOT_DIR)"
	@echo "  Registry:    $(DOCKER_REGISTRY)"
	@echo "  K8s NS:      $(K8S_NAMESPACE)"
	@echo "  Demo NS:     $(K8S_DEMO_NAMESPACE)"
	@echo ""
	@echo "$(CYAN)Components:$(NC)"
	@echo "  Agent:      $(AGENT_DIR)"
	@echo "  API:        $(API_DIR)"
	@echo "  Controller: $(CONTROLLER_DIR)"
	@echo "  UI:         $(UI_DIR)"

# =============================================================================
# HELP TARGET
# =============================================================================

## help: Show this help message
help:
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo "$(BLUE)  SENTINEL - Kubernetes Pod Entropy Monitoring System$(NC)"
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "$(YELLOW)Usage:$(NC) make [target]"
	@echo ""
	@echo "$(MAGENTA)Build Targets:$(NC)"
	@echo "  $(GREEN)build$(NC)              Build all Go components"
	@echo "  $(GREEN)build-agent$(NC)        Build the entropy agent binary"
	@echo "  $(GREEN)build-api$(NC)          Build the API server binary"
	@echo "  $(GREEN)build-controller$(NC)   Build the purge controller binary"
	@echo "  $(GREEN)build-ui$(NC)           Build the UI for production"
	@echo ""
	@echo "$(MAGENTA)Test Targets:$(NC)"
	@echo "  $(GREEN)test$(NC)               Run all tests"
	@echo "  $(GREEN)test-unit$(NC)          Run unit tests"
	@echo "  $(GREEN)test-integration$(NC)   Run integration tests"
	@echo "  $(GREEN)test-e2e$(NC)           Run end-to-end tests"
	@echo "  $(GREEN)test-coverage$(NC)      Generate coverage report"
	@echo ""
	@echo "$(MAGENTA)Docker Targets:$(NC)"
	@echo "  $(GREEN)docker$(NC)             Build all Docker images"
	@echo "  $(GREEN)docker-agent$(NC)       Build agent Docker image"
	@echo "  $(GREEN)docker-api$(NC)         Build API Docker image"
	@echo "  $(GREEN)docker-controller$(NC)  Build controller Docker image"
	@echo "  $(GREEN)push$(NC)               Push all images to registry"
	@echo ""
	@echo "$(MAGENTA)Docker Compose:$(NC)"
	@echo "  $(GREEN)compose-up$(NC)         Start all services"
	@echo "  $(GREEN)compose-up-full$(NC)    Start all services including UI"
	@echo "  $(GREEN)compose-down$(NC)       Stop all services"
	@echo "  $(GREEN)compose-logs$(NC)       View service logs"
	@echo "  $(GREEN)compose-rebuild$(NC)    Rebuild and restart services"
	@echo "  $(GREEN)compose-phase1$(NC)     Test Agent + API integration"
	@echo "  $(GREEN)compose-phase2$(NC)     Test API standalone"
	@echo "  $(GREEN)compose-phase3$(NC)     Test Controller + API integration"
	@echo ""
	@echo "$(MAGENTA)Kubernetes:$(NC)"
	@echo "  $(GREEN)deploy$(NC)             Deploy Sentinel to Kubernetes"
	@echo "  $(GREEN)deploy-all$(NC)         Deploy Sentinel + demo apps"
	@echo "  $(GREEN)deploy-demo$(NC)        Deploy demo application"
	@echo "  $(GREEN)undeploy$(NC)           Remove Sentinel from Kubernetes"
	@echo "  $(GREEN)k8s-status$(NC)         Show deployment status"
	@echo ""
	@echo "$(MAGENTA)Minikube:$(NC)"
	@echo "  $(GREEN)minikube-setup$(NC)     Setup minikube cluster"
	@echo "  $(GREEN)minikube-start$(NC)     Start minikube"
	@echo "  $(GREEN)minikube-stop$(NC)      Stop minikube"
	@echo "  $(GREEN)minikube-load-images$(NC) Load Docker images into minikube"
	@echo ""
	@echo "$(MAGENTA)Development:$(NC)"
	@echo "  $(GREEN)run-api$(NC)            Run API server locally"
	@echo "  $(GREEN)run-agent$(NC)          Run agent locally (demo mode)"
	@echo "  $(GREEN)run-ui$(NC)             Run UI dev server"
	@echo "  $(GREEN)dev$(NC)                Show dev environment setup"
	@echo ""
	@echo "$(MAGENTA)Utilities:$(NC)"
	@echo "  $(GREEN)lint$(NC)               Run all linters"
	@echo "  $(GREEN)fmt$(NC)                Format Go code"
	@echo "  $(GREEN)deps$(NC)               Install dependencies"
	@echo "  $(GREEN)clean$(NC)              Clean build artifacts"
	@echo "  $(GREEN)health-check$(NC)       Check service health"
	@echo "  $(GREEN)api-test$(NC)           Quick API endpoint tests"
	@echo "  $(GREEN)simulate-attack$(NC)    Test drift detection"
	@echo ""
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "$(YELLOW)Quick Start (Docker Compose):$(NC)"
	@echo "  1. make deps          # Install dependencies"
	@echo "  2. make compose-up    # Start services"
	@echo "  3. make health-check  # Verify services"
	@echo "  4. make api-test      # Test API endpoints"
	@echo ""
	@echo "$(YELLOW)Quick Start (Kubernetes):$(NC)"
	@echo "  1. make minikube-setup       # Setup cluster"
	@echo "  2. make docker               # Build images"
	@echo "  3. make minikube-load-images # Load into minikube"
	@echo "  4. make deploy-all           # Deploy stack"
	@echo "  5. make simulate-attack      # Test drift detection"
	@echo ""
