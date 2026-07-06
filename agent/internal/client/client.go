package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/usejunction/agent/internal/config"
)

type APIClient struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func New(cfg *config.Config) *APIClient {
	return &APIClient{
		BaseURL: cfg.ControlPlaneURL,
		Token:   cfg.DeviceToken,
		HTTP:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *APIClient) post(path string, body any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, c.BaseURL+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Token)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("api %s returned %d", path, resp.StatusCode)
	}
	return nil
}

type HeartbeatPayload struct {
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	Architecture string `json:"architecture"`
	AgentVersion string `json:"agentVersion"`
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
	Date            string  `json:"date"`
	ToolName        string  `json:"toolName"`
	Model           string  `json:"model"`
	InputTokens     int     `json:"inputTokens"`
	OutputTokens    int     `json:"outputTokens"`
	CacheReadTokens int     `json:"cacheReadTokens"`
	EstimatedCost   float64 `json:"estimatedCost"`
}

func (c *APIClient) Heartbeat(p HeartbeatPayload) error {
	return c.post("/api/devices/heartbeat", p)
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

type EnrollRequest struct {
	Token         string `json:"token"`
	Email         string `json:"email,omitempty"`
	Name          string `json:"name,omitempty"`
	Hostname      string `json:"hostname"`
	OS            string `json:"os"`
	Architecture  string `json:"architecture"`
	AgentVersion  string `json:"agentVersion"`
}

type EnrollResponse struct {
	DeviceID    string `json:"deviceId"`
	UserID      string `json:"userId"`
	OrgID       string `json:"orgId"`
	DeviceToken string `json:"deviceToken"`
	GatewayURL  string `json:"gatewayUrl"`
}

func Enroll(baseURL string, req EnrollRequest) (*EnrollResponse, error) {
	data, _ := json.Marshal(req)
	httpReq, err := http.NewRequest(http.MethodPost, baseURL+"/api/enroll", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("enroll failed: %d", resp.StatusCode)
	}
	var out EnrollResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}
