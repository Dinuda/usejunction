// Package client provides an authenticated HTTP client for the UseJunction
// control plane API.
package client

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/controlurl"
)

// ErrUnauthorized means the device token is no longer accepted by the control plane.
var ErrUnauthorized = errors.New("unauthorized")

// APIClient is an authenticated HTTP client for the control plane.
type APIClient struct {
	baseURL string
	token   string
	http    *http.Client
}

// New creates an APIClient from an enrolled config.
func New(cfg *config.Config) *APIClient {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	// Parallel usage-batch uploads share this client; raise idle conns so
	// workers are not serialized on the default MaxIdleConnsPerHost=2.
	transport.MaxIdleConns = 32
	transport.MaxIdleConnsPerHost = 8
	return &APIClient{
		baseURL: cfg.ControlPlaneURL,
		token:   cfg.DeviceToken,
		http: &http.Client{
			Timeout:   90 * time.Second,
			Transport: transport,
		},
	}
}

func (c *APIClient) post(path string, body any) error {
	return c.postJSON(path, body, nil)
}

func (c *APIClient) postJSON(path string, body any, out any) error {
	if err := controlurl.Validate(c.baseURL); err != nil {
		return err
	}
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
	if resp.StatusCode == http.StatusUnauthorized {
		return ErrUnauthorized
	}
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
	// TimeZone is the machine IANA timezone when known (e.g. Asia/Colombo).
	TimeZone string `json:"timeZone,omitempty"`
}

type AgentUpdateDirective struct {
	ReleaseID     string               `json:"releaseId"`
	AttemptID     string               `json:"attemptId"`
	TargetVersion string               `json:"targetVersion"`
	Urgency       string               `json:"urgency"`
	ArtifactURL   string               `json:"artifactUrl"`
	ArtifactKey   string               `json:"artifactKey"`
	SHA256        string               `json:"sha256"`
	Size          int64                `json:"size"`
	EligibleAt    string               `json:"eligibleAt"`
	Manifest      AgentReleaseManifest `json:"manifest"`
}

type AgentReleaseArtifact struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type AgentReleaseManifest struct {
	SchemaVersion int                             `json:"schemaVersion"`
	Version       string                          `json:"version"`
	PublishedAt   string                          `json:"publishedAt"`
	Urgency       string                          `json:"urgency"`
	RolloutHours  int                             `json:"rolloutHours"`
	Artifacts     map[string]AgentReleaseArtifact `json:"artifacts"`
	SigningKeyID  string                          `json:"signingKeyId"`
	Signature     string                          `json:"signature"`
}

