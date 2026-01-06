package scoring

import (
	"github.com/sentinel/agent/pkg/monitor"
)

// Default weights from Blueprint (must sum to 1.0)
var DefaultWeights = CategoryWeights{
	Filesystem:  0.35,
	Processes:   0.30,
	Network:     0.20,
	Packages:    0.10,
	Permissions: 0.05,
}

// Default severity points from Blueprint
var DefaultSeverityPoints = SeverityPoints{
	// Filesystem events
	NewExecutable:        15,
	ModifiedSystemBinary: 25,
	NewTmpFile:           10,
	ConfigModified:       5,

	// Process events
	NewProcess:            10,
	CryptoMiningSignature: 50,
	SuspiciousProcess:     30,

	// Network events
	NewListeningPort:   20,
	SuspiciousOutbound: 20,

	// Package events
	NewPackage: 15,

	// Permission events
	NewUser:  30,
	NewGroup: 15,
}

// CategoryWeights defines the weight for each entropy category
type CategoryWeights struct {
	Filesystem  float64 `json:"filesystem"`
	Processes   float64 `json:"processes"`
	Network     float64 `json:"network"`
	Packages    float64 `json:"packages"`
	Permissions float64 `json:"permissions"`
}

// SeverityPoints defines points for each event type
type SeverityPoints struct {
	// Filesystem
	NewExecutable        int `json:"newExecutable"`
	ModifiedSystemBinary int `json:"modifiedSystemBinary"`
	NewTmpFile           int `json:"newTmpFile"`
	ConfigModified       int `json:"configModified"`

	// Processes
	NewProcess            int `json:"newProcess"`
	CryptoMiningSignature int `json:"cryptoMiningSignature"`
	SuspiciousProcess     int `json:"suspiciousProcess"`

	// Network
	NewListeningPort   int `json:"newListeningPort"`
	SuspiciousOutbound int `json:"suspiciousOutbound"`

	// Packages
	NewPackage int `json:"newPackage"`

	// Permissions
	NewUser  int `json:"newUser"`
	NewGroup int `json:"newGroup"`
}

// ScoreResult contains the calculated score and breakdown
type ScoreResult struct {
	FinalScore         int                     `json:"finalScore"`         // 0-100, where 100 is pristine
	CategoryScores     map[string]CategoryScore `json:"categoryScores"`
	TotalPenalty       float64                 `json:"totalPenalty"`
	EventCount         int                     `json:"eventCount"`
	HighestSeverity    string                  `json:"highestSeverity"`
}

// CategoryScore shows the score breakdown for a category
type CategoryScore struct {
	RawScore  int     `json:"rawScore"`   // Points deducted (before weight)
	Weight    float64 `json:"weight"`     // Category weight
	Penalty   float64 `json:"penalty"`    // Weighted penalty (rawScore * weight)
	Events    int     `json:"events"`     // Number of events in this category
}

// Calculator calculates entropy scores
type Calculator struct {
	weights  CategoryWeights
	severity SeverityPoints
}

// NewCalculator creates a score calculator with default settings
func NewCalculator() *Calculator {
	return &Calculator{
		weights:  DefaultWeights,
		severity: DefaultSeverityPoints,
	}
}

// NewCalculatorWithConfig creates a calculator with custom settings
func NewCalculatorWithConfig(weights CategoryWeights, severity SeverityPoints) *Calculator {
	return &Calculator{
		weights:  weights,
		severity: severity,
	}
}

