package configure

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
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
	t.Setenv("HOME", t.TempDir())
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
	if info.Mode().Perm() != 0o600 {
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
