package main

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/remotecommand"

	"github.com/monishms50/Sentinel/agent/pkg/baseline"
	"github.com/monishms50/Sentinel/agent/pkg/monitor"
	"github.com/monishms50/Sentinel/agent/pkg/reporter"
	"github.com/monishms50/Sentinel/agent/pkg/scoring"
)

// Agent is the main entropy monitoring agent
type Agent struct {
	clientset   *kubernetes.Clientset
	restConfig  *rest.Config
	capturer    *baseline.Capturer
	monitor     *monitor.Monitor
	calculator  *scoring.Calculator
	reporter    *reporter.Reporter

	// Configuration
	nodeName            string
	scanInterval        time.Duration
	monitoredNamespaces []string

	// State tracking
	baselines map[string]*baseline.Snapshot // podUID -> baseline
	mu        sync.RWMutex
}

func main() {
	fmt.Println("🛡️  Sentinel Entropy Agent starting...")

	agent, err := NewAgent()
	if err != nil {
		fmt.Printf("❌ Failed to initialize agent: %v\n", err)
		os.Exit(1)
	}

	// Handle graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\n🛑 Shutting down agent...")
		cancel()
	}()

	// Run the agent
	if err := agent.Run(ctx); err != nil {
		fmt.Printf("❌ Agent error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("👋 Agent stopped")
}

// NewAgent creates a new entropy agent
func NewAgent() (*Agent, error) {
	// Get Kubernetes client
	config, clientset, err := getKubeClient()
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
	}

	// Get configuration from environment
	nodeName := getEnv("NODE_NAME", "unknown")
	apiEndpoint := getEnv("API_ENDPOINT", "http://sentinel-api:8080")
	scanIntervalSec := getEnvInt("SCAN_INTERVAL", 30)
	monitoredNs := getEnv("MONITORED_NAMESPACES", "demo-app")

	agent := &Agent{
		clientset:           clientset,
		restConfig:          config,
		monitor:             monitor.NewMonitor(),
		calculator:          scoring.NewCalculator(),
		reporter:            reporter.NewReporter(apiEndpoint, nodeName),
		nodeName:            nodeName,
		scanInterval:        time.Duration(scanIntervalSec) * time.Second,
		monitoredNamespaces: strings.Split(monitoredNs, ","),
		baselines:           make(map[string]*baseline.Snapshot),
	}

	// Create capturer with exec function
	agent.capturer = baseline.NewCapturer(agent.execInContainer)

	fmt.Printf("📋 Configuration:\n")
	fmt.Printf("   Node: %s\n", nodeName)
	fmt.Printf("   API: %s\n", apiEndpoint)
	fmt.Printf("   Scan interval: %v\n", agent.scanInterval)
	fmt.Printf("   Monitored namespaces: %v\n", agent.monitoredNamespaces)

	return agent, nil
}

// Run starts the agent main loop
func (a *Agent) Run(ctx context.Context) error {
	fmt.Println("🚀 Agent running...")

	// Start pod watcher
	go a.watchPods(ctx)

	// Start the monitoring loop
	ticker := time.NewTicker(a.scanInterval)
	defer ticker.Stop()

	// Initial scan
	a.scanAllPods(ctx)

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			a.scanAllPods(ctx)
		}
	}
}

// watchPods watches for pod events (create, delete)
func (a *Agent) watchPods(ctx context.Context) {
	for _, ns := range a.monitoredNamespaces {
		go a.watchNamespace(ctx, ns)
	}
}

// watchNamespace watches pods in a specific namespace
func (a *Agent) watchNamespace(ctx context.Context, namespace string) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		watcher, err := a.clientset.CoreV1().Pods(namespace).Watch(ctx, metav1.ListOptions{
			LabelSelector: "sentinel.io/monitored=true",
		})
		if err != nil {
			fmt.Printf("⚠️  Failed to watch pods in %s: %v\n", namespace, err)
			time.Sleep(5 * time.Second)
			continue
		}

		fmt.Printf("👀 Watching pods in namespace: %s\n", namespace)

		for event := range watcher.ResultChan() {
			pod, ok := event.Object.(*corev1.Pod)
			if !ok {
				continue
			}

			switch event.Type {
			case watch.Added:
				if pod.Status.Phase == corev1.PodRunning {
					a.handlePodAdded(ctx, pod)
				}
			case watch.Modified:
				if pod.Status.Phase == corev1.PodRunning {
					a.handlePodModified(ctx, pod)
				}
			case watch.Deleted:
				a.handlePodDeleted(pod)
			}
		}

		fmt.Printf("🔄 Reconnecting watcher for %s...\n", namespace)
		time.Sleep(1 * time.Second)
	}
}

// handlePodAdded handles a new pod
func (a *Agent) handlePodAdded(ctx context.Context, pod *corev1.Pod) {
	podUID := string(pod.UID)

	a.mu.RLock()
	_, exists := a.baselines[podUID]
	a.mu.RUnlock()

	if exists {
		return // Already have baseline
	}

	fmt.Printf("🆕 New pod detected: %s/%s\n", pod.Namespace, pod.Name)
	a.captureBaseline(ctx, pod)
}

// handlePodModified handles pod updates
func (a *Agent) handlePodModified(ctx context.Context, pod *corev1.Pod) {
	podUID := string(pod.UID)

	a.mu.RLock()
	_, exists := a.baselines[podUID]
	a.mu.RUnlock()

	// If pod just became running and we don't have a baseline, capture one
	if !exists && pod.Status.Phase == corev1.PodRunning {
		fmt.Printf("🔄 Pod now running: %s/%s\n", pod.Namespace, pod.Name)
		a.captureBaseline(ctx, pod)
	}
}

