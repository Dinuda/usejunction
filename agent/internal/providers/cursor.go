package providers

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/usejunction/agent/internal/types"
)

type CursorProvider struct{}

func (p *CursorProvider) ID() string { return "cursor" }

func (p *CursorProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "Library", "Application Support", "Cursor", "User"),
		filepath.Join(home, ".config", "Cursor", "User"),
		filepath.Join(home, ".cursor"),
	}
	detected := false
	configPath := ""
	for _, candidate := range candidates {
		if dirExists(candidate) {
			detected = true
			configPath = candidate
			break
		}
	}
	if _, err := exec.LookPath("cursor"); err == nil {
		detected = true
	}
	return &types.ToolStatus{ToolName: p.ID(), Detected: detected, Configured: false, ConfigPath: configPath}, nil
}

func (p *CursorProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "company_managed"}, nil
}

func (p *CursorProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	return nil, nil
}

func (p *CursorProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return nil, nil
}
