package providers

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/probe"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

type ClaudeProvider struct{}

func (p *ClaudeProvider) ID() string { return "claude" }

func claudeConfigDir() string {
	if d := os.Getenv("CLAUDE_CONFIG_DIR"); d != "" {
		return d
	}
	home, _ := os.UserHomeDir()
	candidate := filepath.Join(home, ".claude")
	if dirExists(candidate) {
		return candidate
	}
	return filepath.Join(home, ".config", "claude")
}

func (p *ClaudeProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	dir := claudeConfigDir()
	creds := filepath.Join(dir, ".credentials.json")
	detected := fileExists(creds) || dirExists(dir)
	if os.Getenv("ANTHROPIC_BASE_URL") != "" {
		detected = true
	}
	configured := false
	baseURL := os.Getenv("ANTHROPIC_BASE_URL")
	if strings.Contains(baseURL, "4000") || strings.Contains(baseURL, "usejunction") {
		configured = true
	}
	if home, err := os.UserHomeDir(); err == nil {
		if fileExists(filepath.Join(home, ".usejunction", "claude-env.sh")) && baseURL != "" {
			configured = true
		}
	}
	return &types.ToolStatus{
		ToolName:   p.ID(),
		Detected:   detected,
		Configured: configured,
		ConfigPath: dir,
	}, nil
}

func (p *ClaudeProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	account, err := probe.ClaudeAccountFromCredentials(claudeConfigDir())
	if err != nil {
		return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
	}
	return account, nil
}

func (p *ClaudeProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	quotas, _, err := probe.ProbeClaudeQuota(ctx, claudeConfigDir())
	return quotas, err
}

func (p *ClaudeProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	home, _ := os.UserHomeDir()
	roots := []string{
		filepath.Join(claudeConfigDir(), "projects"),
		filepath.Join(home, ".claude", "projects"),
		filepath.Join(home, ".config", "claude", "projects"),
	}
	return scan.ScanClaude(roots, refresh)
}
