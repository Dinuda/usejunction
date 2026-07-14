package providers

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/scan"
	"github.com/usejunction/agent/internal/types"
)

type CopilotProvider struct{}

func (p *CopilotProvider) ID() string { return "copilot" }

func (p *CopilotProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	home, _ := os.UserHomeDir()
	roots := []string{
		filepath.Join(home, ".vscode", "extensions"),
		filepath.Join(home, ".vscode-insiders", "extensions"),
		filepath.Join(home, ".cursor", "extensions"),
		filepath.Join(home, "Library", "Application Support", "Cursor", "User", "extensions"),
	}
	detected := false
	configPath := ""
	for _, root := range roots {
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			name := strings.ToLower(entry.Name())
			if strings.HasPrefix(name, "github.copilot-") || strings.HasPrefix(name, "github.copilot-chat-") {
				detected = true
				configPath = filepath.Join(root, entry.Name())
				break
			}
		}
		if detected {
			break
		}
	}
	return &types.ToolStatus{ToolName: p.ID(), Detected: detected, Configured: detected, ConfigPath: configPath}, nil
}

func (p *CopilotProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "github", AuthPresent: false}, nil
}

func (p *CopilotProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	return nil, nil
}

func (p *CopilotProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return scan.ScanCopilot(refresh)
}
