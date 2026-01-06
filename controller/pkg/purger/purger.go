package purger

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	typedcorev1 "k8s.io/client-go/kubernetes/typed/core/v1"
	"k8s.io/client-go/tools/record"
)

// PurgeResult represents the result of a purge operation
type PurgeResult struct {
	PodName   string
	Namespace string
	PodUID    string
	Success   bool
	Error     error
	PurgedAt  time.Time
	Reason    string
	Score     int
}

// Purger handles pod termination
type Purger struct {
	clientset     kubernetes.Interface
	eventRecorder record.EventRecorder
	dryRun        bool
}

// NewPurger creates a new purger instance
func NewPurger(clientset kubernetes.Interface, dryRun bool) *Purger {
	// Create event broadcaster for audit logging
	eventBroadcaster := record.NewBroadcaster()
	eventBroadcaster.StartLogging(func(format string, args ...interface{}) {
		fmt.Printf("[EVENT] "+format+"\n", args...)
	})
	eventBroadcaster.StartRecordingToSink(&typedcorev1.EventSinkImpl{
		Interface: clientset.CoreV1().Events(""),
	})
	eventRecorder := eventBroadcaster.NewRecorder(scheme.Scheme, corev1.EventSource{
		Component: "sentinel-controller",
	})

	return &Purger{
		clientset:     clientset,
		eventRecorder: eventRecorder,
		dryRun:        dryRun,
	}
}

// PurgePod deletes a pod and returns the result
func (p *Purger) PurgePod(ctx context.Context, namespace, name, reason string, score int) *PurgeResult {
	result := &PurgeResult{
		PodName:   name,
		Namespace: namespace,
		PurgedAt:  time.Now(),
		Reason:    reason,
		Score:     score,
	}

	// Get the pod first to capture its UID and verify it exists
	pod, err := p.clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		result.Success = false
		result.Error = fmt.Errorf("failed to get pod: %w", err)
		return result
	}

	result.PodUID = string(pod.UID)

	// Record event on the pod before deletion
	p.eventRecorder.Eventf(pod, corev1.EventTypeWarning, "SentinelPurge",
		"Pod purged by Sentinel controller. Reason: %s, Score: %d", reason, score)

	// Check if dry run
	if p.dryRun {
		fmt.Printf("🔸 [DRY-RUN] Would purge pod %s/%s (score: %d, reason: %s)\n",
			namespace, name, score, reason)
		result.Success = true
		return result
	}

	// Delete the pod
	deletePolicy := metav1.DeletePropagationForeground
	gracePeriod := int64(0) // Immediate termination for compromised pods

	err = p.clientset.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{
		PropagationPolicy:  &deletePolicy,
		GracePeriodSeconds: &gracePeriod,
	})

	if err != nil {
		result.Success = false
		result.Error = fmt.Errorf("failed to delete pod: %w", err)
		return result
	}

	result.Success = true
	fmt.Printf("🗑️  Purged pod %s/%s (score: %d, reason: %s)\n",
		namespace, name, score, reason)

	return result
}

// PurgePodGracefully deletes a pod with a grace period
func (p *Purger) PurgePodGracefully(ctx context.Context, namespace, name, reason string, score int, gracePeriodSeconds int64) *PurgeResult {
	result := &PurgeResult{
		PodName:   name,
		Namespace: namespace,
		PurgedAt:  time.Now(),
		Reason:    reason,
		Score:     score,
	}

	// Get the pod first
	pod, err := p.clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		result.Success = false
		result.Error = fmt.Errorf("failed to get pod: %w", err)
		return result
	}

	result.PodUID = string(pod.UID)

	// Record event
	p.eventRecorder.Eventf(pod, corev1.EventTypeWarning, "SentinelPurge",
		"Pod purged by Sentinel controller (grace: %ds). Reason: %s, Score: %d",
		gracePeriodSeconds, reason, score)

	if p.dryRun {
		fmt.Printf("🔸 [DRY-RUN] Would gracefully purge pod %s/%s (grace: %ds, score: %d)\n",
			namespace, name, gracePeriodSeconds, score)
		result.Success = true
		return result
	}

	// Delete with grace period
	deletePolicy := metav1.DeletePropagationForeground
	err = p.clientset.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{
		PropagationPolicy:  &deletePolicy,
		GracePeriodSeconds: &gracePeriodSeconds,
	})

	if err != nil {
		result.Success = false
		result.Error = fmt.Errorf("failed to delete pod: %w", err)
		return result
	}

	result.Success = true
	fmt.Printf("🗑️  Gracefully purging pod %s/%s (grace: %ds, score: %d)\n",
		namespace, name, gracePeriodSeconds, score)

	return result
}

// IsPodRunning checks if a pod is still running
func (p *Purger) IsPodRunning(ctx context.Context, namespace, name string) (bool, error) {
	pod, err := p.clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return false, err
	}
	return pod.Status.Phase == corev1.PodRunning, nil
}

// GetPod retrieves a pod
func (p *Purger) GetPod(ctx context.Context, namespace, name string) (*corev1.Pod, error) {
	return p.clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
}

// SetDryRun enables or disables dry run mode
func (p *Purger) SetDryRun(dryRun bool) {
	p.dryRun = dryRun
}

// IsDryRun returns whether dry run mode is enabled
func (p *Purger) IsDryRun() bool {
	return p.dryRun
}
