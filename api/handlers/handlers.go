package handlers

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/monishms50/Sentinel/api/models"
	"github.com/monishms50/Sentinel/api/store"
	"github.com/monishms50/Sentinel/api/websocket"
)

// Handler contains all HTTP handlers
type Handler struct {
	store *store.Store
	hub   *websocket.Hub
}

// NewHandler creates a new handler instance
func NewHandler(store *store.Store, hub *websocket.Hub) *Handler {
	return &Handler{
		store: store,
		hub:   hub,
	}
}

// RegisterRoutes registers all API routes
func (h *Handler) RegisterRoutes(app *fiber.App) {
	// Health check
	app.Get("/health", h.HealthCheck)

	// API group
	api := app.Group("/api")

	// Pod endpoints
	api.Get("/pods", h.ListPods)
	api.Get("/pods/:id", h.GetPod)
	api.Get("/pods/:id/baseline", h.GetPodBaseline)
	api.Get("/pods/:id/events", h.GetPodEvents)
	api.Get("/pods/:id/history", h.GetPodHistory)
	api.Delete("/pods/:id", h.DeletePod)

	// Leaderboard
	api.Get("/leaderboard", h.GetLeaderboard)

	// Stats
	api.Get("/stats", h.GetClusterStats)

	// Events
	api.Get("/events", h.GetRecentEvents)

	// Config
	api.Get("/config", h.GetConfig)
	api.Put("/config", h.UpdateConfig)

	// Agent endpoints (called by agents)
	api.Post("/baselines", h.ReceiveBaseline)
	api.Post("/drift", h.ReceiveDrift)
	api.Post("/scores", h.ReceiveScore)
	api.Post("/pods/removed", h.PodRemoved)
	api.Post("/agents/heartbeat", h.AgentHeartbeat)
}

// ============ Health Check ============

// HealthCheck returns the API health status
func (h *Handler) HealthCheck(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":    "healthy",
		"timestamp": time.Now().UTC(),
	})
}

// ============ Pod Endpoints ============

// ListPods returns all monitored pods
func (h *Handler) ListPods(c *fiber.Ctx) error {
	namespace := c.Query("namespace")

	var pods []models.Pod
	var err error

	if namespace != "" {
		pods, err = h.store.ListPodsByNamespace(namespace)
	} else {
		pods, err = h.store.ListPods()
	}

	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    pods,
	})
}

// GetPod returns a single pod with details
func (h *Handler) GetPod(c *fiber.Ctx) error {
	id := c.Params("id")

	pod, err := h.store.GetPod(id)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}
	if pod == nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Pod not found",
		})
	}

	// Get additional details
	events, _ := h.store.GetDriftEvents(id, 50)
	eventCount, _ := h.store.CountDriftEvents(id)
	history, _ := h.store.GetScoreHistory(id, 1)

	detail := models.PodDetail{
		Pod:          *pod,
		RecentEvents: events,
		EventCount:   eventCount,
	}

	if len(history) > 0 {
		detail.ScoreBreakdown = history[0].ScoreBreakdown
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    detail,
	})
}

// GetPodBaseline returns the baseline for a pod
func (h *Handler) GetPodBaseline(c *fiber.Ctx) error {
	id := c.Params("id")

	baseline, err := h.store.GetBaseline(id)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}
	if baseline == nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Baseline not found",
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    baseline,
	})
}

// GetPodEvents returns drift events for a pod
func (h *Handler) GetPodEvents(c *fiber.Ctx) error {
	id := c.Params("id")
	limit := c.QueryInt("limit", 100)

	events, err := h.store.GetDriftEvents(id, limit)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    events,
	})
}

// GetPodHistory returns score history for a pod
func (h *Handler) GetPodHistory(c *fiber.Ctx) error {
	id := c.Params("id")
	limit := c.QueryInt("limit", 100)

	history, err := h.store.GetScoreHistory(id, limit)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    history,
	})
}

