// Package client provides an authenticated HTTP client for the UseJunction
// control plane API.
package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/config"
)

// APIClient is an authenticated HTTP client for the control plane.
type APIClient struct {
	baseURL string
	token   string
	http    *http.Client
}

// New creates an APIClient from an enrolled config.
func New(cfg *config.Config) *APIClient {
	return &APIClient{
		baseURL: cfg.ControlPlaneURL,
		token:   cfg.DeviceToken,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *APIClient) post(path string, body any) error {
	return c.postJSON(path, body, nil)
}

func (c *APIClient) postJSON(path string, body any, out any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("POST %s returned %d: %s", path, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("decode POST %s: %w", path, err)
		}
	}
	return nil
}

// --- Payload types ----------------------------------------------------------

type HeartbeatPayload struct {
	Hostname       string `json:"hostname"`
	OS             string `json:"os"`
	Architecture   string `json:"architecture"`
	AgentVersion   string `json:"agentVersion"`
	LocalEndpoint  string `json:"localEndpoint,omitempty"`
	LocalSyncToken string `json:"localSyncToken,omitempty"`
}

type AgentUpdateDirective struct {
	ReleaseID     string `json:"releaseId"`
	AttemptID     string `json:"attemptId"`
	TargetVersion string `json:"targetVersion"`
	Urgency       string `json:"urgency"`
	ArtifactURL   string `json:"artifactUrl"`
	SHA256        string `json:"sha256"`
	Size          int64  `json:"size"`
	EligibleAt    string `json:"eligibleAt"`
}

type HeartbeatResponse struct {
	OK       bool                  `json:"ok"`
	DeviceID string                `json:"deviceId"`
	Update   *AgentUpdateDirective `json:"update,omitempty"`
}

type AgentUpdateEvent struct {
	AttemptID      string `json:"attemptId"`
	EventID        string `json:"eventId"`
	ReleaseVersion string `json:"releaseVersion"`
	Event          string `json:"event"`
	CurrentVersion string `json:"currentVersion,omitempty"`
	TargetVersion  string `json:"targetVersion"`
	Stage          string `json:"stage,omitempty"`
	ErrorCode      string `json:"errorCode,omitempty"`
}

type AgentUpdateCheckResponse struct {
	OK     bool                  `json:"ok"`
	Update *AgentUpdateDirective `json:"update,omitempty"`
}

type ToolReport struct {
	ToolName   string `json:"toolName"`
	Detected   bool   `json:"detected"`
	Configured bool   `json:"configured"`
	ConfigPath string `json:"configPath,omitempty"`
	Version    string `json:"version,omitempty"`
}

type LocalModelReport struct {
	Provider  string `json:"provider"`
	ModelName string `json:"modelName"`
	Size      string `json:"size,omitempty"`
	Running   bool   `json:"running"`
}

type AccountReport struct {
	ToolName    string `json:"toolName"`
	Email       string `json:"email,omitempty"`
	Plan        string `json:"plan,omitempty"`
	LoginMethod string `json:"loginMethod"`
	AuthPresent bool   `json:"authPresent"`
}

type QuotaReport struct {
	ToolName         string   `json:"toolName"`
	WindowType       string   `json:"windowType"`
	UsedPercent      *float64 `json:"usedPercent,omitempty"`
	ResetAt          *string  `json:"resetAt,omitempty"`
	CreditsRemaining *float64 `json:"creditsRemaining,omitempty"`
	Source           string   `json:"source"`
}

type UsageAggregate struct {
	Date               string            `json:"date"`
	ToolName           string            `json:"toolName"`
	Model              string            `json:"model"`
	InputTokens        int               `json:"inputTokens"`
	OutputTokens       int               `json:"outputTokens"`
	CacheReadTokens    int               `json:"cacheReadTokens"`
	CacheWriteTokens   int               `json:"cacheWriteTokens,omitempty"`
	ReasoningTokens    int               `json:"reasoningTokens,omitempty"`
	EstimatedCost      float64           `json:"estimatedCost"`
	SuggestedLines     int               `json:"suggestedLines,omitempty"`
	AcceptedLines      int               `json:"acceptedLines,omitempty"`
	AddedLines         int               `json:"addedLines,omitempty"`
	DeletedLines       int               `json:"deletedLines,omitempty"`
	Commits            int               `json:"commits,omitempty"`
	AiPercent          *float64          `json:"aiPercent,omitempty"`
	Requests           int               `json:"requests,omitempty"`
	Source             string            `json:"source,omitempty"`
	Verified           bool              `json:"verified,omitempty"`
	MetricKind         string            `json:"metricKind,omitempty"`
	CostKind           string            `json:"costKind,omitempty"`
	TokenSemantics     string            `json:"tokenSemantics,omitempty"`
	CalculationVersion string            `json:"calculationVersion,omitempty"`
	Repository         *RepositoryReport `json:"repository,omitempty"`
	Metadata           map[string]any    `json:"metadata,omitempty"`
}

