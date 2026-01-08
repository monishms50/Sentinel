# =============================================================================
# SENTINEL - Kubernetes Pod Entropy Monitoring System
# =============================================================================
# Makefile for build, test, and deployment automation
# =============================================================================

.PHONY: all build build-agent build-api build-controller build-ui \
        test test-unit test-integration test-e2e \
        docker docker-agent docker-api docker-controller docker-ui \
        push push-agent push-api push-controller push-ui \
        run run-api run-ui dev dev-api dev-ui \
        deploy deploy-k8s deploy-demo undeploy \
        lint lint-go lint-ui fmt clean help \
        compose-up compose-down compose-logs \
        minikube-setup minikube-start minikube-stop minikube-delete \
        simulate-attack

# =============================================================================
# CONFIGURATION
# =============================================================================

# Project settings
PROJECT_NAME := sentinel
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S')

# Go settings
GO := go
GOFLAGS := -ldflags "-X main.Version=$(VERSION) -X main.GitCommit=$(GIT_COMMIT) -X main.BuildTime=$(BUILD_TIME)"
GOOS ?= linux
GOARCH ?= amd64

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
NC := \033[0m # No Color

# =============================================================================
# DEFAULT TARGET
# =============================================================================

all: build

# =============================================================================
# BUILD TARGETS
# =============================================================================

## build: Build all components
build: build-agent build-api build-controller build-ui
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

## build-ui: Build the UI (production)
build-ui:
	@echo "$(BLUE)Building UI...$(NC)"
	cd $(UI_DIR) && npm ci && npm run build
	@echo "$(GREEN)✓ UI built: $(UI_DIR)/dist$(NC)"

# =============================================================================
# TEST TARGETS
# =============================================================================

## test: Run all tests
test: test-unit test-integration
	@echo "$(GREEN)✓ All tests passed$(NC)"

## test-unit: Run unit tests for all Go components
test-unit:
	@echo "$(BLUE)Running unit tests...$(NC)"
	cd $(AGENT_DIR) && $(GO) test -v -race -cover ./...
	cd $(API_DIR) && $(GO) test -v -race -cover ./...
	cd $(CONTROLLER_DIR) && $(GO) test -v -race -cover ./...
	@echo "$(GREEN)✓ Unit tests passed$(NC)"

## test-integration: Run integration tests
test-integration:
	@echo "$(BLUE)Running integration tests...$(NC)"
	@if [ -f $(SCRIPTS_DIR)/test-phase2.sh ]; then \
		chmod +x $(SCRIPTS_DIR)/test-phase2.sh && \
		$(SCRIPTS_DIR)/test-phase2.sh; \
	else \
		echo "$(YELLOW)⚠ Integration test script not found$(NC)"; \
	fi

## test-e2e: Run end-to-end tests (requires K8s cluster)
test-e2e:
	@echo "$(BLUE)Running E2E tests...$(NC)"
	@if [ -f $(SCRIPTS_DIR)/test-phase1.sh ]; then \
		chmod +x $(SCRIPTS_DIR)/test-phase1.sh && \
		$(SCRIPTS_DIR)/test-phase1.sh; \
	fi
	@if [ -f $(SCRIPTS_DIR)/test-phase3.sh ]; then \
		chmod +x $(SCRIPTS_DIR)/test-phase3.sh && \
		$(SCRIPTS_DIR)/test-phase3.sh; \
	fi

## test-ui: Run UI tests
test-ui:
	@echo "$(BLUE)Running UI tests...$(NC)"
	cd $(UI_DIR) && npm test

## test-coverage: Generate test coverage report
test-coverage:
	@echo "$(BLUE)Generating coverage report...$(NC)"
	@mkdir -p $(ROOT_DIR)/coverage
	cd $(AGENT_DIR) && $(GO) test -coverprofile=$(ROOT_DIR)/coverage/agent.out ./...
	cd $(API_DIR) && $(GO) test -coverprofile=$(ROOT_DIR)/coverage/api.out ./...
	cd $(CONTROLLER_DIR) && $(GO) test -coverprofile=$(ROOT_DIR)/coverage/controller.out ./...
	$(GO) tool cover -html=$(ROOT_DIR)/coverage/agent.out -o $(ROOT_DIR)/coverage/agent.html
	$(GO) tool cover -html=$(ROOT_DIR)/coverage/api.out -o $(ROOT_DIR)/coverage/api.html
	$(GO) tool cover -html=$(ROOT_DIR)/coverage/controller.out -o $(ROOT_DIR)/coverage/controller.html
	@echo "$(GREEN)✓ Coverage reports generated in coverage/$(NC)"

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
	docker build --no-cache -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG) $(AGENT_DIR)
	docker build --no-cache -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG) $(API_DIR)
	docker build --no-cache -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG) $(CONTROLLER_DIR)
	docker build --no-cache -t $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG) $(UI_DIR)
	@echo "$(GREEN)✓ All images rebuilt$(NC)"