// DeletePod triggers a pod purge
func (h *Handler) DeletePod(c *fiber.Ctx) error {
	id := c.Params("id")

	pod, err := h.store.GetPod(id)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}
	if pod == nil {
		return c.Status(404).JSON(models.APIResponse{
			Success: false,
			Error:   "Pod not found",
		})
	}

	// Log the purge
	if err := h.store.LogPurge(pod.UID, pod.Name, pod.Namespace, "manual", pod.Score); err != nil {
		fmt.Printf("Failed to log purge: %v\n", err)
	}

	// Delete from store
	if err := h.store.DeletePod(id); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	// Broadcast pod removal
	h.hub.Broadcast(models.WebSocketMessage{
		Type: "pod_removed",
		Payload: map[string]string{
			"podUID":    pod.UID,
			"podName":   pod.Name,
			"namespace": pod.Namespace,
		},
	})

	return c.JSON(models.APIResponse{
		Success: true,
		Message: fmt.Sprintf("Pod %s marked for purge", pod.Name),
	})
}

// ============ Leaderboard ============

// GetLeaderboard returns pods sorted by score
func (h *Handler) GetLeaderboard(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 50)

	entries, err := h.store.GetLeaderboard(limit)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    entries,
	})
}

// ============ Stats ============

// GetClusterStats returns cluster-wide statistics
func (h *Handler) GetClusterStats(c *fiber.Ctx) error {
	stats, err := h.store.GetClusterStats()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    stats,
	})
}

// ============ Events ============

// GetRecentEvents returns recent drift events
func (h *Handler) GetRecentEvents(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 100)

	events, err := h.store.GetRecentDriftEvents(limit)
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    events,
	})
}

// ============ Config ============

// GetConfig returns the current configuration
func (h *Handler) GetConfig(c *fiber.Ctx) error {
	config, err := h.store.GetPurgeConfig()
	if err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Data:    config,
	})
}

// UpdateConfig updates the configuration
func (h *Handler) UpdateConfig(c *fiber.Ctx) error {
	var config models.PurgeConfig
	if err := c.BodyParser(&config); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	if err := h.store.SavePurgeConfig(&config); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	// Broadcast config update
	h.hub.Broadcast(models.WebSocketMessage{
		Type:    "config_update",
		Payload: config,
	})

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Configuration updated",
		Data:    config,
	})
}

// ============ Agent Endpoints ============

// ReceiveBaseline receives a baseline from an agent
func (h *Handler) ReceiveBaseline(c *fiber.Ctx) error {
	var req models.BaselineRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Create or update pod
	pod := &models.Pod{
		Name:      req.PodName,
		UID:       req.PodUID,
		Namespace: req.Namespace,
		NodeName:  req.NodeName,
		Status:    "healthy",
		Score:     100,
		LastSeen:  time.Now(),
		CreatedAt: time.Now(),
	}
	if err := h.store.UpsertPod(pod); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	// Save baseline
	baseline := &models.Baseline{
		PodUID:     req.PodUID,
		PodName:    req.PodName,
		Namespace:  req.Namespace,
		Container:  req.Container,
		NodeName:   req.NodeName,
		CapturedAt: req.CapturedAt,
		Snapshot: models.BaselineSnapshot{
			Filesystem:  models.FilesystemState(req.Snapshot.Filesystem),
			Processes:   models.ProcessState(req.Snapshot.Processes),
			Network:     models.NetworkState(req.Snapshot.Network),
			Packages:    models.PackageState(req.Snapshot.Packages),
			Permissions: models.PermissionsState(req.Snapshot.Permissions),
		},
	}
	if err := h.store.SaveBaseline(baseline); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	// Broadcast new pod
	h.hub.Broadcast(models.WebSocketMessage{
		Type: "pod_added",
		Payload: models.ScoreUpdate{
			PodUID:    req.PodUID,
			PodName:   req.PodName,
			Namespace: req.Namespace,
			Score:     100,
			Status:    "healthy",
			Timestamp: time.Now(),
		},
	})

	fmt.Printf("📸 Baseline received: %s/%s\n", req.Namespace, req.PodName)

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Baseline saved",
	})
}

