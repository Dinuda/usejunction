package configtest

import (
	"path/filepath"
	"testing"

	"github.com/usejunction/agent/internal/config"
)

func TestWithIsolatedHomePinsConfigDir(t *testing.T) {
	home := WithIsolatedHome(t)
	if got := config.ConfigDir(); got != home {
		t.Fatalf("ConfigDir() = %q, want %q", got, home)
	}
}

func TestConfigDirIgnoresHOMEEnv(t *testing.T) {
	home := WithIsolatedHome(t)
	t.Setenv("HOME", t.TempDir())
	if got := config.ConfigDir(); got != home {
		t.Fatalf("ConfigDir() = %q, want %q (HOME must not override agent paths)", got, home)
	}
}

func TestCacheDirUnderIsolatedHome(t *testing.T) {
	home := WithIsolatedHome(t)
	got := config.CacheDir()
	want := filepath.Join(home, "cache", "cost-usage")
	if got != want {
		t.Fatalf("CacheDir() = %q, want %q", got, want)
	}
}

func TestCacheFileLayout(t *testing.T) {
	WithIsolatedHome(t)
	for _, name := range []string{
		"cursor-usage-events.json",
		"cursor-local.json",
		"codex.json",
		"scan-snapshot.json",
		"opencode-local.json",
	} {
		name := name
		t.Run(name, func(t *testing.T) {
			path := CacheFile(t, name)
			if filepath.Base(path) != name {
				t.Fatalf("basename = %q", filepath.Base(path))
			}
		})
	}
}
