package probe

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractAntigravityOAuthClientsPairsAdjacentLiterals(t *testing.T) {
	blob := []byte(`oauthClient.js"(){"use strict";B1e="1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",k1e="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",u7e="884354919052-36trc1jjb3tguiac32ov6cod268c5blh.apps.googleusercontent.com",c7e="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"`)
	got := extractAntigravityOAuthClients(blob)
	if len(got) != 2 {
		t.Fatalf("got %d clients: %#v", len(got), got)
	}
	if got[0].ClientID != "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com" {
		t.Fatalf("first id = %s", got[0].ClientID)
	}
	if got[0].ClientSecret != "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" {
		t.Fatalf("first secret = %s", got[0].ClientSecret)
	}
	if got[1].ClientID != "884354919052-36trc1jjb3tguiac32ov6cod268c5blh.apps.googleusercontent.com" {
		t.Fatalf("second id = %s", got[1].ClientID)
	}
	if got[1].ClientSecret != "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" {
		t.Fatalf("second secret = %s", got[1].ClientSecret)
	}
}

func TestResolveAntigravityOAuthClientPrefersEnvThenCacheThenScan(t *testing.T) {
	resetAntigravityOAuthClientCacheForTest()
	t.Cleanup(resetAntigravityOAuthClientCacheForTest)

	dir := t.TempDir()
	cachePath := filepath.Join(dir, "cache.json")
	antigravityOAuthClientCachePathOverride = cachePath
	t.Cleanup(func() { antigravityOAuthClientCachePathOverride = "" })

	// Empty scan roots so install discovery cannot interfere.
	antigravityOAuthClientScanRootsOverride = []string{filepath.Join(dir, "missing-app")}
	t.Cleanup(func() { antigravityOAuthClientScanRootsOverride = nil })

	t.Setenv(antigravityOAuthClientIDEnv, "env-client.apps.googleusercontent.com")
	t.Setenv(antigravityOAuthClientSecretEnv, "GOCSPX-envsecretvalue")
	got := resolveAntigravityOAuthClient()
	if got == nil || got.ClientID != "env-client.apps.googleusercontent.com" {
		t.Fatalf("env client = %#v", got)
	}

	t.Setenv(antigravityOAuthClientIDEnv, "")
	t.Setenv(antigravityOAuthClientSecretEnv, "")
	resetAntigravityOAuthClientCacheForTest()

	if err := saveAntigravityOAuthClientCache(&antigravityOAuthClient{
		ClientID:     "cached-client.apps.googleusercontent.com",
		ClientSecret: "GOCSPX-cachedsecret",
	}); err != nil {
		t.Fatal(err)
	}
	got = resolveAntigravityOAuthClient()
	if got == nil || got.ClientID != "cached-client.apps.googleusercontent.com" {
		t.Fatalf("cache client = %#v", got)
	}

	resetAntigravityOAuthClientCacheForTest()
	_ = os.Remove(cachePath)

	appRoot := filepath.Join(dir, "Antigravity IDE.app", "Contents", "Resources", "app", "out")
	if err := os.MkdirAll(appRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	mainJS := filepath.Join(appRoot, "main.js")
	payload := []byte(`B1e="111111111111-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com",k1e="GOCSPX-discoveredsecretxx"`)
	if err := os.WriteFile(mainJS, payload, 0o644); err != nil {
		t.Fatal(err)
	}
	antigravityOAuthClientScanRootsOverride = []string{filepath.Join(dir, "Antigravity IDE.app")}
	got = resolveAntigravityOAuthClient()
	if got == nil || got.ClientID != "111111111111-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com" {
		t.Fatalf("discovered client = %#v", got)
	}
	if got.ClientSecret != "GOCSPX-discoveredsecretxx" {
		t.Fatalf("discovered secret = %s", got.ClientSecret)
	}
	// Cache should now exist for next process.
	if cached := loadAntigravityOAuthClientCache(); cached == nil || cached.ClientID != got.ClientID {
		t.Fatalf("cache after discover = %#v", cached)
	}
}

func TestRefreshAntigravityAccessTokenRequiresClient(t *testing.T) {
	resetAntigravityOAuthClientCacheForTest()
	t.Cleanup(resetAntigravityOAuthClientCacheForTest)
	antigravityOAuthClientIDOverride = ""
	antigravityOAuthClientSecretOverride = ""
	antigravityOAuthClientCachePathOverride = filepath.Join(t.TempDir(), "missing.json")
	antigravityOAuthClientScanRootsOverride = []string{filepath.Join(t.TempDir(), "no-app")}
	t.Cleanup(func() {
		antigravityOAuthClientCachePathOverride = ""
		antigravityOAuthClientScanRootsOverride = nil
	})
	t.Setenv(antigravityOAuthClientIDEnv, "")
	t.Setenv(antigravityOAuthClientSecretEnv, "")

	_, err := refreshAntigravityAccessToken(t.Context(), "1//refresh")
	if err == nil {
		t.Fatal("expected error when no client is available")
	}
}
