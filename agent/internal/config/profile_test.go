package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestConfigDirRespectsUSEJUNCTION_HOME(t *testing.T) {
	ResetRuntimeForTest()
	t.Setenv(homeEnv, "")
	t.Setenv(profileEnv, "")
	dir := t.TempDir()
	t.Setenv(homeEnv, dir)
	t.Cleanup(ResetRuntimeForTest)
	got := ConfigDir()
	if got != dir {
		t.Fatalf("ConfigDir() = %q, want %q", got, dir)
	}
}

func TestDefaultLocalSyncPortForTestProfile(t *testing.T) {
	ResetRuntimeForTest()
	t.Setenv(homeEnv, "")
	t.Setenv(profileEnv, "test")
	t.Cleanup(ResetRuntimeForTest)

	if got := DefaultLocalSyncPortForProfile(); got != DefaultLocalSyncPortTest {
		t.Fatalf("DefaultLocalSyncPortForProfile() = %d, want %d", got, DefaultLocalSyncPortTest)
	}
}

func TestApplyRuntimeProfileTest(t *testing.T) {
	ResetRuntimeForTest()
	t.Setenv(homeEnv, "")
	t.Setenv(profileEnv, "")
	t.Cleanup(ResetRuntimeForTest)

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
