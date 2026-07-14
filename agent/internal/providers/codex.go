package providers

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/probe"
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
	if _, err := exec.LookPath("codex"); err == nil {
		detected = true
	}

	configured := false
	if detected && fileExists(configPath) {
		data, _ := os.ReadFile(configPath)
		s := string(data)
		configured = strings.Contains(s, "usejunction") || strings.Contains(s, "localhost:4000")
	}

	return &types.ToolStatus{
		ToolName:   p.ID(),
		Detected:   detected,
		Configured: configured,
		ConfigPath: configPath,
	}, nil
}

func (p *CodexProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	account, err := probe.CodexAccountIdentity(ctx, codexHome())
	if err != nil {
		return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
	}
	return account, nil
}

func (p *CodexProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	quotas, _, err := probe.ProbeCodexQuota(ctx, codexHome())
	return quotas, err
}

func (p *CodexProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return scan.ScanCodex(codexHome(), refresh)
}
