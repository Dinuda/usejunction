package configure

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/config"
)

func BackupFile(path string) error {
	if !fileExists(path) {
		return nil
	}
	backupDir := config.BackupDir()
	_ = os.MkdirAll(backupDir, 0700)
	base := strings.ReplaceAll(path, "/", "_")
	dest := filepath.Join(backupDir, base+"."+time.Now().Format("20060102-150405"))
	return copyFile(path, dest)
}

func RestoreBackups() error {
	backupDir := config.BackupDir()
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		// Restore most recent backup per original path prefix
		_ = e
	}
	return nil
}

func ConfigureCodex(gatewayURL, virtualKey string) error {
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".codex", "config.toml")
	if err := BackupFile(configPath); err != nil {
		return err
	}
	content := fmt.Sprintf(`# UseJunction managed config
model_provider = "openai"
[model_providers.openai]
name = "UseJunction Gateway"
base_url = "%s/v1"
wire_api = "responses"
env_key = "USEJUNCTION_VIRTUAL_KEY"

# Metadata headers injected by agent
[usejunction]
gateway = "%s"
virtual_key = "%s"
`, gatewayURL, gatewayURL, virtualKey)
	_ = os.MkdirAll(filepath.Dir(configPath), 0700)
	return os.WriteFile(configPath, []byte(content), 0600)
}

func ConfigureClaude(gatewayURL, virtualKey string) error {
	// Claude Code uses ANTHROPIC_BASE_URL env — write shell snippet
	snippetPath := filepath.Join(config.ConfigDir(), "claude-env.sh")
	content := fmt.Sprintf(`export ANTHROPIC_BASE_URL="%s"
export ANTHROPIC_API_KEY="%s"
`, gatewayURL, virtualKey)
	return os.WriteFile(snippetPath, []byte(content), 0600)
}

func ConfigureContinue(gatewayURL, virtualKey string) error {
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".continue", "config.json")
	if err := BackupFile(configPath); err != nil {
		return err
	}
	content := fmt.Sprintf(`{
  "models": [{
    "title": "UseJunction Gateway",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiBase": "%s/v1",
    "apiKey": "%s"
  }]
}`, gatewayURL, virtualKey)
	_ = os.MkdirAll(filepath.Dir(configPath), 0700)
	return os.WriteFile(configPath, []byte(content), 0644)
}

func UnconfigureAll() error {
	backupDir := config.BackupDir()
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		return nil
	}
	restored := map[string]bool{}
	for i := len(entries) - 1; i >= 0; i-- {
		name := entries[i].Name()
		parts := strings.SplitN(name, ".", 2)
		if len(parts) < 2 || restored[parts[0]] {
			continue
		}
		orig := strings.ReplaceAll(parts[0], "_", "/")
		if strings.HasPrefix(orig, "_") {
			orig = "/" + orig[1:]
		}
		_ = copyFile(filepath.Join(backupDir, name), orig)
		restored[parts[0]] = true
	}
	claudeSnippet := filepath.Join(config.ConfigDir(), "claude-env.sh")
	_ = os.Remove(claudeSnippet)
	return nil
}

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
	_ = os.MkdirAll(filepath.Dir(dst), 0700)
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
