package providers

import (
	"context"

	"github.com/usejunction/agent/internal/types"
)

type Provider interface {
	ID() string
	Detect(ctx context.Context) (*types.ToolStatus, error)
	ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error)
	ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error)
	AccountIdentity(ctx context.Context) (*types.ToolAccount, error)
}

func All() []Provider {
	return []Provider{
		&CodexProvider{},
		&ClaudeProvider{},
		&ContinueProvider{},
		&ClineProvider{Tool: "cline"},
		&ClineProvider{Tool: "roo"},
		&ClineProvider{Tool: "opencode"},
		&OllamaProvider{},
		&LMStudioProvider{},
	}
}
