package types

// ToolStatus describes a detected AI coding tool.
type ToolStatus struct {
	ToolName   string `json:"toolName"`
	Detected   bool   `json:"detected"`
	Configured bool   `json:"configured"`
	ConfigPath string `json:"configPath,omitempty"`
	Version    string `json:"version,omitempty"`
}

// ToolAccount describes an authenticated identity for a tool.
type ToolAccount struct {
	ToolName    string `json:"toolName"`
	Email       string `json:"email,omitempty"`
	Plan        string `json:"plan,omitempty"`
	LoginMethod string `json:"loginMethod"`
	AuthPresent bool   `json:"authPresent"`
}

// QuotaSnapshot is a point-in-time quota reading.
type QuotaSnapshot struct {
	ToolName         string   `json:"toolName"`
	WindowType       string   `json:"windowType"`
	UsedPercent      *float64 `json:"usedPercent,omitempty"`
	ResetAt          *string  `json:"resetAt,omitempty"`
	CreditsRemaining *float64 `json:"creditsRemaining,omitempty"`
	Source           string   `json:"source"`
}

// DailyUsage is token/cost data aggregated by date + model.
type DailyUsage struct {
	Date            string              `json:"date"`
	ToolName        string              `json:"toolName"`
	Model           string              `json:"model"`
	InputTokens     int                 `json:"inputTokens"`
	OutputTokens    int                 `json:"outputTokens"`
	CacheReadTokens int                 `json:"cacheReadTokens"`
	EstimatedCost   float64             `json:"estimatedCost"`
	Repository      *RepositoryIdentity `json:"repository,omitempty"`
}

// RepositoryIdentity is the canonical remote identity of a repository. Local
// filesystem paths are deliberately never included in reports.
type RepositoryIdentity struct {
	Host  string `json:"host"`
	Owner string `json:"owner"`
	Name  string `json:"name"`
}

// LocalModelInfo describes a locally running model (Ollama, LM Studio, etc.).
type LocalModelInfo struct {
	Provider  string `json:"provider"`
	ModelName string `json:"modelName"`
	Size      string `json:"size,omitempty"`
	Running   bool   `json:"running"`
}