# =============================================================================
# PUSH TARGETS
# =============================================================================

## push: Push all Docker images to registry
push: push-agent push-api push-controller push-ui
	@echo "$(GREEN)✓ All images pushed$(NC)"

## push-agent: Push agent image to registry
push-agent:
	@echo "$(BLUE)Pushing agent image...$(NC)"
	docker push $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG)

## push-api: Push API image to registry
push-api:
	@echo "$(BLUE)Pushing API image...$(NC)"
	docker push $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG)

## push-controller: Push controller image to registry
push-controller:
	@echo "$(BLUE)Pushing controller image...$(NC)"
	docker push $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG)

## push-ui: Push UI image to registry
push-ui:
	@echo "$(BLUE)Pushing UI image...$(NC)"
	docker push $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG)

# =============================================================================
# RUN TARGETS (Local Development)
# =============================================================================

## run-api: Run API server locally
run-api:
	@echo "$(BLUE)Starting API server...$(NC)"
	cd $(API_DIR) && $(GO) run . --port 8080 --db-path ./sentinel.db

## run-ui: Run UI development server
run-ui:
	@echo "$(BLUE)Starting UI dev server...$(NC)"
	cd $(UI_DIR) && npm run dev

## dev: Run full development environment (requires tmux or multiple terminals)
dev:
	@echo "$(BLUE)Starting development environment...$(NC)"
	@echo "Run these commands in separate terminals:"
	@echo "  make run-api    # Terminal 1: API server"
	@echo "  make run-ui     # Terminal 2: UI dev server"
	@echo ""
	@echo "Or use: make compose-up for Docker-based development"

# =============================================================================
# DOCKER COMPOSE TARGETS
# =============================================================================

## compose-up: Start all services with Docker Compose
compose-up:
	@echo "$(BLUE)Starting services with Docker Compose...$(NC)"
	docker compose up -d --build
	@echo "$(GREEN)✓ Services started$(NC)"
	@echo "  API:    http://localhost:8080"
	@echo "  UI:     http://localhost:3000"
	@echo "  Health: http://localhost:8080/health"

## compose-down: Stop all Docker Compose services
compose-down:
	@echo "$(BLUE)Stopping services...$(NC)"
	docker compose down
	@echo "$(GREEN)✓ Services stopped$(NC)"

## compose-down-v: Stop services and remove volumes
compose-down-v:
	@echo "$(BLUE)Stopping services and removing volumes...$(NC)"
	docker compose down -v
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
	docker compose down
	docker compose build --no-cache
	docker compose up -d
	@echo "$(GREEN)✓ Services rebuilt and restarted$(NC)"

## compose-phase1: Run Phase 1 (Agent + API) tests
compose-phase1:
	@echo "$(BLUE)Starting Phase 1 services...$(NC)"
	docker compose -f docker-compose.phase1.yml up -d --build
	@echo "$(GREEN)✓ Phase 1 services started$(NC)"

## compose-phase2: Run Phase 2 (API only) tests
compose-phase2:
	@echo "$(BLUE)Starting Phase 2 services...$(NC)"
	docker compose -f docker-compose.phase2.yml up -d --build
	@echo "$(GREEN)✓ Phase 2 services started$(NC)"

## compose-phase3: Run Phase 3 (Controller + API) tests
compose-phase3:
	@echo "$(BLUE)Starting Phase 3 services...$(NC)"
	docker compose -f docker-compose.phase3.yml up -d --build
	@echo "$(GREEN)✓ Phase 3 services started$(NC)"

# =============================================================================
# KUBERNETES DEPLOYMENT TARGETS
# =============================================================================

## deploy: Deploy full stack to Kubernetes
deploy: deploy-k8s
	@echo "$(GREEN)✓ Sentinel deployed to Kubernetes$(NC)"

