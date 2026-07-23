package probe

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func encodeAntigravityOAuthFixture(access, refresh string) string {
	// Mimic IDE shape: outer b64 → sentinel envelope → nested b64 protobuf with tokens.
	innerProto := []byte{}
	innerProto = append(innerProto, 0x0a) // field 1 length-delimited
	innerProto = append(innerProto, byte(len(access)))
	innerProto = append(innerProto, access...)
	innerProto = append(innerProto, 0x12) // field 2 "Bearer"
	innerProto = append(innerProto, 6)
	innerProto = append(innerProto, []byte("Bearer")...)
	innerProto = append(innerProto, 0x1a) // field 3 refresh
	innerProto = append(innerProto, byte(len(refresh)))
	innerProto = append(innerProto, refresh...)

	innerB64 := base64.StdEncoding.EncodeToString(innerProto)
	envelope := []byte("oauthTokenInfoSentinelKey")
	envelope = append(envelope, 0x12) // field 2
	envelope = append(envelope, byte(len(innerB64)+2))
	envelope = append(envelope, 0x0a) // nested field 1
	envelope = append(envelope, byte(len(innerB64)))
	envelope = append(envelope, innerB64...)
	return base64.StdEncoding.EncodeToString(envelope)
}

func TestParseAntigravityOAuthTokens(t *testing.T) {
	raw := encodeAntigravityOAuthFixture(
		"ya29.a0ATestAccessTokenValueForUnitTestsOnly1234567890",
		"1//0gTestRefreshTokenValueForUnitTestsOnly",
	)
	got := parseAntigravityOAuthTokens(raw)
	if got == nil {
		t.Fatal("expected tokens")
	}
	if !strings.HasPrefix(got.AccessToken, "ya29.") {
		t.Fatalf("access = %q", got.AccessToken)
	}
	if !strings.HasPrefix(got.RefreshToken, "1//") {
		t.Fatalf("refresh = %q", got.RefreshToken)
	}
}

func TestAntigravityModelQuotaSnapshotsGroupsFamilies(t *testing.T) {
	now := time.Date(2026, 7, 22, 20, 0, 0, 0, time.UTC)
	remainingClaude := 0.55
	remainingGemini := 1.0
	models := map[string]antigravityModelInfo{
		"claude-sonnet-4-6": {
			QuotaInfo: &antigravityQuotaInfo{
				RemainingFraction: &remainingClaude,
				ResetTime:         "2026-07-22T23:00:00Z",
			},
		},
		"claude-opus-4-6-thinking": {
			QuotaInfo: &antigravityQuotaInfo{
				RemainingFraction: &remainingClaude,
				ResetTime:         "2026-07-22T23:00:00Z",
			},
		},
		"gemini-3-flash": {
			QuotaInfo: &antigravityQuotaInfo{
				RemainingFraction: &remainingGemini,
				ResetTime:         "2026-07-23T01:00:00Z",
			},
		},
		"tab_flash_lite_preview": {
			QuotaInfo: &antigravityQuotaInfo{
				RemainingFraction: &remainingGemini,
				// No reset → ignored inventory row.
			},
		},
	}

	snaps := antigravityModelQuotaSnapshots(models, now)
	if len(snaps) != 2 {
		t.Fatalf("snaps = %#v", snaps)
	}
	byType := map[string]struct {
		used  float64
		reset string
	}{}
	for _, s := range snaps {
		used := 0.0
		if s.UsedPercent != nil {
			used = *s.UsedPercent
		}
		reset := ""
		if s.ResetAt != nil {
			reset = *s.ResetAt
		}
		byType[s.WindowType] = struct {
			used  float64
			reset string
		}{used: used, reset: reset}
	}
	claude, ok := byType["claude_5h"]
	if !ok {
		t.Fatalf("missing claude_5h in %#v", byType)
	}
	if claude.used < 44.9 || claude.used > 45.1 {
		t.Fatalf("claude used = %v", claude.used)
	}
	if claude.reset != "2026-07-22T23:00:00Z" {
		t.Fatalf("claude reset = %q", claude.reset)
	}
	gemini, ok := byType["gemini_5h"]
	if !ok {
		t.Fatalf("missing gemini_5h in %#v", byType)
	}
	if gemini.used != 0 {
		t.Fatalf("gemini used = %v", gemini.used)
	}
}

func TestProbeAntigravityCloudCodeQuota(t *testing.T) {
	var loadCalls, modelCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/token":
			_ = r.ParseForm()
			if r.Form.Get("refresh_token") == "" {
				http.Error(w, "missing refresh", 400)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "ya29.refreshed"})
		case strings.HasSuffix(r.URL.Path, ":loadCodeAssist"):
			loadCalls++
			auth := r.Header.Get("Authorization")
			if auth != "Bearer ya29.live" && auth != "Bearer ya29.refreshed" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"cloudaicompanionProject": "demo-project",
			})
		case strings.HasSuffix(r.URL.Path, ":fetchAvailableModels"):
			modelCalls++
			remaining := 0.8
			_ = json.NewEncoder(w).Encode(map[string]any{
				"models": map[string]any{
					"claude-sonnet-4-6": map[string]any{
						"quotaInfo": map[string]any{
							"remainingFraction": remaining,
							"resetTime":         time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339),
						},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	prevCloud := antigravityCloudCodeURLOverride
	prevToken := antigravityOAuthTokenURLOverride
	antigravityCloudCodeURLOverride = srv.URL
	antigravityOAuthTokenURLOverride = srv.URL + "/token"
	defer func() {
		antigravityCloudCodeURLOverride = prevCloud
		antigravityOAuthTokenURLOverride = prevToken
	}()

	oauth := encodeAntigravityOAuthFixture("ya29.live", "1//0gRefresh")
	creditsInner := []byte("availableCreditsSentinelKey\x001250")
	credits := base64.StdEncoding.EncodeToString(creditsInner)
	userStatus := base64.StdEncoding.EncodeToString([]byte("userStatusSentinelKey\x00dev@example.com\x00g1-pro-tier"))
	dbPath := writeAntigravityStateFixture(t, userStatus, credits, "")
	restore := SetAntigravityStateDBPathForTest(dbPath)
	defer restore()

	if err := overwriteAntigravityStateValue(dbPath, antigravityOAuthTokenKey, oauth); err != nil {
		t.Fatal(err)
	}

	snaps, account, err := ProbeAntigravityQuota(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if account == nil || !account.AuthPresent {
		t.Fatalf("account = %#v", account)
	}
	if loadCalls < 1 || modelCalls < 1 {
		t.Fatalf("load=%d models=%d", loadCalls, modelCalls)
	}

	var hasClaude, hasCredits bool
	for _, s := range snaps {
		if strings.HasPrefix(s.WindowType, "claude_") && s.UsedPercent != nil {
			hasClaude = true
			if *s.UsedPercent < 19.9 || *s.UsedPercent > 20.1 {
				t.Fatalf("used = %v", *s.UsedPercent)
			}
		}
		if s.WindowType == "credits" && s.CreditsRemaining != nil {
			hasCredits = true
		}
	}
	if !hasClaude || !hasCredits {
		t.Fatalf("snaps = %#v", snaps)
	}
}

func overwriteAntigravityStateValue(dbPath, key, value string) error {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	_, err = db.Exec(`INSERT INTO ItemTable (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}