type SignalsPolicy struct {
	Enabled         bool     `json:"enabled"`
	RetentionDays   int      `json:"retentionDays"`
	CollectionMode  string   `json:"collectionMode"`
	ExcludedApps    []string `json:"excludedApps"`
	ExcludedDomains []string `json:"excludedDomains"`
	StoreEvents     bool     `json:"storeEvents"`
	UpdatedAt       string   `json:"updatedAt,omitempty"`
}

type SignalsStep struct {
	App       string  `json:"app,omitempty"`
	Domain    *string `json:"domain"`
	StartedAt string  `json:"startedAt"`
	EndedAt   string  `json:"endedAt"`
}

type SignalsSession struct {
	LocalID         string         `json:"localId"`
	StartedAt       string         `json:"startedAt"`
	EndedAt         string         `json:"endedAt"`
	DurationSeconds int            `json:"durationSeconds"`
	AITool          string         `json:"aiTool"`
	AppBefore       string         `json:"appBefore,omitempty"`
	DomainBefore    *string        `json:"domainBefore"`
	AppAfter        string         `json:"appAfter,omitempty"`
	DomainAfter     *string        `json:"domainAfter"`
	FlowSignature   string         `json:"flowSignature"`
	Confidence      float64        `json:"confidence"`
	CollectionMode  string         `json:"collectionMode"`
	Steps           []SignalsStep  `json:"steps"`
	Metadata        map[string]any `json:"metadata,omitempty"`
}

type RepositoryReport struct {
	Host  string `json:"host"`
	Owner string `json:"owner"`
	Name  string `json:"name"`
}

// --- API calls --------------------------------------------------------------

func (c *APIClient) Heartbeat(p HeartbeatPayload) (*HeartbeatResponse, error) {
	var out HeartbeatResponse
	if err := c.postJSON("/api/devices/heartbeat", p, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *APIClient) ReportAgentUpdate(event AgentUpdateEvent) error {
	return c.post("/api/devices/agent-update", event)
}

func (c *APIClient) CheckAgentUpdate() (*AgentUpdateDirective, error) {
	var out AgentUpdateCheckResponse
	if err := c.postJSON("/api/devices/agent-update/check", map[string]any{}, &out); err != nil {
		return nil, err
	}
	return out.Update, nil
}

func (c *APIClient) ReportTools(tools []ToolReport) error {
	return c.post("/api/devices/tools", map[string]any{"tools": tools})
}

func (c *APIClient) ReportLocalModels(models []LocalModelReport) error {
	return c.post("/api/devices/local-models", map[string]any{"models": models})
}

func (c *APIClient) ReportAccounts(accounts []AccountReport) error {
	return c.post("/api/devices/accounts", map[string]any{"accounts": accounts})
}

func (c *APIClient) ReportQuotas(quotas []QuotaReport) error {
	return c.post("/api/devices/quota", map[string]any{"quotas": quotas})
}

func (c *APIClient) ReportLocalUsage(aggregates []UsageAggregate) error {
	return c.post("/api/ingest/local-usage", map[string]any{"aggregates": aggregates})
}

func (c *APIClient) SignalsPolicy() (*SignalsPolicy, error) {
	req, err := http.NewRequest(http.MethodGet, c.baseURL+"/api/devices/signals-policy", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("GET /api/devices/signals-policy returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var out struct {
		Policy SignalsPolicy `json:"policy"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, err
	}
	return &out.Policy, nil
}

func (c *APIClient) ReportSignalsSessions(sessions []SignalsSession) error {
	return c.post("/api/ingest/signals-sessions", map[string]any{"sessions": sessions})
}

// --- Enrollment (no Bearer token needed) ------------------------------------

type EnrollRequest struct {
	Token        string `json:"token"`
	Email        string `json:"email,omitempty"`
	Name         string `json:"name,omitempty"`
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	Architecture string `json:"architecture"`
	AgentVersion string `json:"agentVersion"`
}

type EnrollResponse struct {
	DeviceID    string      `json:"deviceId"`
	UserID      string      `json:"userId"`
	OrgID       string      `json:"orgId"`
	DeviceToken string      `json:"deviceToken"`
	GatewayURL  string      `json:"gatewayUrl"`
	Otel        *EnrollOtel `json:"otel,omitempty"`
}

type EnrollOtel struct {
	Enabled         bool   `json:"enabled"`
	MetricsEndpoint string `json:"metricsEndpoint"`
}

// Enroll sends the enrollment request to baseURL without authentication.
func Enroll(baseURL string, req EnrollRequest) (*EnrollResponse, error) {
	data, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequest(http.MethodPost, baseURL+"/api/enroll", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(body))
		var errResp struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(body, &errResp) == nil && errResp.Error != "" {
			msg = errResp.Error
		}
		return nil, fmt.Errorf("enroll failed (%d): %s", resp.StatusCode, msg)
	}

	var out EnrollResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("invalid enroll response: %w", err)
	}
	return &out, nil
}
