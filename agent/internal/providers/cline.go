package providers

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

// ClineProvider handles Cline and Roo — VS Code extension-based tools
// detected by their globalStorage directory name. OpenCode has its own provider.
type ClineProvider struct {
	// Tool is one of "cline" or "roo".
	Tool string
}

func (p *ClineProvider) ID() string {
	if p.Tool != "" {
		return p.Tool
	}
	return "cline"
}

func (p *ClineProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	home, _ := os.UserHomeDir()
	globalStorageDirs := []string{
		filepath.Join(home, "Library", "Application Support", "Code", "User", "globalStorage"),
		filepath.Join(home, "Library", "Application Support", "Cursor", "User", "globalStorage"),
		filepath.Join(home, ".config", "Code", "User", "globalStorage"),
		filepath.Join(home, ".config", "Cursor", "User", "globalStorage"),
	}

	detected := false
	for _, base := range globalStorageDirs {
		if !dirExists(base) {
			continue
		}
		entries, err := os.ReadDir(base)
		if err != nil {
			continue
		}
		for _, e := range entries {
			name := strings.ToLower(e.Name())
			if p.matchesExtension(name) {
				detected = true
				break
			}
		}
		if detected {
			break
		}
	}

	return &types.ToolStatus{
		ToolName:   p.ID(),
		Detected:   detected,
		Configured: false,
	}, nil
}

func (p *ClineProvider) matchesExtension(dirName string) bool {
	switch p.Tool {
	case "cline":
		return strings.Contains(dirName, "cline")
	case "roo":
		return strings.Contains(dirName, "roo") || strings.Contains(dirName, "rooveterinary")
	default:
		return strings.Contains(dirName, p.Tool)
	}
}

func (p *ClineProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "unknown"}, nil
}

func (p *ClineProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	return nil, nil
}

func (p *ClineProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return scan.ScanClineFamily(p.ID(), refresh)
}
