package probe

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/platformdirs"
	"github.com/usejunction/agent/internal/types"
)

func opencodeAuthPath() string {
	for _, dir := range platformdirs.OpenCodeCandidates() {
		candidate := filepath.Join(dir, "auth.json")
		if fileExists(candidate) {
			return candidate
		}
	}
	return filepath.Join(platformdirs.OpenCodeCandidates()[0], "auth.json")
}

// OpenCodeConfigured reports whether local OpenCode auth/config is present.
func OpenCodeConfigured() bool {
	if fileExists(opencodeAuthPath()) {
		return true
	}
	for _, dir := range platformdirs.OpenCodeCandidates() {
		if fileExists(filepath.Join(dir, "account.json")) || fileExists(filepath.Join(dir, "opencode.json")) {
			return true
		}
	}
	return false
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
