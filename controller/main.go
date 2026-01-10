package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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

	apiEndpoint := getEnv("API_ENDPOINT", "http://sentinel-api.sentinel.svc.cluster.local:8080")
	reconcileInterval := getEnvInt("RECONCILE_INTERVAL", 10)
	dryRun := getEnvBool("DRY_RUN", false)
	purgeSpeed := getEnv("PURGE_SPEED", "moderate")
	demoMode := getEnvBool("DEMO_MODE", false)

	fmt.Printf("📋 Configuration:\n")
	fmt.Printf("   API Endpoint: %s\n", apiEndpoint)
	fmt.Printf("   Reconcile Interval: %ds\n", reconcileInterval)
	fmt.Printf("   Dry Run: %t\n", dryRun)
	fmt.Printf("   Default Purge Speed: %s\n", purgeSpeed)
	fmt.Printf("   Demo Mode: %t\n", demoMode)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// In demo mode, skip Kubernetes client creation
	if demoMode {
		fmt.Println("🎭 Running in DEMO MODE - no Kubernetes required")
		runDemoMode(ctx, apiEndpoint, reconcileInterval)
		return
	}

	// Create Kubernetes client (only if not in demo mode)
	clientset, err := getKubeClient()
	if err != nil {
		fmt.Printf("❌ Failed to create Kubernetes client: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✅ Connected to Kubernetes")

	p := purger.NewPurger(clientset, dryRun)
	fmt.Println("✅ Purger initialized")

	r := reconciler.NewReconciler(p, apiEndpoint)
	
	if speed, ok := reconciler.DefaultConfigs[reconciler.PurgeSpeed(purgeSpeed)]; ok {
		r.SetConfig(speed)
	}
	fmt.Println("✅ Reconciler initialized")

	go func() {
		time.Sleep(5 * time.Second)
		if err := r.FetchConfig(ctx); err != nil {
			fmt.Printf("⚠️  Could not fetch config from API, using defaults: %v\n", err)
		}
	}()

	go configRefreshLoop(ctx, r, 60*time.Second)
	go reconcileLoop(ctx, r, time.Duration(reconcileInterval)*time.Second)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	fmt.Println("🚀 Controller running. Press Ctrl+C to stop.")
	<-quit

	fmt.Println("\n🛑 Shutting down controller...")
	cancel()
	time.Sleep(2 * time.Second)
	fmt.Println("👋 Controller stopped")
}

// runDemoMode runs the controller in demo mode without Kubernetes
func runDemoMode(ctx context.Context, apiEndpoint string, reconcileIntervalSec int) {
	fmt.Println("🚀 Controller running in demo mode...")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(time.Duration(reconcileIntervalSec) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-quit:
			fmt.Println("\n🛑 Shutting down controller...")
			return
		case <-ticker.C:
			// Fetch pods from API and check for purge candidates
			checkPurgeCandiates(apiEndpoint)
		}
	}
}

func checkPurgeCandiates(apiEndpoint string) {
	resp, err := http.Get(apiEndpoint + "/api/pods")
	if err != nil {
		fmt.Printf("⚠️  Failed to fetch pods: %v\n", err)
		return
	}
	defer resp.Body.Close()

	var result struct {
		Success bool `json:"success"`
		Data    []struct {
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
			UID       string `json:"uid"`
			Score     int    `json:"score"`
			Status    string `json:"status"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		fmt.Printf("⚠️  Failed to decode response: %v\n", err)
		return
	}

	if !result.Success {
		return
	}

	// Check for pods below threshold
	threshold := 30
	for _, pod := range result.Data {
		if pod.Score < threshold {
			fmt.Printf("🎯 [DRY-RUN] Would purge: %s/%s (score: %d)\n", 
				pod.Namespace, pod.Name, pod.Score)
		}
	}
}

func reconcileLoop(ctx context.Context, r *reconciler.Reconciler, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

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

			stats := r.GetStats()
			if pending, ok := stats["pendingPurges"].(int); ok && pending > 0 {
				fmt.Printf("📊 Stats: %d pods pending purge\n", pending)
			}
		}
	}
}

func configRefreshLoop(ctx context.Context, r *reconciler.Reconciler, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := r.FetchConfig(ctx); err != nil {
				continue
			}
		}
	}
}

func getKubeClient() (kubernetes.Interface, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
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

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if b, err := strconv.ParseBool(value); err == nil {
			return b
		}
	}
	return defaultValue
}
