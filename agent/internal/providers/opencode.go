package providers

import (
	"context"
	"os/exec"

	"github.com/usejunction/agent/internal/probe"
	"github.com/usejunction/agent/internal/platformdirs"
	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

type OpenCodeProvider struct{}

func (p *OpenCodeProvider) ID() string { return "opencode" }

func (p *OpenCodeProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	candidates := append(platformdirs.OpenCodeCandidates(), "/Applications/OpenCode.app")
	detected := false
	configPath := ""
	for _, candidate := range candidates {
		if fileExists(candidate) || dirExists(candidate) {
			detected = true
			configPath = candidate
			break
		}
	}
	if _, err := exec.LookPath("opencode"); err == nil {
		detected = true
	}
	configured := probe.OpenCodeConfigured()
	return &types.ToolStatus{
		ToolName:   p.ID(),
		Detected:   detected,
		Configured: configured,
		ConfigPath: configPath,
	}, nil
}

func (p *OpenCodeProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	account, err := probe.OpenCodeAccountIdentity(ctx)
	if err != nil {
		return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
	}
	return account, nil
}

func (p *OpenCodeProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	quotas, _, err := probe.ProbeOpenCodeQuota(ctx)
	return quotas, err
}

func (p *OpenCodeProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return scan.ScanClineFamily(p.ID(), refresh)
}
