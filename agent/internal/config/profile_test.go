package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigDirRespectsUSEJUNCTION_HOME(t *testing.T) {
	t.Setenv(homeEnv, "")
	t.Setenv(profileEnv, "")
	configuredHome = ""

	dir := t.TempDir()
	t.Setenv(homeEnv, dir)
	got := ConfigDir()
	if got != dir {
		t.Fatalf("ConfigDir() = %q, want %q", got, dir)
	}
}

func TestDefaultLocalSyncPortForTestProfile(t *testing.T) {
	t.Setenv(homeEnv, "")
	t.Setenv(profileEnv, "test")
	configuredHome = ""

	if got := DefaultLocalSyncPortForProfile(); got != DefaultLocalSyncPortTest {
		t.Fatalf("DefaultLocalSyncPortForProfile() = %d, want %d", got, DefaultLocalSyncPortTest)
	}
}

func TestApplyRuntimeProfileTest(t *testing.T) {
	t.Setenv(homeEnv, "")
	t.Setenv(profileEnv, "")
	configuredHome = ""

	if err := ApplyRuntimeProfile("", "test"); err != nil {
		t.Fatal(err)
	}
	home, _ := os.UserHomeDir()
	want := filepath.Join(home, TestHomeDirName)
	if ConfigDir() != want {
		t.Fatalf("ConfigDir() = %q, want %q", ConfigDir(), want)
	}
}

func TestServiceIdentityForTestProfile(t *testing.T) {
	id := identityForHome("/Users/dev/.usejunction-test")
	if id.LaunchdLabel != "com.usejunction.agent.test" {
		t.Fatalf("LaunchdLabel = %q", id.LaunchdLabel)
	}
	if id.CLIName != "usejunction-test" {
		t.Fatalf("CLIName = %q", id.CLIName)
	}
}
