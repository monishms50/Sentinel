package websocket

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

// Client represents a WebSocket client
type Client struct {
	ID     string
	Conn   *websocket.Conn
	Send   chan []byte
	Hub    *Hub
	closed bool
	mu     sync.Mutex
}

// Hub manages all WebSocket clients
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			fmt.Printf("🔌 WebSocket client connected: %s (total: %d)\n", client.ID, len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			fmt.Printf("🔌 WebSocket client disconnected: %s (total: %d)\n", client.ID, len(h.clients))

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					// Client buffer full, close connection
					h.mu.RUnlock()
					h.mu.Lock()
					delete(h.clients, client)
					close(client.Send)
					h.mu.Unlock()
					h.mu.RLock()
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Broadcast sends a message to all connected clients
func (h *Hub) Broadcast(msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		fmt.Printf("Failed to marshal broadcast message: %v\n", err)
		return
	}

	select {
	case h.broadcast <- data:
	default:
		fmt.Println("Broadcast channel full, dropping message")
	}
}

// ClientCount returns the number of connected clients
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// WebSocketUpgrade is the middleware for upgrading HTTP to WebSocket
func WebSocketUpgrade(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		c.Locals("allowed", true)
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

// HandleWebSocket handles WebSocket connections
func HandleWebSocket(hub *Hub) fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		clientID := fmt.Sprintf("%s-%d", c.RemoteAddr().String(), time.Now().UnixNano())
		
		client := &Client{
			ID:   clientID,
			Conn: c,
			Send: make(chan []byte, 256),
			Hub:  hub,
		}

		hub.register <- client

		// Start goroutines for reading and writing
		go client.writePump()
		client.readPump()
	})
}

// readPump reads messages from the WebSocket connection
func (c *Client) readPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512 * 1024) // 512KB max message size

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				fmt.Printf("WebSocket error: %v\n", err)
			}
			break
		}

		// Handle incoming messages (e.g., subscription requests)
		c.handleMessage(message)
	}
}

// writePump writes messages to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second) // Ping interval
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				// Hub closed the channel
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			c.mu.Lock()
			if c.closed {
				c.mu.Unlock()
				return
			}

			err := c.Conn.WriteMessage(websocket.TextMessage, message)
			c.mu.Unlock()

			if err != nil {
				return
			}

		case <-ticker.C:
			c.mu.Lock()
			if c.closed {
				c.mu.Unlock()
				return
			}
			err := c.Conn.WriteMessage(websocket.PingMessage, nil)
			c.mu.Unlock()

			if err != nil {
				return
			}
		}
	}
}

// handleMessage processes incoming WebSocket messages
func (c *Client) handleMessage(message []byte) {
	var msg map[string]interface{}
	if err := json.Unmarshal(message, &msg); err != nil {
		return
	}

	msgType, ok := msg["type"].(string)
	if !ok {
		return
	}

	switch msgType {
	case "ping":
		// Respond with pong
		response, _ := json.Marshal(map[string]string{
			"type": "pong",
		})
		c.Send <- response

	case "subscribe":
		// Client wants to subscribe to specific events
		// For now, all clients get all events
		response, _ := json.Marshal(map[string]interface{}{
			"type":    "subscribed",
			"message": "Subscribed to all events",
		})
		c.Send <- response
	}
}

// Close closes the client connection
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.closed {
		c.closed = true
		c.Conn.Close()
	}
}

// Message types for WebSocket communication
type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

// NewScoreUpdateMessage creates a score update message
func NewScoreUpdateMessage(podUID, podName, namespace string, score int, status string) WSMessage {
	return WSMessage{
		Type: "score_update",
		Payload: map[string]interface{}{
			"podUID":    podUID,
			"podName":   podName,
			"namespace": namespace,
			"score":     score,
			"status":    status,
			"timestamp": time.Now().UTC(),
		},
	}
}

// NewDriftEventMessage creates a drift event message
func NewDriftEventMessage(event interface{}) WSMessage {
	return WSMessage{
		Type:    "drift_event",
		Payload: event,
	}
}

// NewPodAddedMessage creates a pod added message
func NewPodAddedMessage(podUID, podName, namespace string) WSMessage {
	return WSMessage{
		Type: "pod_added",
		Payload: map[string]interface{}{
			"podUID":    podUID,
			"podName":   podName,
			"namespace": namespace,
			"timestamp": time.Now().UTC(),
		},
	}
}

// NewPodRemovedMessage creates a pod removed message
func NewPodRemovedMessage(podUID, podName, namespace string) WSMessage {
	return WSMessage{
		Type: "pod_removed",
		Payload: map[string]interface{}{
			"podUID":    podUID,
			"podName":   podName,
			"namespace": namespace,
			"timestamp": time.Now().UTC(),
		},
	}
}
