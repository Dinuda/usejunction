package providers

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/types"
)

type ContinueProvider struct{}

func (p *ContinueProvider) ID() string { return "continue" }

func (p *ContinueProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	home, _ := os.UserHomeDir()
	paths := []string{
		filepath.Join(home, ".continue", "config.json"),
		filepath.Join(home, ".continue", "config.yaml"),
	}
	var configPath string
	detected := false
	for _, pth := range paths {
		if fileExists(pth) {
			detected = true
			configPath = pth
			break
		}
	}
	configured := false
	if configPath != "" {
		data, _ := os.ReadFile(configPath)
		configured = strings.Contains(string(data), "localhost:4000") || strings.Contains(string(data), "usejunction")
	}
	return &types.ToolStatus{ToolName: p.ID(), Detected: detected, Configured: configured, ConfigPath: configPath}, nil
}

func (p *ContinueProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
}

func (p *ContinueProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	return nil, nil
}

func (p *ContinueProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return nil, nil
}
