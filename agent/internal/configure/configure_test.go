package configure

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/usejunction/agent/internal/config"
)

func TestShellQuotePreventsCommandSubstitution(t *testing.T) {
	quoted := shellQuote(`https://example.test/$(touch /tmp/pwned)'value`)
	if !strings.HasPrefix(quoted, "'") || !strings.HasSuffix(quoted, "'") {
		t.Fatalf("value was not single quoted: %s", quoted)
	}
	if !strings.Contains(quoted, "'\"'\"'") {
		t.Fatalf("embedded single quote was not escaped: %s", quoted)
	}
}

func TestWriteClaudeOtelEnvRejectsUntrustedHTTP(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	err := WriteClaudeOtelEnv(ClaudeOtelOptions{
		MetricsEndpoint: `http://evil.example/"; touch /tmp/pwned; echo "`,
		DeviceToken:     "secret",
	})
	if err == nil {
		t.Fatal("expected non-loopback HTTP endpoint to be rejected")
	}
}

func TestWriteClaudeOtelEnvUsesPrivatePermissions(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	if err := WriteClaudeOtelEnv(ClaudeOtelOptions{
		MetricsEndpoint: "https://control.example.test/api/otel/v1/metrics",
		DeviceToken:     `token-"quoted"`,
	}); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, ".usejunction", "claude-env.sh")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	// Windows does not honor POSIX file modes; Stat typically reports 0666.
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
		t.Fatalf("expected 0600, got %o", info.Mode().Perm())
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	body := string(data)
	if strings.Contains(body, "ANTHROPIC_BASE_URL") || strings.Contains(body, "ANTHROPIC_API_KEY") {
		t.Fatalf("claude otel env must not rewrite Anthropic routing: %s", body)
	}
}

func TestWriteClaudePowerShellEnvQuotesValues(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	if err := writeClaudePowerShellEnv(ClaudeOtelOptions{
		MetricsEndpoint: "https://example.com/o'tel",
		DeviceToken:     "device'token",
	}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(home, ".usejunction", "claude-env.ps1"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	if !strings.Contains(text, "o''tel") || !strings.Contains(text, "device''token") {
		t.Fatalf("PowerShell snippet did not escape single quotes: %s", text)
	}
}

func TestRepairLegacyCodexGatewayConfigRestoresBackup(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))

	codexDir := filepath.Join(home, ".codex")
	if err := os.MkdirAll(codexDir, 0o700); err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(codexDir, "config.toml")
	gatewayConfig := `# Managed by UseJunction agent — restore with: usejunction unconfigure
model_provider = "openai"

[model_providers.openai]
name = "UseJunction Gateway"
base_url = "/v1"
env_key = "USEJUNCTION_VIRTUAL_KEY"
`
	original := "model = \"gpt-test\"\npersonality = \"pragmatic\"\n"
	if err := os.WriteFile(configPath, []byte(gatewayConfig), 0o600); err != nil {
		t.Fatal(err)
	}

	backupDir := filepath.Join(home, ".usejunction", "backups")
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		t.Fatal(err)
	}
	backupName := "codex.test-backup"
	if err := os.WriteFile(filepath.Join(backupDir, backupName), []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}
	manifest := []manifestEntry{{
		OriginalPath: configPath,
		BackupFile:   backupName,
		Tool:         "codex",
		BackedUpAt:   "test",
	}}
	raw, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(backupDir, "manifest.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := RepairLegacyCodexGatewayConfig(); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != original {
		t.Fatalf("expected restored config:\n%s\ngot:\n%s", original, got)
	}
}

func TestRunSetupNeverTouchesCodexConfigToml(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("CODEX_HOME", filepath.Join(home, ".codex"))

	codexDir := filepath.Join(home, ".codex")
	if err := os.MkdirAll(codexDir, 0o700); err != nil {
		t.Fatal(err)
	}
	codexConfig := filepath.Join(codexDir, "config.toml")
	original := "model = \"gpt-test\"\npersonality = \"pragmatic\"\n"
	if err := os.WriteFile(codexConfig, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}

	cfg := &config.Config{
		ControlPlaneURL: "http://127.0.0.1:3001",
		DeviceToken:     "uj_dev_test_token",
		DeviceID:        "device-1",
		OrgID:           "org-1",
		GatewayURL:      "http://localhost:4000",
	}
	if err := RunSetup(cfg, SetupOptions{EnableOtel: true}); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(codexConfig)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != original {
		t.Fatalf("RunSetup must never modify ~/.codex/config.toml\nbefore:\n%s\nafter:\n%s", original, data)
	}
	if cfg.GatewayURL != "" {
		t.Fatalf("RunSetup must clear legacy gatewayUrl, got %q", cfg.GatewayURL)
	}
	envPath := filepath.Join(home, ".usejunction", "claude-env.sh")
	envBody, err := os.ReadFile(envPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(envBody), "ANTHROPIC_BASE_URL") || strings.Contains(string(envBody), "localhost:4000") {
		t.Fatalf("setup must not route tools through a gateway: %s", envBody)
	}
}
