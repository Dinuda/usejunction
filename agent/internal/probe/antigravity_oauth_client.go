package probe

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"

	"github.com/usejunction/agent/internal/config"
)

var (
	antigravityGoogleClientIDRe = regexp.MustCompile(`[0-9]{6,20}-[a-z0-9]+\.apps\.googleusercontent\.com`)
	antigravityGoogleSecretRe   = regexp.MustCompile(`GOCSPX-[A-Za-z0-9_\-]{8,}`)
)

type antigravityOAuthClient struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

var (
	antigravityOAuthClientOnce   sync.Once
	antigravityOAuthClientCached *antigravityOAuthClient
	// Test hooks.
	antigravityOAuthClientCachePathOverride string
	antigravityOAuthClientScanRootsOverride []string
)

func antigravityOAuthClientCachePath() string {
	if antigravityOAuthClientCachePathOverride != "" {
		return antigravityOAuthClientCachePathOverride
	}
	return filepath.Join(config.ConfigDir(), "cache", "antigravity-oauth-client.json")
}

// resolveAntigravityOAuthClient returns the Antigravity desktop OAuth app
// credentials for on-device token refresh. Precedence:
//  1. test overrides
//  2. UJ_ANTIGRAVITY_OAUTH_* env (labs only)
//  3. machine-local cache under ~/.usejunction
//  4. scan local Antigravity / Antigravity IDE install
//
// Credentials never leave the machine and are never logged.
func resolveAntigravityOAuthClient() *antigravityOAuthClient {
	if id := strings.TrimSpace(antigravityOAuthClientIDOverride); id != "" {
		secret := strings.TrimSpace(antigravityOAuthClientSecretOverride)
		if secret != "" {
			return &antigravityOAuthClient{ClientID: id, ClientSecret: secret}
		}
	}
	if id := strings.TrimSpace(os.Getenv(antigravityOAuthClientIDEnv)); id != "" {
		secret := strings.TrimSpace(os.Getenv(antigravityOAuthClientSecretEnv))
		if secret != "" {
			return &antigravityOAuthClient{ClientID: id, ClientSecret: secret}
		}
	}

	antigravityOAuthClientOnce.Do(func() {
		if cached := loadAntigravityOAuthClientCache(); cached != nil {
			antigravityOAuthClientCached = cached
			return
		}
		if discovered := discoverAntigravityOAuthClientFromInstall(); discovered != nil {
			_ = saveAntigravityOAuthClientCache(discovered)
			antigravityOAuthClientCached = discovered
		}
	})
	return antigravityOAuthClientCached
}

// resolveAntigravityOAuthClients returns every usable client pair for refresh
// attempts (primary first, then alternates from the install).
func resolveAntigravityOAuthClients() []antigravityOAuthClient {
	primary := resolveAntigravityOAuthClient()
	out := make([]antigravityOAuthClient, 0, 2)
	seen := map[string]bool{}
	if primary != nil && primary.ClientID != "" && primary.ClientSecret != "" {
		out = append(out, *primary)
		seen[primary.ClientID] = true
	}
	for _, extra := range discoverAntigravityOAuthClientsFromInstall() {
		if seen[extra.ClientID] || extra.ClientSecret == "" {
			continue
		}
		out = append(out, extra)
		seen[extra.ClientID] = true
	}
	return out
}

func loadAntigravityOAuthClientCache() *antigravityOAuthClient {
	data, err := os.ReadFile(antigravityOAuthClientCachePath())
	if err != nil {
		return nil
	}
	var client antigravityOAuthClient
	if json.Unmarshal(data, &client) != nil {
		return nil
	}
	client.ClientID = strings.TrimSpace(client.ClientID)
	client.ClientSecret = strings.TrimSpace(client.ClientSecret)
	if client.ClientID == "" || client.ClientSecret == "" {
		return nil
	}
	return &client
}