## deploy-k8s: Deploy Sentinel components to Kubernetes
deploy-k8s:
	@echo "$(BLUE)Deploying to Kubernetes...$(NC)"
	kubectl apply -f $(K8S_DIR)/sentinel/namespace.yaml
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
	kubectl apply -f $(K8S_DIR)/demo-app/postgres-deployment.yaml
	@echo "$(GREEN)✓ Demo application deployed$(NC)"

## deploy-all: Deploy everything (Sentinel + Demo app)
deploy-all: deploy-k8s deploy-demo
	@echo "$(GREEN)✓ Full stack deployed$(NC)"

## undeploy: Remove Sentinel from Kubernetes
undeploy:
	@echo "$(BLUE)Removing Sentinel from Kubernetes...$(NC)"
	-kubectl delete -f $(K8S_DIR)/sentinel/controller-deployment.yaml
	-kubectl delete -f $(K8S_DIR)/sentinel/agent-daemonset.yaml
	-kubectl delete -f $(K8S_DIR)/sentinel/api-deployment.yaml
	-kubectl delete -f $(K8S_DIR)/sentinel/configmap.yaml
	-kubectl delete -f $(K8S_DIR)/sentinel/namespace.yaml
	@echo "$(GREEN)✓ Sentinel removed$(NC)"

## undeploy-demo: Remove demo application
undeploy-demo:
	@echo "$(BLUE)Removing demo application...$(NC)"
	-kubectl delete -f $(K8S_DIR)/demo-app/
	@echo "$(GREEN)✓ Demo application removed$(NC)"

## undeploy-all: Remove everything
undeploy-all: undeploy undeploy-demo
	@echo "$(GREEN)✓ All components removed$(NC)"

## k8s-status: Show Kubernetes deployment status
k8s-status:
	@echo "$(BLUE)Sentinel Status:$(NC)"
	-kubectl get all -n $(K8S_NAMESPACE)
	@echo ""
	@echo "$(BLUE)Demo App Status:$(NC)"
	-kubectl get all -n $(K8S_DEMO_NAMESPACE)

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

## minikube-setup: Full minikube setup with addons
minikube-setup: minikube-start
	@echo "$(BLUE)Configuring minikube addons...$(NC)"
	minikube addons enable ingress
	minikube addons enable metrics-server
	minikube addons enable dashboard
	@echo "$(GREEN)✓ Minikube setup complete$(NC)"
	@echo ""
	@echo "Run 'make deploy-all' to deploy Sentinel"

## minikube-start: Start minikube cluster
minikube-start:
	@echo "$(BLUE)Starting minikube...$(NC)"
	minikube start --cpus=4 --memory=8192 --driver=docker
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

## minikube-dashboard: Open minikube dashboard
minikube-dashboard:
	minikube dashboard

## minikube-tunnel: Start minikube tunnel for LoadBalancer services
minikube-tunnel:
	@echo "$(BLUE)Starting minikube tunnel (requires sudo)...$(NC)"
	minikube tunnel

## minikube-load-images: Load Docker images into minikube
minikube-load-images: docker
	@echo "$(BLUE)Loading images into minikube...$(NC)"
	minikube image load $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG)
	minikube image load $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG)
	minikube image load $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG)
	minikube image load $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG)
	@echo "$(GREEN)✓ Images loaded into minikube$(NC)"

# =============================================================================
# SIMULATION & TESTING TARGETS
# =============================================================================

## simulate-attack: Run attack simulation to test drift detection
simulate-attack:
	@echo "$(BLUE)Running attack simulation...$(NC)"
	@if [ -f $(SCRIPTS_DIR)/simulate-attack.sh ]; then \
		chmod +x $(SCRIPTS_DIR)/simulate-attack.sh && \
		$(SCRIPTS_DIR)/simulate-attack.sh; \
	else \
		echo "$(YELLOW)⚠ simulate-attack.sh not found. Creating...$(NC)"; \
		echo "Run 'make create-scripts' first"; \
	fi

## health-check: Check health of all services
health-check:
	@echo "$(BLUE)Checking service health...$(NC)"
	@echo -n "API Server: "
	@curl -sf http://localhost:8080/health && echo "$(GREEN)✓ Healthy$(NC)" || echo "$(RED)✗ Unhealthy$(NC)"
	@echo -n "UI Server:  "
	@curl -sf http://localhost:3000 > /dev/null && echo "$(GREEN)✓ Healthy$(NC)" || echo "$(RED)✗ Unhealthy$(NC)"

