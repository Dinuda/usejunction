package probe

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
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

func opencodeAccountPath() string {
	for _, dir := range platformdirs.OpenCodeCandidates() {
		candidate := filepath.Join(dir, "account.json")
		if fileExists(candidate) {
			return candidate
		}
	}
	return filepath.Join(platformdirs.OpenCodeCandidates()[0], "account.json")
}

// OpenCodeConfigured reports whether local OpenCode auth/config is present.
func OpenCodeConfigured() bool {
	if fileExists(opencodeAuthPath()) || fileExists(opencodeAccountPath()) {
		return true
	}
	for _, dir := range platformdirs.OpenCodeCandidates() {
		if fileExists(filepath.Join(dir, "opencode.json")) {
			return true
		}
	}
	return false
}

func OpenCodeAccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	_ = ctx
	providers := map[string]struct{}{}

	if data, err := os.ReadFile(opencodeAuthPath()); err == nil {
		for _, name := range opencodeProviderNamesFromAuthJSON(data) {
			providers[name] = struct{}{}
		}
	}
	if data, err := os.ReadFile(opencodeAccountPath()); err == nil {
		for _, name := range opencodeServiceIDsFromAccountJSON(data) {
			providers[name] = struct{}{}
		}
	}

	if len(providers) == 0 {
		if OpenCodeConfigured() {
			return &types.ToolAccount{ToolName: "opencode", LoginMethod: "local", AuthPresent: false}, nil
		}
		return nil, os.ErrNotExist
	}
	return opencodeAccountFromProviders(providers), nil
}

func opencodeProviderNamesFromAuthJSON(data []byte) []string {
	var providers map[string]json.RawMessage
	if json.Unmarshal(data, &providers) != nil {
		return nil
	}
	names := make([]string, 0, len(providers))
	for name := range providers {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		names = append(names, name)
	}
	return names
}

// opencodeServiceIDsFromAccountJSON reads account.json active/account serviceIDs
// only — never credential keys, tokens, or OAuth material.
func opencodeServiceIDsFromAccountJSON(data []byte) []string {
	var root struct {
		Active   map[string]string `json:"active"`
		Accounts map[string]struct {
			ServiceID string `json:"serviceID"`
		} `json:"accounts"`
	}
	if json.Unmarshal(data, &root) != nil {
		return nil
	}
	seen := map[string]struct{}{}
	for serviceID := range root.Active {
		serviceID = strings.TrimSpace(serviceID)
		if serviceID != "" {
			seen[serviceID] = struct{}{}
		}
	}
	for _, acct := range root.Accounts {
		id := strings.TrimSpace(acct.ServiceID)
		if id != "" {
			seen[id] = struct{}{}
		}
	}
	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func opencodeAccountFromAuthJSON(data []byte) (*types.ToolAccount, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	providers := map[string]struct{}{}
	for name := range raw {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		providers[name] = struct{}{}
	}
	return opencodeAccountFromProviders(providers), nil
}

func opencodeAccountFromProviders(providers map[string]struct{}) *types.ToolAccount {
	hasZen := false
	for name := range providers {
		if name == "opencode" || name == "opencode-go" {
			hasZen = true
			break
		}
	}
	plan := ""
	if hasZen {
		plan = "zen"
	} else if len(providers) > 0 {
		plan = "multi_provider"
	}
	loginMethod := "api_key"
	if _, ok := providers["github-copilot"]; ok && len(providers) == 1 {
		loginMethod = "oauth"
	} else if len(providers) > 1 {
		loginMethod = "multi"
	}
	return &types.ToolAccount{
		ToolName:    "opencode",
		Plan:        plan,
		LoginMethod: loginMethod,
		AuthPresent: len(providers) > 0,
	}
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
