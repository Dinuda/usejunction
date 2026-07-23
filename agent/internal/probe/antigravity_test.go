package probe

import (
	"context"
	"database/sql"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func writeAntigravityStateFixture(t *testing.T, userStatus, credits, trajectories string) string {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "state.vscdb")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)`); err != nil {
		t.Fatal(err)
	}
	rows := [][2]string{
		{antigravityUserStatusKey, userStatus},
		{antigravityModelCreditsKey, credits},
		{antigravityOAuthTokenKey, base64.StdEncoding.EncodeToString([]byte("oauthTokenInfoSentinelKey-not-a-real-token"))},
		{antigravityTrajectoryKey, trajectories},
	}
	for _, row := range rows {
		if _, err := db.Exec(`INSERT INTO ItemTable (key, value) VALUES (?, ?)`, row[0], row[1]); err != nil {
			t.Fatal(err)
		}
	}
	return dbPath
}

func TestAntigravityAccountAndQuotaFromFixture(t *testing.T) {
	inner := []byte("Alice Example\x00dev@example.com\x00g1-pro-tier\x00Google AI Pro")
	userStatus := base64.StdEncoding.EncodeToString(append([]byte("userStatusSentinelKey\x00"), []byte(base64.StdEncoding.EncodeToString(inner))...))
	creditsInner := []byte("availableCreditsSentinelKey\x001250")
	credits := base64.StdEncoding.EncodeToString(creditsInner)
	trajInner := []byte("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\x00Fix login redirect\x00file:///Users/dev/work/demo-app\x00https://github.com/acme/demo-app.git")
	traj := base64.StdEncoding.EncodeToString(trajInner)

	dbPath := writeAntigravityStateFixture(t, userStatus, credits, traj)
	prev := antigravityStateDBPathOverride
	antigravityStateDBPathOverride = dbPath
	defer func() { antigravityStateDBPathOverride = prev }()

	account, err := AntigravityAccountFromLocal()
	if err != nil {
		t.Fatal(err)
	}
	if account == nil || !account.AuthPresent {
		t.Fatalf("account = %#v", account)
	}
	if account.Email != "dev@example.com" {
		t.Fatalf("email = %q", account.Email)
	}
	if account.Plan != "google-ai-pro" {
		t.Fatalf("plan = %q", account.Plan)
	}

	quotas, _, err := ProbeAntigravityQuota(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(quotas) == 0 || quotas[0].CreditsRemaining == nil || *quotas[0].CreditsRemaining != 1250 {
		t.Fatalf("quotas = %#v", quotas)
	}

	summaries, err := AntigravityTrajectorySummaries()
	if err != nil {
		t.Fatal(err)
	}
	if len(summaries) == 0 {
		t.Fatal("expected trajectory summaries")
	}
	found := false
	for _, s := range summaries {
		if s.LocalID == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" {
			found = true
			if s.Title != "Fix login redirect" {
				t.Fatalf("title = %q", s.Title)
			}
			if s.Workspace != "demo-app" {
				t.Fatalf("workspace = %q", s.Workspace)
			}
			if s.RepoOwner != "acme" || s.RepoName != "demo-app" {
				t.Fatalf("repo = %s/%s", s.RepoOwner, s.RepoName)
			}
		}
	}
	if !found {
		t.Fatalf("summaries = %#v", summaries)
	}
}

func TestParseAntigravityModelCreditsSentinel(t *testing.T) {
	// Real IDE shape: outer b64 → sentinel entries with nested b64 varint payloads.
	inner := []byte("\n%\n\x1bavailableCreditsSentinelKey\x12\x06\n\x04EOgH\n(\n\x1eminimumCreditAmountForUsageKey\x12\x06\n\x04EDI=\n!\n\x17useAICreditsSentinelKey\x12\x06\n\x04CAE=")
	raw := base64.StdEncoding.EncodeToString(inner)
	got := parseAntigravityModelCredits(raw)
	if got == nil || *got != 1000 {
		t.Fatalf("credits = %#v, want 1000", got)
	}
}

func TestNormalizeAntigravityPlan(t *testing.T) {
	cases := map[string]string{
		"g1-pro-tier":     "google-ai-pro",
		"Google AI Pro":   "google-ai-pro",
		"g1-ultra":        "google-ai-ultra",
		"Google AI Ultra": "google-ai-ultra",
		"g1-plus-tier":    "google-ai-plus",
		"individual":      "individual",
		"organization":    "organization",
	}
	for in, want := range cases {
		if got := normalizeAntigravityPlan(in); got != want {
			t.Fatalf("%q => %q, want %q", in, got, want)
		}
	}
}

func TestAntigravityAccountMissingDB(t *testing.T) {
	prev := antigravityStateDBPathOverride
	antigravityStateDBPathOverride = filepath.Join(t.TempDir(), "missing.vscdb")
	defer func() { antigravityStateDBPathOverride = prev }()

	account, err := AntigravityAccountFromLocal()
	if err != nil {
		t.Fatal(err)
	}
	if account.AuthPresent {
		t.Fatalf("expected no auth, got %#v", account)
	}
	_ = os.ErrNotExist
}