// ReceiveDrift receives drift events from an agent
func (h *Handler) ReceiveDrift(c *fiber.Ctx) error {
	var req models.DriftRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Update pod score
	if err := h.store.UpdatePodScore(req.PodUID, req.Score, req.Status); err != nil {
		fmt.Printf("Failed to update pod score: %v\n", err)
	}

	// Save drift events
	for _, event := range req.Events {
		if err := h.store.SaveDriftEvent(&event); err != nil {
			fmt.Printf("Failed to save drift event: %v\n", err)
		}
	}

	// Save score record
	record := &models.ScoreRecord{
		PodUID:         req.PodUID,
		PodName:        req.PodName,
		Namespace:      req.Namespace,
		Score:          req.Score,
		Status:         req.Status,
		Timestamp:      req.ScannedAt,
		ScoreBreakdown: req.ScoreResult,
	}
	if err := h.store.SaveScoreRecord(record); err != nil {
		fmt.Printf("Failed to save score record: %v\n", err)
	}

	// Broadcast score update
	h.hub.Broadcast(models.WebSocketMessage{
		Type: "score_update",
		Payload: models.ScoreUpdate{
			PodUID:    req.PodUID,
			PodName:   req.PodName,
			Namespace: req.Namespace,
			Score:     req.Score,
			Status:    req.Status,
			Timestamp: time.Now(),
		},
	})

	// Broadcast new drift events
	for _, event := range req.Events {
		h.hub.Broadcast(models.WebSocketMessage{
			Type:    "drift_event",
			Payload: event,
		})
	}

	fmt.Printf("🔍 Drift received: %s/%s score=%d events=%d\n",
		req.Namespace, req.PodName, req.Score, req.TotalEvents)

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Drift recorded",
	})
}

// ReceiveScore receives a score update from an agent
func (h *Handler) ReceiveScore(c *fiber.Ctx) error {
	var req models.ScoreRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Update pod score
	if err := h.store.UpdatePodScore(req.PodUID, req.Score, req.Status); err != nil {
		return c.Status(500).JSON(models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
	}

	// Broadcast score update (only if score changed significantly)
	h.hub.Broadcast(models.WebSocketMessage{
		Type: "score_update",
		Payload: models.ScoreUpdate{
			PodUID:    req.PodUID,
			PodName:   req.PodName,
			Namespace: req.Namespace,
			Score:     req.Score,
			Status:    req.Status,
			Timestamp: time.Now(),
		},
	})

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Score updated",
	})
}

// PodRemoved handles pod removal notification
func (h *Handler) PodRemoved(c *fiber.Ctx) error {
	var req models.PodRemovedRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(models.APIResponse{
			Success: false,
			Error:   "Invalid request body",
		})
	}

	// Delete pod from store
	if err := h.store.DeletePod(req.PodUID); err != nil {
		fmt.Printf("Failed to delete pod: %v\n", err)
	}

	// Broadcast removal
	h.hub.Broadcast(models.WebSocketMessage{
		Type: "pod_removed",
		Payload: map[string]string{
			"podUID":    req.PodUID,
			"podName":   req.PodName,
			"namespace": req.Namespace,
		},
	})

	fmt.Printf("🗑️ Pod removed: %s/%s\n", req.Namespace, req.PodName)

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Pod removal recorded",
	})
}

// AgentHeartbeat handles agent heartbeats
func (h *Handler) AgentHeartbeat(c *fiber.Ctx) error {
	nodeName := c.Get("X-Agent-Node")
	if nodeName == "" {
		var body struct {
			NodeName string `json:"nodeName"`
		}
		if err := c.BodyParser(&body); err == nil {
			nodeName = body.NodeName
		}
	}

	if nodeName != "" {
		h.store.SaveAgentHeartbeat(nodeName)
	}

	return c.JSON(models.APIResponse{
		Success: true,
		Message: "Heartbeat received",
	})
}
