package types

type ToolStatus struct {
	ToolName   string
	Detected   bool
	Configured bool
	ConfigPath string
	Version    string
}

type ToolAccount struct {
	ToolName    string
	Email       string
	Plan        string
	LoginMethod string
	AuthPresent bool
}

type QuotaSnapshot struct {
	ToolName         string
	WindowType       string
	UsedPercent      *float64
	ResetAt          *string
	CreditsRemaining *float64
	Source           string
}

type DailyUsage struct {
	Date            string
	ToolName        string
	Model           string
	InputTokens     int
	OutputTokens    int
	CacheReadTokens int
	EstimatedCost   float64
}

type LocalModelInfo struct {
	Provider  string
	ModelName string
	Size      string
	Running   bool
}
