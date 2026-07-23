package providers

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/usejunction/agent/internal/platformdirs"
	"github.com/usejunction/agent/internal/probe"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

type AntigravityProvider struct{}

func (p *AntigravityProvider) ID() string { return "antigravity" }

func (p *AntigravityProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	_ = ctx
	detected := false
	configPath := ""

	for _, userDir := range platformdirs.AntigravityUserDirs() {
		if dirExists(userDir) {
			detected = true
			configPath = userDir
			break
		}
	}
	for _, root := range platformdirs.GeminiAntigravityRoots() {
		if dirExists(root) {
			detected = true
			if configPath == "" {
				configPath = root
			}
			break
		}
	}
	if runtime.GOOS == "darwin" {
		for _, app := range []string{
			"/Applications/Antigravity.app",
			"/Applications/Antigravity IDE.app",
		} {
			if dirExists(app) {
				detected = true
				break
			}
		}
	}
	if _, err := exec.LookPath("agy"); err == nil {
		detected = true
	}
	if _, err := exec.LookPath("antigravity"); err == nil {
		detected = true
	}

	home, _ := os.UserHomeDir()
	if dirExists(filepath.Join(home, ".antigravity")) {
		detected = true
		if configPath == "" {
			configPath = filepath.Join(home, ".antigravity")
		}
	}

	configured := false
	if detected {
		if account, err := probe.AntigravityAccountFromLocal(); err == nil && account != nil && account.AuthPresent {
			configured = true
		}
	}
	return &types.ToolStatus{
		ToolName:   p.ID(),
		Detected:   detected,
		Configured: configured,
		ConfigPath: configPath,
	}, nil
}

func (p *AntigravityProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	account, err := probe.AntigravityAccountIdentity(ctx)
	if err != nil {
		return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
	}
	return account, nil
}

func (p *AntigravityProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	quotas, _, err := probe.ProbeAntigravityQuota(ctx)
	return quotas, err
}

func (p *AntigravityProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	local, err := scan.ScanAntigravityLocal(refresh)
	if err != nil {
		return nil, err
	}
	lsRows, _ := probe.ScanAntigravityUsageFromLS(ctx)
	if len(lsRows) == 0 {
		return local, nil
	}
	return scan.MergeAntigravityUsage(local, lsRows), nil
}
