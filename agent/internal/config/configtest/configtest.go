package configtest

import (
	"path/filepath"
	"testing"

	"github.com/usejunction/agent/internal/config"
)

// WithIsolatedHome pins agent data to a temp USEJUNCTION_HOME for the test.
// Use this instead of setting HOME — ConfigDir/CacheDir ignore HOME on all platforms.
func WithIsolatedHome(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	config.ResetRuntimeForTest()
	t.Setenv("USEJUNCTION_HOME", dir)
	t.Setenv("USEJUNCTION_PROFILE", "")
	t.Cleanup(config.ResetRuntimeForTest)
	return dir
}

// CacheDir returns config.CacheDir() after isolating home (panics if not called from a test).
func CacheDir(t *testing.T) string {
	t.Helper()
	return config.CacheDir()
}

// CacheFile returns config.CacheDir()/name and asserts the standard cost-usage layout.
func CacheFile(t *testing.T, name string) string {
	t.Helper()
	got := filepath.Join(config.CacheDir(), name)
	assertPathEndsWith(t, got, filepath.Join("cache", "cost-usage", name))
	return got
}

// AssertPathEndsWith checks a path suffix using forward slashes (Windows-safe).
func AssertPathEndsWith(t *testing.T, path, suffix string) {
	t.Helper()
	assertPathEndsWith(t, path, suffix)
}

func assertPathEndsWith(t *testing.T, path, suffix string) {
	t.Helper()
	norm := filepath.ToSlash(path)
	want := filepath.ToSlash(suffix)
	if len(norm) < len(want) || norm[len(norm)-len(want):] != want {
		t.Fatalf("path %q does not end with %q", path, suffix)
	}
}
