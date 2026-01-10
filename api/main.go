package main

import (
	"fmt"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/monishms50/Sentinel/api/handlers"
	"github.com/monishms50/Sentinel/api/store"
	"github.com/monishms50/Sentinel/api/websocket"
)

func main() {
	port := getEnv("API_PORT", "8080")
	dbPath := getEnv("DB_PATH", "./sentinel.db")

	st, err := store.NewStore(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}
	defer st.Close()

	hub := websocket.NewHub()
	go hub.Run()

	h := handlers.NewHandler(st, hub)

	app := fiber.New(fiber.Config{
		AppName: "Sentinel API",
	})

	app.Use(recover.New())
	app.Use(logger.New())
	
	if getEnv("CORS_ENABLED", "false") == "true" {
		app.Use(cors.New(cors.Config{
			AllowOrigins: getEnv("CORS_ORIGINS", "*"),
			AllowHeaders: "Origin, Content-Type, Accept",
		}))
	}

	h.RegisterRoutes(app)

	app.Use("/ws", websocket.WebSocketUpgrade)
	app.Get("/ws", websocket.HandleWebSocket(hub))

	addr := fmt.Sprintf(":%s", port)
	fmt.Printf("🚀 Sentinel API starting on %s\n", addr)
	
	if err := app.Listen(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
