package providers

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

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
	if fileExists(filepath.Join(home, ".claude")) {
		return filepath.Join(home, ".claude")
	}
	return filepath.Join(home, ".config", "claude")
}

func (p *ClaudeProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	dir := claudeConfigDir()
	creds := filepath.Join(dir, ".credentials.json")
	detected := fileExists(creds) || fileExists(dir)
	if os.Getenv("ANTHROPIC_BASE_URL") != "" {
		detected = true
	}
	configured := strings.Contains(os.Getenv("ANTHROPIC_BASE_URL"), "4000") ||
		strings.Contains(os.Getenv("ANTHROPIC_BASE_URL"), "usejunction")
	return &types.ToolStatus{
		ToolName: p.ID(), Detected: detected, Configured: configured, ConfigPath: dir,
	}, nil
}

func (p *ClaudeProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	creds := filepath.Join(claudeConfigDir(), ".credentials.json")
	if !fileExists(creds) {
		return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
	}
	data, _ := os.ReadFile(creds)
	var credsMap map[string]any
	_ = json.Unmarshal(data, &credsMap)
	email, _ := credsMap["email"].(string)
	return &types.ToolAccount{
		ToolName: p.ID(), Email: email, LoginMethod: "oauth", AuthPresent: true,
	}, nil
}

func (p *ClaudeProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	acc, _ := p.AccountIdentity(ctx)
	if acc != nil && acc.AuthPresent {
		used := 0.0
		return []types.QuotaSnapshot{{
			ToolName: p.ID(), WindowType: "weekly", UsedPercent: &used, Source: "oauth_api",
		}}, nil
	}
	return nil, nil
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