func saveAntigravityOAuthClientCache(client *antigravityOAuthClient) error {
	if client == nil {
		return nil
	}
	path := antigravityOAuthClientCachePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(client, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func discoverAntigravityOAuthClientFromInstall() *antigravityOAuthClient {
	clients := discoverAntigravityOAuthClientsFromInstall()
	if len(clients) == 0 {
		return nil
	}
	return &clients[0]
}

func discoverAntigravityOAuthClientsFromInstall() []antigravityOAuthClient {
	var all []antigravityOAuthClient
	seen := map[string]bool{}
	for _, root := range antigravityInstallScanRoots() {
		for _, path := range antigravityOAuthClientCandidateFiles(root) {
			data, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			for _, client := range extractAntigravityOAuthClients(data) {
				if seen[client.ClientID] {
					continue
				}
				seen[client.ClientID] = true
				all = append(all, client)
			}
		}
	}
	return all
}

func antigravityInstallScanRoots() []string {
	if antigravityOAuthClientScanRootsOverride != nil {
		return antigravityOAuthClientScanRootsOverride
	}
	home, _ := os.UserHomeDir()
	var roots []string
	switch runtime.GOOS {
	case "darwin":
		roots = append(roots,
			"/Applications/Antigravity IDE.app",
			"/Applications/Antigravity.app",
			filepath.Join(home, "Applications", "Antigravity IDE.app"),
			filepath.Join(home, "Applications", "Antigravity.app"),
		)
	case "windows":
		for _, env := range []string{"LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"} {
			base := os.Getenv(env)
			if base == "" {
				continue
			}
			roots = append(roots,
				filepath.Join(base, "Antigravity IDE"),
				filepath.Join(base, "Antigravity"),
				filepath.Join(base, "Programs", "Antigravity IDE"),
				filepath.Join(base, "Programs", "Antigravity"),
			)
		}
	default:
		roots = append(roots,
			filepath.Join(home, ".local", "share", "Antigravity IDE"),
			filepath.Join(home, ".local", "share", "Antigravity"),
			"/opt/Antigravity IDE",
			"/opt/Antigravity",
		)
	}
	return roots
}

func antigravityOAuthClientCandidateFiles(root string) []string {
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return nil
	}
	var out []string
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d == nil {
			return nil
		}
		if d.IsDir() {
			name := strings.ToLower(d.Name())
			// Skip heavy/irrelevant trees.
			if name == "node_modules" || name == "locales" || name == "gpucache" ||
				name == "cache" || name == "cacheddata" || name == "code cache" {
				return filepath.SkipDir
			}
			return nil
		}
		name := strings.ToLower(d.Name())
		switch {
		case name == "main.js":
			out = append(out, path)
		case strings.Contains(name, "language_server"):
			out = append(out, path)
		case strings.HasSuffix(name, "oauthclient.js"):
			out = append(out, path)
		}
		return nil
	})
	return out
}

// extractAntigravityOAuthClients pairs Google installed-app client IDs with
// nearby GOCSPX secrets (Antigravity oauthClient.js embeds them as adjacent
// string literals).
func extractAntigravityOAuthClients(data []byte) []antigravityOAuthClient {
	type hit struct {
		kind  string
		value string
		index int
	}
	var hits []hit
	for _, m := range antigravityGoogleClientIDRe.FindAllIndex(data, -1) {
		hits = append(hits, hit{kind: "id", value: string(data[m[0]:m[1]]), index: m[0]})
	}
	for _, m := range antigravityGoogleSecretRe.FindAllIndex(data, -1) {
		hits = append(hits, hit{kind: "secret", value: string(data[m[0]:m[1]]), index: m[0]})
	}
	if len(hits) == 0 {
		return nil
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].index < hits[j].index })

	const maxGap = 240
	var out []antigravityOAuthClient
	seen := map[string]bool{}
	for i := 0; i < len(hits); i++ {
		if hits[i].kind != "id" {
			continue
		}
		for j := i + 1; j < len(hits) && hits[j].index-hits[i].index <= maxGap; j++ {
			if hits[j].kind != "secret" {
				continue
			}
			id := hits[i].value
			secret := hits[j].value
			if seen[id] {
				break
			}
			seen[id] = true
			out = append(out, antigravityOAuthClient{ClientID: id, ClientSecret: secret})
			break
		}
	}
	return out
}

func resetAntigravityOAuthClientCacheForTest() {
	antigravityOAuthClientOnce = sync.Once{}
	antigravityOAuthClientCached = nil
}
