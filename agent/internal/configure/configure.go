// Package configure handles writing gateway config for supported tools and
// restoring the originals from backups. Backups use a JSON manifest so that
// original file paths survive any character encoding issues.
package configure

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/usejunction/agent/internal/config"
)

// manifestEntry records one backup event.
type manifestEntry struct {
	OriginalPath string `json:"originalPath"`
	BackupFile   string `json:"backupFile"`
	Tool         string `json:"tool"`
	BackedUpAt   string `json:"backedUpAt"`
}

// manifestPath returns the location of the backup manifest.
func manifestPath() string {
	return filepath.Join(config.BackupDir(), "manifest.json")
}

// loadManifest reads existing manifest entries (returns empty slice on any error).
func loadManifest() []manifestEntry {
	data, err := os.ReadFile(manifestPath())
	if err != nil {
		return nil
	}
	var entries []manifestEntry
	_ = json.Unmarshal(data, &entries)
	return entries
}

// saveManifest writes the manifest to disk.
func saveManifest(entries []manifestEntry) error {
	if err := os.MkdirAll(config.BackupDir(), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(manifestPath(), data, 0600)
}

// BackupFile copies path into the backup dir and records the entry in the
// manifest. If path does not exist, backup is skipped (not an error).
func BackupFile(tool, path string) error {
	if !fileExists(path) {
		return nil
	}
	if err := os.MkdirAll(config.BackupDir(), 0700); err != nil {
		return err
	}
	stamp := time.Now().Format("20060102-150405")
	backupName := fmt.Sprintf("%s.%s", tool, stamp)
	backupDest := filepath.Join(config.BackupDir(), backupName)

	if err := copyFile(path, backupDest); err != nil {
		return fmt.Errorf("backup %s: %w", path, err)
	}

	entries := loadManifest()
	entries = append(entries, manifestEntry{
		OriginalPath: path,
		BackupFile:   backupName,
		Tool:         tool,
		BackedUpAt:   stamp,
	})
	return saveManifest(entries)
}

// RestoreBackups restores each backed-up file to its original path. For each
// original path, only the most recent backup is used (last entry in manifest
// wins — entries are appended chronologically).
func RestoreBackups() error {
	entries := loadManifest()
	if len(entries) == 0 {
		return nil
	}

	// Build map: original path → most recent backup entry (last wins).
	latest := make(map[string]manifestEntry)
	for _, e := range entries {
		latest[e.OriginalPath] = e
	}

	var firstErr error
	for origPath, entry := range latest {
		src := filepath.Join(config.BackupDir(), entry.BackupFile)
		if !fileExists(src) {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(origPath), 0700); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if err := copyFile(src, origPath); err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("restore %s: %w", origPath, err)
			}
		}
	}

	// Remove the claude env snippet that configure wrote (not a backup of a
	// user file, just a generated snippet).
	_ = os.Remove(filepath.Join(config.ConfigDir(), "claude-env.sh"))

	return firstErr
}

// ConfigureCodex writes ~/.codex/config.toml pointed at the gateway.
func ConfigureCodex(gatewayURL, virtualKey string) error {
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".codex", "config.toml")
	if err := BackupFile("codex", configPath); err != nil {
		return err
	}
	content := fmt.Sprintf(`# Managed by UseJunction agent — restore with: usejunction unconfigure
model_provider = "openai"

[model_providers.openai]
name = "UseJunction Gateway"
base_url = "%s/v1"
wire_api = "responses"
env_key = "USEJUNCTION_VIRTUAL_KEY"

[usejunction]
gateway = "%s"
virtual_key = "%s"
`, gatewayURL, gatewayURL, virtualKey)
	if err := os.MkdirAll(filepath.Dir(configPath), 0700); err != nil {
		return err
	}
	return os.WriteFile(configPath, []byte(content), 0600)
}

// ConfigureClaude writes a shell env snippet for Claude Code.
// Claude Code uses ANTHROPIC_BASE_URL; users source the snippet or add it to
// their shell RC. The original Claude settings file is not mutated.
func ConfigureClaude(gatewayURL, virtualKey string) error {
	snippetPath := filepath.Join(config.ConfigDir(), "claude-env.sh")
	content := fmt.Sprintf(`# Source this file to route Claude Code through the UseJunction gateway.
# Add to ~/.zshrc or ~/.bashrc:  source %s
export ANTHROPIC_BASE_URL="%s"
export ANTHROPIC_API_KEY="%s"
`, snippetPath, gatewayURL, virtualKey)
	return os.WriteFile(snippetPath, []byte(content), 0600)
}

// ConfigureContinue rewrites ~/.continue/config.json with the gateway as the
// default model provider. The original is backed up first.
func ConfigureContinue(gatewayURL, virtualKey string) error {
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".continue", "config.json")
	if err := BackupFile("continue", configPath); err != nil {
		return err
	}
	content := fmt.Sprintf(`{
  "_comment": "Managed by UseJunction agent — restore with: usejunction unconfigure",
  "models": [
    {
      "title": "UseJunction Gateway",
      "provider": "openai",
      "model": "gpt-4o-mini",
      "apiBase": "%s/v1",
      "apiKey": "%s"
    }
  ]
}
`, gatewayURL, virtualKey)
	if err := os.MkdirAll(filepath.Dir(configPath), 0700); err != nil {
		return err
	}
	return os.WriteFile(configPath, []byte(content), 0644)
}

// UnconfigureAll restores all backed-up tool configs.
func UnconfigureAll() error {
	return RestoreBackups()
}

// --- helpers ----------------------------------------------------------------

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0700); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