type HeartbeatResponse struct {
	OK        bool                  `json:"ok"`
	DeviceID  string                `json:"deviceId"`
	Update    *AgentUpdateDirective `json:"update,omitempty"`
	Uninstall bool                  `json:"uninstall,omitempty"`
	// FullUsageRescanDay is the UTC YYYY-MM-DD sealed by the daily usage refresh
	// cron. Agents run one full local usage rescan when this exceeds their
	// persisted lastFullUsageRescanDay.
	FullUsageRescanDay string `json:"fullUsageRescanDay,omitempty"`
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
	Enabled                 bool     `json:"enabled"`
	RetentionDays           int      `json:"retentionDays"`
	CollectionMode          string   `json:"collectionMode"`
	ExcludedApps            []string `json:"excludedApps"`
	ExcludedDomains         []string `json:"excludedDomains"`
	StoreEvents             bool     `json:"storeEvents"`
	WorkExtractionEnabled   bool     `json:"workExtractionEnabled"`
	WorkExtractionStartedAt string   `json:"workExtractionStartedAt,omitempty"`
	UpdatedAt               string   `json:"updatedAt,omitempty"`
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

type WorkTraceLocation struct {
	Kind       string            `json:"kind,omitempty"`
	Project    string            `json:"project,omitempty"`
	Repository *RepositoryReport `json:"repository,omitempty"`
}

type WorkTraceStep struct {
	Kind string `json:"kind"`
	Name string `json:"name,omitempty"`
}

type WorkTraceStats struct {
	LinesAdded   int `json:"linesAdded,omitempty"`
	LinesRemoved int `json:"linesRemoved,omitempty"`
	FilesChanged int `json:"filesChanged,omitempty"`
}

type WorkTraceChurn struct {
	FilesRewritten int `json:"filesRewritten,omitempty"`
	RewriteEvents  int `json:"rewriteEvents,omitempty"`
}

type WorkTraceVerify struct {
	AfterEdit bool     `json:"afterEdit,omitempty"`
	Kinds     []string `json:"kinds,omitempty"`
}

type WorkTraceGitCommit struct {
	SHA          string `json:"sha"`
	Subject      string `json:"subject"`
	FilesChanged int    `json:"filesChanged,omitempty"`
	LinesAdded   int    `json:"linesAdded,omitempty"`
	LinesRemoved int    `json:"linesRemoved,omitempty"`
}

type WorkTraceGit struct {
	Branch    string               `json:"branch,omitempty"`
	Committed *bool                `json:"committed,omitempty"`
	PRNumber  int                  `json:"prNumber,omitempty"`
	Commits   []WorkTraceGitCommit `json:"commits,omitempty"`
}

// WorkTraceUnderstanding is derived episode claims. Never includes prompts or
// message bodies — only structured insights with confidence.
type WorkTraceUnderstanding struct {
	Version      int                               `json:"version"`
	Intent       string                            `json:"intent,omitempty"`
	IntentSource string                            `json:"intentSource,omitempty"` // summary|title|plan|user_turn_derived
	Context      *WorkTraceUnderstandingContext    `json:"context,omitempty"`
	Actors       *WorkTraceUnderstandingActors     `json:"actors,omitempty"`
	Sequence     *WorkTraceUnderstandingSequence   `json:"sequence,omitempty"`
	Attempts     *WorkTraceUnderstandingAttempts   `json:"attempts,omitempty"`
	Authorship   *WorkTraceUnderstandingAuthorship `json:"authorship,omitempty"`
	Acceptance   *WorkTraceUnderstandingAcceptance `json:"acceptance,omitempty"`
	Outcome      *WorkTraceUnderstandingOutcome    `json:"outcome,omitempty"`
	Confidence   *WorkTraceUnderstandingConfidence `json:"confidence,omitempty"`
}

type WorkTraceUnderstandingContext struct {
	Kinds        []string `json:"kinds,omitempty"`
	PrimaryFiles []string `json:"primaryFiles,omitempty"`
	Skills       []string `json:"skills,omitempty"`
}

type WorkTraceUnderstandingActors struct {
	Tool  string `json:"tool"`
	Model string `json:"model,omitempty"`
	Mode  string `json:"mode,omitempty"`
}

type WorkTraceUnderstandingSequence struct {
	Fingerprint    string `json:"fingerprint,omitempty"`
	UserTurns      int    `json:"userTurns,omitempty"`
	AssistantTurns int    `json:"assistantTurns,omitempty"`
	ToolCalls      int    `json:"toolCalls,omitempty"`
}

type WorkTraceUnderstandingAttempts struct {
	Score   int      `json:"score"`
	Signals []string `json:"signals,omitempty"`
}

type WorkTraceUnderstandingAuthorship struct {
	AIEditEvents    int     `json:"aiEditEvents,omitempty"`
	HumanEditEvents int     `json:"humanEditEvents,omitempty"`
	TabEditEvents   int     `json:"tabEditEvents,omitempty"`
	AIShare         float64 `json:"aiShare,omitempty"`
	RequestCount    int     `json:"requestCount,omitempty"`
}

type WorkTraceUnderstandingAcceptance struct {
	Status  string   `json:"status"` // unknown|likely_kept|mixed|abandoned
	Signals []string `json:"signals,omitempty"`
}

type WorkTraceUnderstandingOutcome struct {
	Status   string   `json:"status"` // unknown|in_progress|verified|committed|abandoned
	Evidence []string `json:"evidence,omitempty"`
}

type WorkTraceUnderstandingConfidence struct {
	Intent     float64 `json:"intent,omitempty"`
	Authorship float64 `json:"authorship,omitempty"`
	Acceptance float64 `json:"acceptance,omitempty"`
	Outcome    float64 `json:"outcome,omitempty"`
}

// WorkTrace is structured activity for a work session. Full assistant chat and
// file contents are never included. Allowlisted prose lives under userTurns[].text
// and changeNarrative.text only.
type WorkTrace struct {
	Approach         string                    `json:"approach,omitempty"`
	Location         *WorkTraceLocation        `json:"location,omitempty"`
	Skills           []string                  `json:"skills,omitempty"`
	Tools            []string                  `json:"tools,omitempty"`
	Files            []string                  `json:"files,omitempty"`
	Steps            []WorkTraceStep           `json:"steps,omitempty"`
	Stats            *WorkTraceStats           `json:"stats,omitempty"`
	DurationSeconds  int                       `json:"durationSeconds,omitempty"`
	Phases           []string                  `json:"phases,omitempty"`
	PhaseFingerprint string                    `json:"phaseFingerprint,omitempty"`
	Churn            *WorkTraceChurn           `json:"churn,omitempty"`
	Verify           *WorkTraceVerify          `json:"verify,omitempty"`
	Languages        []string                  `json:"languages,omitempty"`
	TestInvolved     *bool                     `json:"testInvolved,omitempty"`
	SkillCounts      map[string]int            `json:"skillCounts,omitempty"`
	Git              *WorkTraceGit             `json:"git,omitempty"`
	Understanding    *WorkTraceUnderstanding   `json:"understanding,omitempty"`
	UserTurns        []WorkTraceUserTurn       `json:"userTurns,omitempty"`
	FileChangelog    []WorkTraceFileChange     `json:"fileChangelog,omitempty"`
	ChangeNarrative  *WorkTraceChangeNarrative `json:"changeNarrative,omitempty"`
}

// WorkTraceUserTurn is a user-only turn. Never store assistant replies here.
type WorkTraceUserTurn struct {
	At    string                `json:"at,omitempty"`
	Text  string                `json:"text"`
	Files []WorkTraceFileChange `json:"files,omitempty"` // files touched after this turn, before the next
}

// WorkTraceChangeNarrative is a clipped, redacted "what changed" summary —
// either from a tool-provided conversation summary or the final assistant wrap-up.
// Never store full chat transcripts here.
type WorkTraceChangeNarrative struct {
	Text    string   `json:"text"`
	At      string   `json:"at,omitempty"`
	Source  string   `json:"source"` // assistant_final|conversation_summary|composer_subtitle
	Bullets []string `json:"bullets,omitempty"`
}

// WorkTraceFileChange is a basename-level change log entry (no file contents).
type WorkTraceFileChange struct {
	File   string `json:"file"`
	Op     string `json:"op"`               // read|write|create|delete|edit|unknown
	Source string `json:"source,omitempty"` // composer|human|tab|tool|unknown
	Events int    `json:"events,omitempty"`
}

type WorkSession struct {
	LocalID        string            `json:"localId"`
	ToolName       string            `json:"toolName"`
	Model          string            `json:"model,omitempty"`
	Mode           string            `json:"mode,omitempty"`
	Title          string            `json:"title,omitempty"`
	Tldr           string            `json:"tldr,omitempty"`
	Overview       string            `json:"overview,omitempty"`
	StartedAt      string            `json:"startedAt,omitempty"`
	EndedAt        string            `json:"endedAt,omitempty"`
	ObservedAt     string            `json:"observedAt"`
	ToolCallCounts map[string]int    `json:"toolCallCounts,omitempty"`
	Trace          *WorkTrace        `json:"trace,omitempty"`
	Repository     *RepositoryReport `json:"repository,omitempty"`
	Source         string            `json:"source"`
	Metadata       map[string]any    `json:"metadata,omitempty"`
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

// localUsageBatchSize aligns with scan.UsageUploadBatchSize so each
// ReportLocalUsage call is typically one POST.
const localUsageBatchSize = 50

// localUsageMaxPayloadBytes keeps each POST under the control-plane
// 1 MiB body limit with headroom for JSON framing.
const localUsageMaxPayloadBytes = 900 * 1024

func (c *APIClient) ReportLocalUsage(aggregates []UsageAggregate) error {
	for _, batch := range chunkUsageAggregates(aggregates, localUsageBatchSize, localUsageMaxPayloadBytes) {
		var out struct {
			Upserted int `json:"upserted"`
		}
		if err := c.postJSON("/api/ingest/local-usage", map[string]any{"aggregates": batch}, &out); err != nil {
			return err
		}
		// HTTP 200 with upserted=0 means nothing landed (all rows dropped).
		// Treat as failure so the caller does not fingerprint those rows.
		if len(batch) > 0 && out.Upserted <= 0 {
			return fmt.Errorf("POST /api/ingest/local-usage upserted 0 of %d aggregates", len(batch))
		}
	}
	return nil
}

// chunkUsageAggregates packs rows until either maxRows or maxBytes would be
// exceeded for {"aggregates":[...]}. A single oversized row is sent alone.
func chunkUsageAggregates(aggregates []UsageAggregate, maxRows, maxBytes int) [][]UsageAggregate {
	if len(aggregates) == 0 {
		return nil
	}
	if maxRows <= 0 {
		maxRows = localUsageBatchSize
	}
	if maxBytes <= 0 {
		maxBytes = localUsageMaxPayloadBytes
	}

	out := make([][]UsageAggregate, 0)
	batch := make([]UsageAggregate, 0, maxRows)
	batchBytes := len(`{"aggregates":[]}`)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		cp := make([]UsageAggregate, len(batch))
		copy(cp, batch)
		out = append(out, cp)
		batch = batch[:0]
		batchBytes = len(`{"aggregates":[]}`)
	}

	for _, row := range aggregates {
		rowJSON, err := json.Marshal(row)
		if err != nil {
			// Fall back to count-only packing if a row cannot be measured.
			if len(batch) >= maxRows {
				flush()
			}
			batch = append(batch, row)
			continue
		}
		rowBytes := len(rowJSON)
		// Comma separators between array elements.
		extra := rowBytes
		if len(batch) > 0 {
			extra++
		}
		if len(batch) > 0 && (len(batch) >= maxRows || batchBytes+extra > maxBytes) {
			flush()
			extra = rowBytes
		}
		batch = append(batch, row)
		batchBytes += extra
	}
	flush()
	return out
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

func (c *APIClient) ReportWorkSessions(sessions []WorkSession) error {
	return c.post("/api/ingest/work-sessions", map[string]any{"sessions": sessions})
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
	if err := controlurl.Validate(baseURL); err != nil {
		return nil, err
	}
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
