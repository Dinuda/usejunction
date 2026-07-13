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
	return &types.ToolStatus{
		ToolName:   p.ID(),
		Detected:   detected,
		Configured: configured,
		ConfigPath: dir,
	}, nil
}

func (p *ClaudeProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	creds := filepath.Join(claudeConfigDir(), ".credentials.json")
	if !fileExists(creds) {
		return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
	}
	data, _ := os.ReadFile(creds)
	var m map[string]any
	_ = json.Unmarshal(data, &m)
	email, _ := m["email"].(string)
	return &types.ToolAccount{
		ToolName:    p.ID(),
		Email:       email,
		LoginMethod: "oauth",
		AuthPresent: true,
	}, nil
}

func (p *ClaudeProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
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
