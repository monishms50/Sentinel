package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
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
	demoMode            bool
	demoPodCount        int
	demoDriftProb       float64

	// State tracking
	baselines map[string]*baseline.Snapshot
	mu        sync.RWMutex
}

func main() {
	fmt.Println("🛡️  Sentinel Entropy Agent starting...")

	agent, err := NewAgent()
	if err != nil {
		fmt.Printf("❌ Failed to initialize agent: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\n🛑 Shutting down agent...")
		cancel()
	}()

	if err := agent.Run(ctx); err != nil {
		fmt.Printf("❌ Agent error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("👋 Agent stopped")
}

// NewAgent creates a new entropy agent
func NewAgent() (*Agent, error) {
	nodeName := getEnv("NODE_NAME", "unknown")
	apiEndpoint := getEnv("API_ENDPOINT", "http://sentinel-api:8080")
	scanIntervalSec := getEnvInt("SCAN_INTERVAL", 30)
	monitoredNs := getEnv("MONITORED_NAMESPACES", "demo-app")
	demoMode := getEnv("DEMO_MODE", "false") == "true"
	demoPodCount := getEnvInt("DEMO_POD_COUNT", 10)
	demoDriftProb := getEnvFloat("DEMO_DRIFT_PROBABILITY", 0.1)

	agent := &Agent{
		monitor:             monitor.NewMonitor(),
		calculator:          scoring.NewCalculator(),
		reporter:            reporter.NewReporter(apiEndpoint, nodeName),
		nodeName:            nodeName,
		scanInterval:        time.Duration(scanIntervalSec) * time.Second,
		monitoredNamespaces: strings.Split(monitoredNs, ","),
		baselines:           make(map[string]*baseline.Snapshot),
		demoMode:            demoMode,
		demoPodCount:        demoPodCount,
		demoDriftProb:       demoDriftProb,
	}

	fmt.Printf("📋 Configuration:\n")
	fmt.Printf("   Node: %s\n", nodeName)
	fmt.Printf("   API: %s\n", apiEndpoint)
	fmt.Printf("   Scan interval: %v\n", agent.scanInterval)
	fmt.Printf("   Monitored namespaces: %v\n", agent.monitoredNamespaces)
	fmt.Printf("   Demo mode: %v\n", demoMode)

	// Only create Kubernetes client if NOT in demo mode
	if !demoMode {
		config, clientset, err := getKubeClient()
		if err != nil {
			return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
		}
		agent.clientset = clientset
		agent.restConfig = config
		agent.capturer = baseline.NewCapturer(agent.execInContainer)
	} else {
		fmt.Println("🎭 Running in DEMO MODE - no Kubernetes required")
	}

	return agent, nil
}

// Run starts the agent main loop
func (a *Agent) Run(ctx context.Context) error {
	fmt.Println("🚀 Agent running...")

	if a.demoMode {
		return a.runDemoMode(ctx)
	}

	go a.watchPods(ctx)

	ticker := time.NewTicker(a.scanInterval)
	defer ticker.Stop()

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

// runDemoMode simulates pod monitoring without Kubernetes
func (a *Agent) runDemoMode(ctx context.Context) error {
	fmt.Printf("🎭 Demo mode: simulating %d pods\n", a.demoPodCount)

	// Create simulated pods
	type demoPod struct {
		name      string
		namespace string
		uid       string
		score     int
	}

	pods := make([]demoPod, a.demoPodCount)
	appNames := []string{"web", "api", "worker", "cache", "db", "proxy", "gateway", "scheduler", "monitor", "logger"}

	for i := 0; i < a.demoPodCount; i++ {
		ns := a.monitoredNamespaces[i%len(a.monitoredNamespaces)]
		appName := appNames[i%len(appNames)]
		pods[i] = demoPod{
			name:      fmt.Sprintf("%s-%s-%d", appName, randomString(5), i),
			namespace: ns,
			uid:       fmt.Sprintf("demo-uid-%d-%s", i, randomString(8)),
			score:     100,
		}
	}

	// Report initial baselines
	for _, pod := range pods {
		a.reportDemoBaseline(pod.name, pod.uid, pod.namespace)
	}

	// Periodic scanning simulation
	ticker := time.NewTicker(a.scanInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			for i := range pods {
				// Simulate drift with configured probability
				if rand.Float64() < a.demoDriftProb {
					// Drift detected - reduce score
					penalty := rand.Intn(20) + 5
					pods[i].score -= penalty
					if pods[i].score < 0 {
						pods[i].score = 0
					}

					a.reportDemoDrift(pods[i].name, pods[i].uid, pods[i].namespace, pods[i].score)
				} else {
					// No drift - slight score recovery
					if pods[i].score < 100 {
						pods[i].score += rand.Intn(3)
						if pods[i].score > 100 {
							pods[i].score = 100
						}
					}
					a.reportDemoScore(pods[i].name, pods[i].uid, pods[i].namespace, pods[i].score)
				}
			}
		}
	}
}

func (a *Agent) reportDemoBaseline(name, uid, namespace string) {
	payload := map[string]interface{}{
		"podName":    name,
		"podUID":     uid,
		"namespace":  namespace,
		"container":  "main",
		"nodeName":   a.nodeName,
		"capturedAt": time.Now().UTC(),
		"snapshot": map[string]interface{}{
			"filesystem": map[string]interface{}{
				"executableHashes": map[string]string{"/bin/sh": "abc123"},
				"configHashes":     map[string]string{"/etc/config": "def456"},
				"tmpFiles":         []string{},
			},
			"processes": map[string]interface{}{
				"processes": []map[string]string{
					{"pid": "1", "user": "root", "cmd": "/app/main", "args": ""},
				},
			},
			"network": map[string]interface{}{
				"listeningPorts": []map[string]string{
					{"port": "8080", "protocol": "tcp", "process": "main"},
				},
			},
			"packages":    map[string]interface{}{"packages": []string{"libc", "libssl"}},
			"permissions": map[string]interface{}{"users": []string{"root", "app"}, "groups": []string{"root"}},
		},
	}

	a.postToAPI("/api/baselines", payload)
	fmt.Printf("📸 Demo baseline: %s/%s\n", namespace, name)
}

func (a *Agent) reportDemoScore(name, uid, namespace string, score int) {
	status := "healthy"
	if score < 90 {
		status = "warning"
	}
	if score < 50 {
		status = "critical"
	}

	payload := map[string]interface{}{
		"podName":   name,
		"podUID":    uid,
		"namespace": namespace,
		"container": "main",
		"nodeName":  a.nodeName,
		"timestamp": time.Now().UTC(),
		"score":     score,
		"status":    status,
	}

	a.postToAPI("/api/scores", payload)
}

func (a *Agent) reportDemoDrift(name, uid, namespace string, score int) {
	status := "warning"
	if score < 50 {
		status = "critical"
	}

	categories := []string{"filesystem", "processes", "network", "packages", "permissions"}
	severities := []string{"low", "medium", "high"}
	eventTypes := []string{"file_modified", "new_process", "new_port", "package_added", "permission_changed"}

	category := categories[rand.Intn(len(categories))]
	severity := severities[rand.Intn(len(severities))]
	eventType := eventTypes[rand.Intn(len(eventTypes))]

	payload := map[string]interface{}{
		"podName":     name,
		"podUID":      uid,
		"namespace":   namespace,
		"container":   "main",
		"nodeName":    a.nodeName,
		"scannedAt":   time.Now().UTC(),
		"score":       score,
		"status":      status,
		"totalEvents": 1,
		"scoreResult": map[string]interface{}{
			"finalScore":      score,
			"totalPenalty":    100 - score,
			"eventCount":      1,
			"highestSeverity": severity,
		},
		"events": []map[string]interface{}{
			{
				"eventId":     fmt.Sprintf("evt-%s", randomString(8)),
				"podUID":      uid,
				"podName":     name,
				"namespace":   namespace,
				"container":   "main",
				"timestamp":   time.Now().UTC(),
				"category":    category,
				"severity":    severity,
				"eventType":   eventType,
				"description": fmt.Sprintf("Demo %s event detected", eventType),
			},
		},
	}

	a.postToAPI("/api/drift", payload)
	fmt.Printf("🔍 Demo drift: %s/%s score=%d\n", namespace, name, score)
}

func (a *Agent) postToAPI(path string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	apiEndpoint := getEnv("API_ENDPOINT", "http://sentinel-api:8080")
	resp, err := http.Post(apiEndpoint+path, "application/json", bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
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
		return
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

	if err := a.reporter.ReportPodRemoved(pod.Name, podUID, pod.Namespace); err != nil {
		fmt.Printf("⚠️  Failed to report pod removal: %v\n", err)
	}
}

// captureBaseline captures the baseline for a pod
func (a *Agent) captureBaseline(ctx context.Context, pod *corev1.Pod) {
	podUID := string(pod.UID)

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
		a.captureBaseline(ctx, pod)
		return
	}

	for _, container := range pod.Spec.Containers {
		current, err := a.capturer.CaptureBaseline(pod.Namespace, pod.Name, container.Name, podUID)
		if err != nil {
			fmt.Printf("⚠️  Failed to scan %s/%s/%s: %v\n",
				pod.Namespace, pod.Name, container.Name, err)
			continue
		}

		report := a.monitor.Compare(base, current)
		scoreResult := a.calculator.Calculate(report)

		status := scoring.GetStatus(scoreResult.FinalScore)
		if report.TotalEvents > 0 {
			fmt.Printf("🔍 %s/%s: score=%d (%s), events=%d\n",
				pod.Namespace, pod.Name, scoreResult.FinalScore, status, report.TotalEvents)

			if err := a.reporter.ReportDrift(report, scoreResult); err != nil {
				fmt.Printf("⚠️  Failed to report drift: %v\n", err)
			}
		} else {
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
	config, err := rest.InClusterConfig()
	if err != nil {
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

func getEnvFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return defaultValue
}
