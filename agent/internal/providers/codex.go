package providers

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

type CodexProvider struct{}

func (p *CodexProvider) ID() string { return "codex" }

func codexHome() string {
	if h := os.Getenv("CODEX_HOME"); h != "" {
		return h
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".codex")
}

func (p *CodexProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	home := codexHome()
	configPath := filepath.Join(home, "config.toml")
	authPath := filepath.Join(home, "auth.json")
	detected := fileExists(configPath) || fileExists(authPath)
	_, err := exec.LookPath("codex")
	if err == nil {
		detected = true
	}
	configured := false
	if detected && fileExists(configPath) {
		data, _ := os.ReadFile(configPath)
		configured = strings.Contains(string(data), "usejunction") || strings.Contains(string(data), "localhost:4000")
	}
	return &types.ToolStatus{
		ToolName:   p.ID(),
		Detected:   detected,
		Configured: configured,
		ConfigPath: configPath,
	}, nil
}

func (p *CodexProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	authPath := filepath.Join(codexHome(), "auth.json")
	if !fileExists(authPath) {
		return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
	}
	data, _ := os.ReadFile(authPath)
	var auth map[string]any
	_ = json.Unmarshal(data, &auth)
	email, _ := auth["email"].(string)
	plan, _ := auth["plan_type"].(string)
	return &types.ToolAccount{
		ToolName:    p.ID(),
		Email:       email,
		Plan:        plan,
		LoginMethod: "oauth",
		AuthPresent: true,
	}, nil
}

func (p *CodexProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	if _, err := exec.LookPath("codex"); err != nil {
		return nil, nil
	}
	// Best-effort: check auth.json presence as quota proxy for MVP
	acc, _ := p.AccountIdentity(ctx)
	if acc != nil && acc.AuthPresent {
		used := 0.0
		return []types.QuotaSnapshot{{
			ToolName:    p.ID(),
			WindowType:  "session_5h",
			UsedPercent: &used,
			Source:      "cli_rpc",
		}}, nil
	}
	return nil, nil
}

func (p *CodexProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return scan.ScanCodex(codexHome(), refresh)
}
