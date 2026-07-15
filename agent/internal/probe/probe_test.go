package probe

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCodexPlanFromClaims(t *testing.T) {
	claims := map[string]any{
		"https://api.openai.com/auth": map[string]any{
			"chatgpt_plan_type": "plus",
		},
	}
	if got := codexPlanFromClaims(claims); got != "plus" {
		t.Fatalf("plan = %q", got)
	}
}

func TestLoadCodexAuthNestedTokens(t *testing.T) {
	dir := t.TempDir()
	idPayload := base64.RawStdEncoding.EncodeToString([]byte(`{"email":"dev@example.com"}`))
	authDoc := map[string]any{
		"auth_mode":    "chatgpt",
		"last_refresh": "2026-07-07T11:53:16Z",
		"tokens": map[string]any{
			"access_token":  "access-token",
			"refresh_token": "refresh-token",
			"id_token":      "aaa." + idPayload + ".bbb",
			"account_id":    "acct-1",
		},
	}
	authJSON, err := json.Marshal(authDoc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "auth.json"), authJSON, 0600); err != nil {
		t.Fatal(err)
	}
	auth, err := LoadCodexAuth(dir)
	if err != nil {
		t.Fatalf("LoadCodexAuth: %v", err)
	}
	if auth.AccessToken != "access-token" {
		t.Fatalf("access token = %q", auth.AccessToken)
	}
	if !auth.nestedTokens {
		t.Fatal("expected nested token format")
	}
	account, err := CodexAccountFromAuth(dir)
	if err != nil {
		t.Fatalf("CodexAccountFromAuth: %v", err)
	}
	if account.Email != "dev@example.com" {
		t.Fatalf("email = %q", account.Email)
	}
}

func TestParseCodexUsageResponse(t *testing.T) {
	raw := `{
	  "plan_type": "pro",
	  "rate_limit": {
	    "primary_window": {"used_percent": 42.5, "reset_at": 1784526148},
	    "secondary_window": {"used_percent": 10, "reset_at": "2026-07-20T00:00:00Z"}
	  },
	  "credits": {"has_credits": true, "balance": 12.5}
	}`
	var usage codexUsageResponse
	if err := json.Unmarshal([]byte(raw), &usage); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if usage.PlanType != "pro" {
		t.Fatalf("plan_type = %q", usage.PlanType)
	}
	if usage.RateLimit.PrimaryWindow.UsedPercent != 42.5 {
		t.Fatalf("primary used = %v", usage.RateLimit.PrimaryWindow.UsedPercent)
	}
}

func TestParseClaudeUsageResponse(t *testing.T) {
	raw := `{
	  "five_hour": {"utilization": 55, "resets_at": "2026-07-14T18:00:00Z"},
	  "seven_day": {"utilization": 20, "resets_at": "2026-07-20T00:00:00Z"}
	}`
	var windows map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &windows); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	var session claudeUsageWindow
	if err := json.Unmarshal(windows["five_hour"], &session); err != nil {
		t.Fatalf("session: %v", err)
	}
	if session.Utilization != 55 {
		t.Fatalf("utilization = %v", session.Utilization)
	}
}

func TestParseCursorUsageSummary(t *testing.T) {
	raw := `{
	  "billingCycleEnd": "2026-07-31T00:00:00Z",
	  "membershipType": "pro_plus",
	  "individualUsage": {
	    "plan": {"totalPercentUsed": 33.3, "autoPercentUsed": 12, "apiPercentUsed": 8, "used": 1000, "limit": 3000},
	    "onDemand": {"used": 2500, "remaining": 7500}
	  }
	}`
	var summary cursorUsageSummary
	if err := json.Unmarshal([]byte(raw), &summary); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if summary.MembershipType != "pro_plus" {
		t.Fatalf("membershipType = %q", summary.MembershipType)
	}
	if summary.IndividualUsage == nil || summary.IndividualUsage.Plan == nil {
		t.Fatal("missing plan usage")
	}
	if summary.IndividualUsage.Plan.TotalPercentUsed != 33.3 {
		t.Fatalf("totalPercentUsed = %v", summary.IndividualUsage.Plan.TotalPercentUsed)
	}
}

func TestResolveCursorPlanPrefersLocalMembership(t *testing.T) {
	got := firstNonEmpty("pro_plus", "hobby")
	if got != "pro_plus" {
		t.Fatalf("firstNonEmpty = %q", got)
	}
}

func TestJWTPayloadEmail(t *testing.T) {
	// eyJ... is {"email":"dev@example.com","sub":"user-1"}
	token := "aaa." + "eyJlbWFpbCI6ImRldkBleGFtcGxlLmNvbSIsInN1YiI6InVzZXItMSJ9" + ".bbb"
	claims := jwtPayload(token)
	if got := claimString(claims, "email"); got != "dev@example.com" {
		t.Fatalf("email = %q", got)
	}
}
