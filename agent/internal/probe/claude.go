package probe

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/types"
)

const claudeUsageURL = "https://api.anthropic.com/api/oauth/usage"

type claudeCredentials struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	Email            string `json:"email"`
	AccountUUID      string `json:"account_uuid"`
	SubscriptionType string `json:"subscription_type"`
	RateLimitTier    string `json:"rate_limit_tiers"`
	ExpiresAtMs      int64  `json:"expires_at_ms"`
}

type claudeUsageWindow struct {
	Utilization float64 `json:"utilization"`
	ResetsAt    string  `json:"resets_at"`
}

type claudeKeychainOAuth struct {
	AccessToken      string   `json:"accessToken"`
	RefreshToken     string   `json:"refreshToken"`
	ExpiresAt        int64    `json:"expiresAt"`
	Scopes           []string `json:"scopes"`
	SubscriptionType string   `json:"subscriptionType"`
	RateLimitTier    string   `json:"rateLimitTier"`
}

type claudeKeychainBlob struct {
	ClaudeAiOauth *claudeKeychainOAuth `json:"claudeAiOauth"`
}

func LoadClaudeCredentials(dir string) (*claudeCredentials, error) {
	if creds, err := loadClaudeCredentialsFile(dir); err == nil {
		return creds, nil
	}
	if runtime.GOOS == "darwin" {
		if creds, err := loadClaudeCredentialsKeychain(); err == nil {
			return creds, nil
		}
	}
	return nil, fmt.Errorf("claude credentials not found")
}

func loadClaudeCredentialsFile(dir string) (*claudeCredentials, error) {
	path := filepath.Join(dir, ".credentials.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var creds claudeCredentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, err
	}
	if strings.TrimSpace(creds.AccessToken) == "" {
		return nil, fmt.Errorf("claude credentials missing access_token")
	}
	return &creds, nil
}

func loadClaudeCredentialsKeychain() (*claudeCredentials, error) {
	out, err := exec.Command("security", "find-generic-password", "-s", "Claude Code-credentials", "-w").Output()
	if err != nil {
		return nil, err
	}
	raw := strings.TrimSpace(string(out))
	return claudeCredentialsFromKeychainJSON(raw)
}

func claudeCredentialsFromKeychainJSON(raw string) (*claudeCredentials, error) {
	var blob claudeKeychainBlob
	if err := json.Unmarshal([]byte(raw), &blob); err != nil {
		return nil, err
	}
	if blob.ClaudeAiOauth == nil || strings.TrimSpace(blob.ClaudeAiOauth.AccessToken) == "" {
		return nil, fmt.Errorf("claude keychain missing oauth token")
	}
	oauth := blob.ClaudeAiOauth
	return &claudeCredentials{
		AccessToken:      oauth.AccessToken,
		RefreshToken:     oauth.RefreshToken,
		SubscriptionType: oauth.SubscriptionType,
		RateLimitTier:    oauth.RateLimitTier,
		ExpiresAtMs:      oauth.ExpiresAt,
	}, nil
}

func claudeTokenExpired(creds *claudeCredentials, now time.Time) bool {
	if creds == nil || creds.ExpiresAtMs <= 0 {
		return false
	}
	return now.UnixMilli() >= creds.ExpiresAtMs
}

func claudeAccountFromCreds(creds *claudeCredentials, now time.Time) *types.ToolAccount {
	if creds == nil {
		return nil
	}
	account := &types.ToolAccount{
		ToolName:    "claude",
		Email:       strings.TrimSpace(creds.Email),
		LoginMethod: "oauth",
		AuthPresent: true,
	}
	// Stale/expired oauth still leaves subscriptionType in keychain — don't claim a paid plan.
	if claudeTokenExpired(creds, now) {
		account.AuthPresent = false
		return account
	}
	account.Plan = strings.TrimSpace(creds.SubscriptionType)
	return account
}

func ClaudeAccountFromCredentials(dir string) (*types.ToolAccount, error) {
	creds, err := LoadClaudeCredentials(dir)
	if err != nil {
		return nil, err
	}
	return claudeAccountFromCreds(creds, time.Now()), nil
}

func ProbeClaudeQuota(ctx context.Context, dir string) ([]types.QuotaSnapshot, *types.ToolAccount, error) {
	creds, err := LoadClaudeCredentials(dir)
	if err != nil {
		return nil, nil, err
	}

	account := claudeAccountFromCreds(creds, time.Now())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, claudeUsageURL, nil)
	if err != nil {
		return nil, account, err
	}
	req.Header.Set("Authorization", "Bearer "+creds.AccessToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("anthropic-beta", "oauth-2025-04-20")
	req.Header.Set("User-Agent", "claude-code/2.1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, account, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		// Auth failed — drop plan so auto-sync cannot invent a paid seat from stale keychain.
		if account != nil && (resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden) {
			account.Plan = ""
			account.AuthPresent = false
		}
		return nil, account, fmt.Errorf("claude oauth usage http %d", resp.StatusCode)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, account, err
	}

	return claudeUsageSnapshots(raw), account, nil
}

func claudeUsageSnapshots(raw map[string]json.RawMessage) []types.QuotaSnapshot {
	var snapshots []types.QuotaSnapshot

	appendWindow := func(windowType, key string) {
		msg, ok := raw[key]
		if !ok {
			return
		}
		var window claudeUsageWindow
		if json.Unmarshal(msg, &window) != nil {
			return
		}
		snapshots = append(snapshots, types.QuotaSnapshot{
			ToolName:    "claude",
			WindowType:  windowType,
			UsedPercent: floatPtr(window.Utilization),
			ResetAt:     strPtr(parseUnixOrRFC3339(window.ResetsAt).UTC().Format(time.RFC3339)),
			Source:      "oauth_api",
		})
	}

	appendWindow("session_5h", "five_hour")
	appendWindow("weekly", "seven_day")
	appendWindow("weekly_opus", "seven_day_opus")
	appendWindow("weekly_sonnet", "seven_day_sonnet")

	if extra, ok := raw["extra_usage"]; ok {
		var spend struct {
			MonthlyLimit float64 `json:"monthly_limit"`
			UsedCredits  float64 `json:"used_credits"`
		}
		if json.Unmarshal(extra, &spend) == nil && spend.MonthlyLimit > 0 {
			usedPct := (spend.UsedCredits / spend.MonthlyLimit) * 100
			snapshots = append(snapshots, types.QuotaSnapshot{
				ToolName:    "claude",
				WindowType:  "extra_usage",
				UsedPercent: floatPtr(usedPct),
				Source:      "oauth_api",
			})
		}
	}

	return snapshots
}
