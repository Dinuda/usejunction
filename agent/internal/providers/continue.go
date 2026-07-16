package providers

import (
	"context"
	"os"
	"path/filepath"

	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

type ContinueProvider struct{}

func (p *ContinueProvider) ID() string { return "continue" }

func (p *ContinueProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, ".continue", "config.json"),
		filepath.Join(home, ".continue", "config.yaml"),
	}
	var configPath string
	for _, c := range candidates {
		if fileExists(c) {
			configPath = c
			break
		}
	}
	detected := configPath != ""
	return &types.ToolStatus{
		ToolName:   p.ID(),
		Detected:   detected,
		Configured: detected,
		ConfigPath: configPath,
	}, nil
}

func (p *ContinueProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
}

func (p *ContinueProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	return nil, nil
}

func (p *ContinueProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return scan.ScanContinue(refresh)
}
