package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"github.com/sentinel/controller/pkg/purger"
	"github.com/sentinel/controller/pkg/reconciler"
)

func main() {
	fmt.Println("🛡️  Sentinel Purge Controller starting...")

	// Get configuration from environment
	apiEndpoint := getEnv("API_ENDPOINT", "http://sentinel-api.sentinel.svc.cluster.local:8080")
	reconcileInterval := getEnvInt("RECONCILE_INTERVAL", 10) // seconds
	dryRun := getEnvBool("DRY_RUN", false)
	purgeSpeed := getEnv("PURGE_SPEED", "moderate")

	fmt.Printf("📋 Configuration:\n")
	fmt.Printf("   API Endpoint: %s\n", apiEndpoint)
	fmt.Printf("   Reconcile Interval: %ds\n", reconcileInterval)
	fmt.Printf("   Dry Run: %t\n", dryRun)
	fmt.Printf("   Default Purge Speed: %s\n", purgeSpeed)

	// Create Kubernetes client
	clientset, err := getKubeClient()
	if err != nil {
		fmt.Printf("❌ Failed to create Kubernetes client: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✅ Connected to Kubernetes")

	// Create purger
	p := purger.NewPurger(clientset, dryRun)
	fmt.Println("✅ Purger initialized")

	// Create reconciler
	r := reconciler.NewReconciler(p, apiEndpoint)
	
	// Set initial config based on purge speed
	if speed, ok := reconciler.DefaultConfigs[reconciler.PurgeSpeed(purgeSpeed)]; ok {
		r.SetConfig(speed)
	}
	fmt.Println("✅ Reconciler initialized")

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Try to fetch config from API
	go func() {
		// Wait a bit for API to be ready
		time.Sleep(5 * time.Second)
		if err := r.FetchConfig(ctx); err != nil {
			fmt.Printf("⚠️  Could not fetch config from API, using defaults: %v\n", err)
		}
	}()

	// Start config refresh goroutine
	go configRefreshLoop(ctx, r, 60*time.Second)

	// Start reconciliation loop
	go reconcileLoop(ctx, r, time.Duration(reconcileInterval)*time.Second)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	fmt.Println("🚀 Controller running. Press Ctrl+C to stop.")
	<-quit

	fmt.Println("\n🛑 Shutting down controller...")
	cancel()

	// Give goroutines time to clean up
	time.Sleep(2 * time.Second)
	fmt.Println("👋 Controller stopped")
}

// reconcileLoop runs the reconciliation loop
func reconcileLoop(ctx context.Context, r *reconciler.Reconciler, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Initial reconcile
	if err := r.Reconcile(ctx); err != nil {
		fmt.Printf("⚠️  Reconcile error: %v\n", err)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := r.Reconcile(ctx); err != nil {
				fmt.Printf("⚠️  Reconcile error: %v\n", err)
			}

			// Log stats periodically
			stats := r.GetStats()
			if pending, ok := stats["pendingPurges"].(int); ok && pending > 0 {
				fmt.Printf("📊 Stats: %d pods pending purge\n", pending)
			}
		}
	}
}

// configRefreshLoop periodically fetches config from the API
func configRefreshLoop(ctx context.Context, r *reconciler.Reconciler, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := r.FetchConfig(ctx); err != nil {
				// Don't log every time - config fetch failures are expected during startup
				continue
			}
		}
	}
}

// getKubeClient creates a Kubernetes client
func getKubeClient() (kubernetes.Interface, error) {
	// Try in-cluster config first
	config, err := rest.InClusterConfig()
	if err != nil {
		// Fall back to kubeconfig
		kubeconfig := os.Getenv("KUBECONFIG")
		if kubeconfig == "" {
			kubeconfig = os.Getenv("HOME") + "/.kube/config"
		}

		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("failed to build config: %w", err)
		}
		fmt.Println("📋 Using kubeconfig from:", kubeconfig)
	} else {
		fmt.Println("📋 Using in-cluster config")
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	return clientset, nil
}

// getEnv gets an environment variable with a default
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvInt gets an integer environment variable with a default
func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

// getEnvBool gets a boolean environment variable with a default
func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	}
	return defaultValue
}