// handlePodDeleted handles pod deletion
func (a *Agent) handlePodDeleted(pod *corev1.Pod) {
	podUID := string(pod.UID)

	a.mu.Lock()
	delete(a.baselines, podUID)
	a.mu.Unlock()

	fmt.Printf("🗑️  Pod removed: %s/%s\n", pod.Namespace, pod.Name)

	// Notify API
	if err := a.reporter.ReportPodRemoved(pod.Name, podUID, pod.Namespace); err != nil {
		fmt.Printf("⚠️  Failed to report pod removal: %v\n", err)
	}
}

// captureBaseline captures the baseline for a pod
func (a *Agent) captureBaseline(ctx context.Context, pod *corev1.Pod) {
	podUID := string(pod.UID)

	// Capture baseline for each container
	for _, container := range pod.Spec.Containers {
		fmt.Printf("📸 Capturing baseline: %s/%s/%s\n", pod.Namespace, pod.Name, container.Name)

		snap, err := a.capturer.CaptureBaseline(pod.Namespace, pod.Name, container.Name, podUID)
		if err != nil {
			fmt.Printf("⚠️  Failed to capture baseline for %s/%s/%s: %v\n",
				pod.Namespace, pod.Name, container.Name, err)
			continue
		}

		a.mu.Lock()
		a.baselines[podUID] = snap
		a.mu.Unlock()

		// Report baseline to API
		if err := a.reporter.ReportBaseline(snap); err != nil {
			fmt.Printf("⚠️  Failed to report baseline: %v\n", err)
		}

		fmt.Printf("✅ Baseline captured: %s/%s (files: %d, processes: %d, ports: %d)\n",
			pod.Namespace, pod.Name,
			len(snap.Filesystem.ExecutableHashes),
			len(snap.Processes.Processes),
			len(snap.Network.ListeningPorts))
	}
}

// scanAllPods scans all monitored pods for drift
func (a *Agent) scanAllPods(ctx context.Context) {
	for _, ns := range a.monitoredNamespaces {
		pods, err := a.clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{
			LabelSelector: "sentinel.io/monitored=true",
		})
		if err != nil {
			fmt.Printf("⚠️  Failed to list pods in %s: %v\n", ns, err)
			continue
		}

		for _, pod := range pods.Items {
			if pod.Status.Phase != corev1.PodRunning {
				continue
			}
			a.scanPod(ctx, &pod)
		}
	}
}

// scanPod scans a single pod for drift
func (a *Agent) scanPod(ctx context.Context, pod *corev1.Pod) {
	podUID := string(pod.UID)

	a.mu.RLock()
	base, exists := a.baselines[podUID]
	a.mu.RUnlock()

	if !exists {
		// No baseline yet, capture one
		a.captureBaseline(ctx, pod)
		return
	}

	// Scan each container
	for _, container := range pod.Spec.Containers {
		// Capture current state
		current, err := a.capturer.CaptureBaseline(pod.Namespace, pod.Name, container.Name, podUID)
		if err != nil {
			fmt.Printf("⚠️  Failed to scan %s/%s/%s: %v\n",
				pod.Namespace, pod.Name, container.Name, err)
			continue
		}

		// Compare against baseline
		report := a.monitor.Compare(base, current)

		// Calculate score
		scoreResult := a.calculator.Calculate(report)

		// Log results
		status := scoring.GetStatus(scoreResult.FinalScore)
		if report.TotalEvents > 0 {
			fmt.Printf("🔍 %s/%s: score=%d (%s), events=%d\n",
				pod.Namespace, pod.Name, scoreResult.FinalScore, status, report.TotalEvents)

			// Report drift to API
			if err := a.reporter.ReportDrift(report, scoreResult); err != nil {
				fmt.Printf("⚠️  Failed to report drift: %v\n", err)
			}
		} else {
			// Just report score
			if err := a.reporter.ReportScore(pod.Name, podUID, pod.Namespace, container.Name, scoreResult); err != nil {
				fmt.Printf("⚠️  Failed to report score: %v\n", err)
			}
		}
	}
}

// execInContainer executes a command in a container
func (a *Agent) execInContainer(namespace, pod, container string, command []string) (string, string, error) {
	req := a.clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(pod).
		Namespace(namespace).
		SubResource("exec")

	req.VersionedParams(&corev1.PodExecOptions{
		Container: container,
		Command:   command,
		Stdin:     false,
		Stdout:    true,
		Stderr:    true,
		TTY:       false,
	}, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(a.restConfig, "POST", req.URL())
	if err != nil {
		return "", "", fmt.Errorf("failed to create executor: %w", err)
	}

	var stdout, stderr bytes.Buffer
	err = exec.StreamWithContext(context.Background(), remotecommand.StreamOptions{
		Stdout: &stdout,
		Stderr: &stderr,
	})

	return stdout.String(), stderr.String(), err
}

// getKubeClient creates a Kubernetes client
func getKubeClient() (*rest.Config, *kubernetes.Clientset, error) {
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
			return nil, nil, fmt.Errorf("failed to get kubeconfig: %w", err)
		}
		fmt.Println("📍 Using kubeconfig (dev mode)")
	} else {
		fmt.Println("📍 Using in-cluster config")
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	return config, clientset, nil
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