## api-test: Quick API endpoint tests
api-test:
	@echo "$(BLUE)Testing API endpoints...$(NC)"
	@echo "Health:"
	curl -s http://localhost:8080/health | jq .
	@echo "\nLeaderboard:"
	curl -s http://localhost:8080/api/leaderboard | jq .
	@echo "\nStats:"
	curl -s http://localhost:8080/api/stats | jq .
	@echo "\nPods:"
	curl -s http://localhost:8080/api/pods | jq .

# =============================================================================
# LINT & FORMAT TARGETS
# =============================================================================

## lint: Run all linters
lint: lint-go lint-ui
	@echo "$(GREEN)✓ All linting passed$(NC)"

## lint-go: Run Go linter
lint-go:
	@echo "$(BLUE)Linting Go code...$(NC)"
	@if command -v golangci-lint &> /dev/null; then \
		cd $(AGENT_DIR) && golangci-lint run ./...; \
		cd $(API_DIR) && golangci-lint run ./...; \
		cd $(CONTROLLER_DIR) && golangci-lint run ./...; \
	else \
		echo "$(YELLOW)⚠ golangci-lint not installed. Running go vet instead...$(NC)"; \
		cd $(AGENT_DIR) && $(GO) vet ./...; \
		cd $(API_DIR) && $(GO) vet ./...; \
		cd $(CONTROLLER_DIR) && $(GO) vet ./...; \
	fi
	@echo "$(GREEN)✓ Go linting passed$(NC)"

## lint-ui: Run UI linter
lint-ui:
	@echo "$(BLUE)Linting UI code...$(NC)"
	cd $(UI_DIR) && npm run lint
	@echo "$(GREEN)✓ UI linting passed$(NC)"

## fmt: Format all code
fmt: fmt-go fmt-ui
	@echo "$(GREEN)✓ All code formatted$(NC)"

## fmt-go: Format Go code
fmt-go:
	@echo "$(BLUE)Formatting Go code...$(NC)"
	cd $(AGENT_DIR) && $(GO) fmt ./...
	cd $(API_DIR) && $(GO) fmt ./...
	cd $(CONTROLLER_DIR) && $(GO) fmt ./...
	@echo "$(GREEN)✓ Go code formatted$(NC)"

## fmt-ui: Format UI code
fmt-ui:
	@echo "$(BLUE)Formatting UI code...$(NC)"
	cd $(UI_DIR) && npm run format || npm run lint -- --fix
	@echo "$(GREEN)✓ UI code formatted$(NC)"

# =============================================================================
# DEPENDENCY MANAGEMENT
# =============================================================================

## deps: Install all dependencies
deps: deps-go deps-ui
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

## deps-go: Install Go dependencies
deps-go:
	@echo "$(BLUE)Installing Go dependencies...$(NC)"
	cd $(AGENT_DIR) && $(GO) mod download && $(GO) mod tidy
	cd $(API_DIR) && $(GO) mod download && $(GO) mod tidy
	cd $(CONTROLLER_DIR) && $(GO) mod download && $(GO) mod tidy
	@echo "$(GREEN)✓ Go dependencies installed$(NC)"

## deps-ui: Install UI dependencies
deps-ui:
	@echo "$(BLUE)Installing UI dependencies...$(NC)"
	cd $(UI_DIR) && npm ci
	@echo "$(GREEN)✓ UI dependencies installed$(NC)"

## deps-update: Update all dependencies
deps-update:
	@echo "$(BLUE)Updating dependencies...$(NC)"
	cd $(AGENT_DIR) && $(GO) get -u ./... && $(GO) mod tidy
	cd $(API_DIR) && $(GO) get -u ./... && $(GO) mod tidy
	cd $(CONTROLLER_DIR) && $(GO) get -u ./... && $(GO) mod tidy
	cd $(UI_DIR) && npm update
	@echo "$(GREEN)✓ Dependencies updated$(NC)"

# =============================================================================
# CLEAN TARGETS
# =============================================================================

## clean: Clean all build artifacts
clean: clean-bin clean-docker clean-ui
	@echo "$(GREEN)✓ All artifacts cleaned$(NC)"

## clean-bin: Remove binary files
clean-bin:
	@echo "$(BLUE)Cleaning binaries...$(NC)"
	rm -rf $(BIN_DIR)
	rm -f $(AGENT_DIR)/sentinel-agent
	rm -f $(API_DIR)/sentinel-api
	rm -f $(CONTROLLER_DIR)/sentinel-controller
	@echo "$(GREEN)✓ Binaries cleaned$(NC)"