// Calculate computes the entropy score from a drift report
func (c *Calculator) Calculate(report *monitor.DriftReport) ScoreResult {
	result := ScoreResult{
		CategoryScores:  make(map[string]CategoryScore),
		HighestSeverity: "none",
	}

	// Initialize category scores
	categories := []string{"filesystem", "processes", "network", "packages", "permissions"}
	for _, cat := range categories {
		result.CategoryScores[cat] = CategoryScore{
			RawScore: 0,
			Weight:   c.getWeight(cat),
			Penalty:  0,
			Events:   0,
		}
	}

	// Process each event
	for _, event := range report.Events {
		points := c.getEventPoints(event.EventType)
		cat := string(event.Category)

		score := result.CategoryScores[cat]
		score.RawScore += points
		score.Events++
		result.CategoryScores[cat] = score

		result.EventCount++

		// Track highest severity
		if compareSeverity(string(event.Severity), result.HighestSeverity) > 0 {
			result.HighestSeverity = string(event.Severity)
		}
	}

	// Calculate weighted penalties
	// Per Blueprint: drift_severity per category = min(100, sum of event points)
	totalPenalty := 0.0
	for cat, score := range result.CategoryScores {
		// Cap raw score at 100 per category
		cappedScore := score.RawScore
		if cappedScore > 100 {
			cappedScore = 100
		}

		// Calculate penalty: (100 - cappedScore) means we invert, then apply weight
		// Actually per Blueprint: penalty = weight * (100 - categoryScore)
		// Where categoryScore = 100 - min(100, sum of event points)
		categoryHealth := 100 - cappedScore
		penalty := score.Weight * float64(100-categoryHealth)
		
		score.Penalty = penalty
		result.CategoryScores[cat] = score
		totalPenalty += penalty
	}

	result.TotalPenalty = totalPenalty

	// Final score = 100 - total penalty
	finalScore := 100.0 - totalPenalty
	if finalScore < 0 {
		finalScore = 0
	}

	result.FinalScore = int(finalScore)
	return result
}

// getWeight returns the weight for a category
func (c *Calculator) getWeight(category string) float64 {
	switch category {
	case "filesystem":
		return c.weights.Filesystem
	case "processes":
		return c.weights.Processes
	case "network":
		return c.weights.Network
	case "packages":
		return c.weights.Packages
	case "permissions":
		return c.weights.Permissions
	default:
		return 0
	}
}

// getEventPoints returns the points for an event type
func (c *Calculator) getEventPoints(eventType string) int {
	switch eventType {
	// Filesystem
	case "new_executable":
		return c.severity.NewExecutable
	case "new_system_binary":
		return c.severity.ModifiedSystemBinary
	case "modified_system_binary":
		return c.severity.ModifiedSystemBinary
	case "new_tmp_file":
		return c.severity.NewTmpFile
	case "config_modified":
		return c.severity.ConfigModified

	// Processes
	case "new_process":
		return c.severity.NewProcess
	case "crypto_mining_signature":
		return c.severity.CryptoMiningSignature
	case "suspicious_process":
		return c.severity.SuspiciousProcess

	// Network
	case "new_listening_port":
		return c.severity.NewListeningPort
	case "suspicious_outbound":
		return c.severity.SuspiciousOutbound

	// Packages
	case "new_package":
		return c.severity.NewPackage

	// Permissions
	case "new_user":
		return c.severity.NewUser
	case "new_group":
		return c.severity.NewGroup

	default:
		return 5 // Default for unknown events
	}
}

// compareSeverity compares two severity levels, returns >0 if a > b
func compareSeverity(a, b string) int {
	order := map[string]int{
		"none":     0,
		"info":     1,
		"low":      2,
		"medium":   3,
		"high":     4,
		"critical": 5,
	}
	return order[a] - order[b]
}

// GetStatus returns a human-readable status based on score
func GetStatus(score int) string {
	switch {
	case score >= 90:
		return "healthy"
	case score >= 70:
		return "good"
	case score >= 50:
		return "warning"
	case score >= 30:
		return "critical"
	default:
		return "compromised"
	}
}

// GetStatusColor returns a color code for the status
func GetStatusColor(score int) string {
	switch {
	case score >= 90:
		return "green"
	case score >= 70:
		return "lime"
	case score >= 50:
		return "yellow"
	case score >= 30:
		return "orange"
	default:
		return "red"
	}
}
