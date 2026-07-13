// Package providers implements detect/configure logic for each AI coding tool.
package providers

import (
	"context"

	"github.com/usejunction/agent/internal/types"
)

// Provider is the interface every tool adapter must implement.
type Provider interface {
	// ID returns the stable identifier used in config, flags, and API payloads.
	ID() string
	// Detect checks whether the tool is installed and whether it is already
	// configured to route through the UseJunction gateway.
	Detect(ctx context.Context) (*types.ToolStatus, error)
	// AccountIdentity returns any authenticated identity available locally
	// (e.g. from a credentials file). Implementations that cannot determine
	// identity return a placeholder with AuthPresent=false.
	AccountIdentity(ctx context.Context) (*types.ToolAccount, error)
	// ProbeQuota attempts to retrieve current quota/credit information without
	// making network calls that require browser auth. Returns nil when not
	// available.
	ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error)
	// ScanLocalUsage reads local JSONL session logs to aggregate token counts
	// and estimated cost. refresh=true bypasses the on-disk cache.
	ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error)
}

// All returns all known providers in a stable order.
func All() []Provider {
	return []Provider{
		&CodexProvider{},
		&ClaudeProvider{},
		&CursorProvider{},
		&CopilotProvider{},
		&ContinueProvider{},
		&ClineProvider{Tool: "cline"},
		&ClineProvider{Tool: "roo"},
		&ClineProvider{Tool: "opencode"},
		&OllamaProvider{},
		&LMStudioProvider{},
	}
}