## clean-docker: Remove Docker images
clean-docker:
	@echo "$(BLUE)Cleaning Docker images...$(NC)"
	-docker rmi $(DOCKER_REGISTRY)/$(PROJECT_NAME)-agent:$(DOCKER_TAG)
	-docker rmi $(DOCKER_REGISTRY)/$(PROJECT_NAME)-api:$(DOCKER_TAG)
	-docker rmi $(DOCKER_REGISTRY)/$(PROJECT_NAME)-controller:$(DOCKER_TAG)
	-docker rmi $(DOCKER_REGISTRY)/$(PROJECT_NAME)-ui:$(DOCKER_TAG)
	@echo "$(GREEN)✓ Docker images cleaned$(NC)"

## clean-ui: Clean UI build artifacts
clean-ui:
	@echo "$(BLUE)Cleaning UI artifacts...$(NC)"
	rm -rf $(UI_DIR)/dist
	rm -rf $(UI_DIR)/node_modules/.cache
	@echo "$(GREEN)✓ UI artifacts cleaned$(NC)"

## clean-all: Deep clean including node_modules and go cache
clean-all: clean
	@echo "$(BLUE)Deep cleaning...$(NC)"
	rm -rf $(UI_DIR)/node_modules
	$(GO) clean -cache -modcache
	docker system prune -f
	@echo "$(GREEN)✓ Deep clean complete$(NC)"

# =============================================================================
# VERSION & INFO TARGETS
# =============================================================================

## version: Show version information
version:
	@echo "$(BLUE)Sentinel Version Information$(NC)"
	@echo "  Version:    $(VERSION)"
	@echo "  Git Commit: $(GIT_COMMIT)"
	@echo "  Build Time: $(BUILD_TIME)"
	@echo "  Go Version: $(shell $(GO) version)"
	@echo "  Docker:     $(shell docker --version)"

## info: Show project information
info:
	@echo "$(BLUE)Sentinel Project Information$(NC)"
	@echo "  Project:     $(PROJECT_NAME)"
	@echo "  Root:        $(ROOT_DIR)"
	@echo "  Registry:    $(DOCKER_REGISTRY)"
	@echo "  K8s NS:      $(K8S_NAMESPACE)"
	@echo "  Demo NS:     $(K8S_DEMO_NAMESPACE)"
	@echo ""
	@echo "Components:"
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
	@echo "$(YELLOW)Build Targets:$(NC)"
	@grep -E '^## build' $(MAKEFILE_LIST) | sed 's/## /  /' | awk -F': ' '{printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Test Targets:$(NC)"
	@grep -E '^## test' $(MAKEFILE_LIST) | sed 's/## /  /' | awk -F': ' '{printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Docker Targets:$(NC)"
	@grep -E '^## docker|^## push' $(MAKEFILE_LIST) | sed 's/## /  /' | awk -F': ' '{printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Docker Compose:$(NC)"
	@grep -E '^## compose' $(MAKEFILE_LIST) | sed 's/## /  /' | awk -F': ' '{printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Kubernetes Targets:$(NC)"
	@grep -E '^## deploy|^## undeploy|^## k8s' $(MAKEFILE_LIST) | sed 's/## /  /' | awk -F': ' '{printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Minikube Targets:$(NC)"
	@grep -E '^## minikube' $(MAKEFILE_LIST) | sed 's/## /  /' | awk -F': ' '{printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Development:$(NC)"
	@grep -E '^## run|^## dev|^## lint|^## fmt|^## deps' $(MAKEFILE_LIST) | sed 's/## /  /' | awk -F': ' '{printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@grep -E '^## clean|^## version|^## info|^## help|^## health|^## api-test|^## simulate' $(MAKEFILE_LIST) | sed 's/## /  /' | awk -F': ' '{printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(BLUE)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(NC)"
	@echo ""
	@echo "$(YELLOW)Quick Start:$(NC)"
	@echo "  1. make deps          # Install dependencies"
	@echo "  2. make build         # Build all components"
	@echo "  3. make compose-up    # Start with Docker Compose"
	@echo "  4. make health-check  # Verify services are running"
	@echo ""
	@echo "$(YELLOW)Kubernetes Quick Start:$(NC)"
	@echo "  1. make minikube-setup    # Setup minikube cluster"
	@echo "  2. make docker            # Build Docker images"
	@echo "  3. make minikube-load-images  # Load images into minikube"
	@echo "  4. make deploy-all        # Deploy Sentinel + demo app"
	@echo "  5. make simulate-attack   # Test drift detection"
	@echo ""