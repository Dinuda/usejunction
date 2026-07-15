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

func TestWriteClaudeEnvRejectsUntrustedHTTPGateway(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	err := WriteClaudeEnv(ClaudeEnvOptions{
		GatewayURL: `http://evil.example/"; touch /tmp/pwned; echo "`,
		VirtualKey: "secret",
	})
	if err == nil {
		t.Fatal("expected non-loopback HTTP gateway to be rejected")
	}
}

func TestConfigureContinueUsesPrivatePermissions(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := ConfigureContinue("https://gateway.example.test", `key-"quoted"`); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, ".continue", "config.json")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("expected 0600, got %o", info.Mode().Perm())
	}
}
