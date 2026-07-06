package providers

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/types"
)

type ClineProvider struct {
	Tool string
}

func (p *ClineProvider) ID() string {
	if p.Tool != "" {
		return p.Tool
	}
	return "cline"
}

func (p *ClineProvider) toolID() string {
	return p.ID()
}

func (p *ClineProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, "Library", "Application Support", "Code", "User", "globalStorage"),
		filepath.Join(home, "Library", "Application Support", "Cursor", "User", "globalStorage"),
		filepath.Join(home, ".config", "Code", "User", "globalStorage"),
	}
	detected := false
	for _, c := range candidates {
		if dirExists(c) {
			entries, _ := os.ReadDir(c)
			for _, e := range entries {
				name := strings.ToLower(e.Name())
				if strings.Contains(name, p.toolID()) || strings.Contains(name, "rooveterinary") || strings.Contains(name, "opencode") {
					detected = true
					break
				}
			}
		}
	}
	return &types.ToolStatus{ToolName: p.toolID(), Detected: detected, Configured: false}, nil
}

func (p *ClineProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	return &types.ToolAccount{ToolName: p.toolID(), LoginMethod: "unknown"}, nil
}

func (p *ClineProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	return nil, nil
}

func (p *ClineProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return nil, nil
}
