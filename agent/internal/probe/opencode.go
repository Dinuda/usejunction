package probe

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/types"
)

func opencodeDataDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "share", "opencode")
}

func opencodeAuthPath() string {
	return filepath.Join(opencodeDataDir(), "auth.json")
}

// OpenCodeConfigured reports whether local OpenCode auth/config is present.
func OpenCodeConfigured() bool {
	if fileExists(opencodeAuthPath()) {
		return true
	}
	if fileExists(filepath.Join(opencodeDataDir(), "account.json")) {
		return true
	}
	home, _ := os.UserHomeDir()
	return fileExists(filepath.Join(home, ".config", "opencode", "opencode.json"))
}

func OpenCodeAccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	_ = ctx
	path := opencodeAuthPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if OpenCodeConfigured() {
			return &types.ToolAccount{ToolName: "opencode", LoginMethod: "local", AuthPresent: false}, nil
		}
		return nil, err
	}
	return opencodeAccountFromAuthJSON(data)
}

func opencodeAccountFromAuthJSON(data []byte) (*types.ToolAccount, error) {
	var providers map[string]json.RawMessage
	if err := json.Unmarshal(data, &providers); err != nil {
		return nil, err
	}
	names := make([]string, 0, len(providers))
	hasZen := false
	for name := range providers {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		names = append(names, name)
		if name == "opencode" || name == "opencode-go" {
			hasZen = true
		}
	}
	plan := ""
	if hasZen {
		plan = "zen"
	} else if len(names) > 0 {
		plan = "multi_provider"
	}
	return &types.ToolAccount{
		ToolName:    "opencode",
		Plan:        plan,
		LoginMethod: "api_key",
		AuthPresent: len(names) > 0,
	}, nil
}

// ProbeOpenCodeQuota currently has no public vendor quota endpoint.
// OpenCode is a multi-provider router; limits live upstream (Copilot/Zen/etc).
func ProbeOpenCodeQuota(ctx context.Context) ([]types.QuotaSnapshot, *types.ToolAccount, error) {
	account, err := OpenCodeAccountIdentity(ctx)
	if err != nil {
		return nil, nil, err
	}
	return nil, account, nil
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
