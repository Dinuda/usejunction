package providers

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/types"
)

type CopilotProvider struct{}

func (p *CopilotProvider) ID() string { return "github-copilot" }

func (p *CopilotProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	home, _ := os.UserHomeDir()
	roots := []string{
		filepath.Join(home, ".vscode", "extensions"),
		filepath.Join(home, ".vscode-insiders", "extensions"),
		filepath.Join(home, ".cursor", "extensions"),
	}
	detected := false
	configPath := ""
	for _, root := range roots {
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if strings.HasPrefix(strings.ToLower(entry.Name()), "github.copilot-") || strings.HasPrefix(strings.ToLower(entry.Name()), "github.copilot-chat-") {
				detected = true
				configPath = filepath.Join(root, entry.Name())
				break
			}
		}
		if detected {
			break
		}
	}
	return &types.ToolStatus{ToolName: p.ID(), Detected: detected, Configured: false, ConfigPath: configPath}, nil
}

func (p *CopilotProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "github"}, nil
}

func (p *CopilotProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	return nil, nil
}

func (p *CopilotProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return nil, nil
}
