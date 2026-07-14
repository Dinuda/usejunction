package probe

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/types"
)

const (
	codexOAuthClientID = "app_EMoamEEZ73f0CkXaXp7hrann"
	codexUsageURL      = "https://chatgpt.com/backend-api/wham/usage"
	codexTokenURL      = "https://auth.openai.com/oauth/token"
)

type codexAuthTokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
	AccountID    string `json:"account_id"`
}

type codexAuthFile struct {
	AccessToken  string           `json:"access_token"`
	RefreshToken string           `json:"refresh_token"`
	IDToken      string           `json:"id_token"`
	AccountID    string           `json:"account_id"`
	LastRefresh  string           `json:"last_refresh"`
	Email        string           `json:"email"`
	PlanType     string           `json:"plan_type"`
	Tokens       *codexAuthTokens `json:"tokens"`
	nestedTokens bool
}

func (auth *codexAuthFile) normalize() {
	if auth.Tokens == nil {
		return
	}
	auth.nestedTokens = true
	if auth.AccessToken == "" {
		auth.AccessToken = auth.Tokens.AccessToken
	}
	if auth.RefreshToken == "" {
		auth.RefreshToken = auth.Tokens.RefreshToken
	}
	if auth.IDToken == "" {
		auth.IDToken = auth.Tokens.IDToken
	}
	if auth.AccountID == "" {
		auth.AccountID = auth.Tokens.AccountID
	}
}

func codexPlanFromClaims(claims map[string]any) string {
	if plan := claimString(claims, "plan_type", "https://api.openai.com/plan_type"); plan != "" {
		return plan
	}
	if auth, ok := claims["https://api.openai.com/auth"].(map[string]any); ok {
		if plan := strings.TrimSpace(stringValue(auth["chatgpt_plan_type"])); plan != "" {
			return plan
		}
	}
	return ""
}

func LoadCodexAuth(home string) (*codexAuthFile, error) {
	path := filepath.Join(home, "auth.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var auth codexAuthFile
	if err := json.Unmarshal(data, &auth); err != nil {
		return nil, err
	}
	auth.normalize()
	if strings.TrimSpace(auth.AccessToken) == "" {
		return nil, fmt.Errorf("codex auth missing access_token")
	}
	return &auth, nil
}

func SaveCodexAuth(home string, auth *codexAuthFile) error {
	path := filepath.Join(home, "auth.json")
	if auth.nestedTokens {
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var doc map[string]any
		if err := json.Unmarshal(data, &doc); err != nil {
			return err
		}
		tokens, _ := doc["tokens"].(map[string]any)
		if tokens == nil {
			tokens = map[string]any{}
			doc["tokens"] = tokens
		}
		tokens["access_token"] = auth.AccessToken
		if auth.RefreshToken != "" {
			tokens["refresh_token"] = auth.RefreshToken
		}
		if auth.IDToken != "" {
			tokens["id_token"] = auth.IDToken
		}
		if auth.AccountID != "" {
			tokens["account_id"] = auth.AccountID
		}
		if auth.LastRefresh != "" {
			doc["last_refresh"] = auth.LastRefresh
		}
		out, err := json.MarshalIndent(doc, "", "  ")
		if err != nil {
			return err
		}
		return os.WriteFile(path, out, 0600)
	}
	data, err := json.MarshalIndent(auth, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

type codexUsageWindow struct {
	UsedPercent        float64 `json:"used_percent"`
	ResetAt            any     `json:"reset_at"`
	LimitWindowSeconds int     `json:"limit_window_seconds"`
}

func codexResetAtString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return fmt.Sprintf("%.0f", t)
	case json.Number:
		return t.String()
	default:
		return ""
	}
}

type codexUsageResponse struct {
	PlanType  string `json:"plan_type"`
	Email     string `json:"email"`
	RateLimit struct {
		PrimaryWindow   codexUsageWindow  `json:"primary_window"`
		SecondaryWindow *codexUsageWindow `json:"secondary_window"`
	} `json:"rate_limit"`
	Credits struct {
		HasCredits bool `json:"has_credits"`
		Balance    any  `json:"balance"`
	} `json:"credits"`
}

func codexCreditsBalance(v any) float64 {
	return numberValue(v)
}

func CodexAccountFromAuth(home string) (*types.ToolAccount, error) {
	auth, err := LoadCodexAuth(home)
	if err != nil {
		return nil, err
	}
	email := strings.TrimSpace(auth.Email)
	plan := strings.TrimSpace(auth.PlanType)
	if auth.IDToken != "" {
		claims := jwtPayload(auth.IDToken)
		if email == "" {
			email = claimString(claims, "email")
		}
		if plan == "" {
			plan = codexPlanFromClaims(claims)
		}
	}
	return &types.ToolAccount{
		ToolName:    "codex",
		Email:       email,
		Plan:        plan,
		LoginMethod: "oauth",
		AuthPresent: true,
	}, nil
}

func CodexAccountIdentity(ctx context.Context, home string) (*types.ToolAccount, error) {
	account, err := CodexAccountFromAuth(home)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(account.Plan) != "" {
		return account, nil
	}
	_, probeAccount, err := ProbeCodexQuota(ctx, home)
	if err == nil && probeAccount != nil {
		if probeAccount.Plan != "" {
			account.Plan = probeAccount.Plan
		}
		if account.Email == "" {
			account.Email = probeAccount.Email
		}
	}
	return account, nil
}

func ProbeCodexQuota(ctx context.Context, home string) ([]types.QuotaSnapshot, *types.ToolAccount, error) {
	auth, err := LoadCodexAuth(home)
	if err != nil {
		if quotas, rpcErr := probeCodexRPC(ctx); rpcErr == nil && len(quotas) > 0 {
			return quotas, nil, nil
		}
		return nil, nil, err
	}

	if shouldRefreshCodexToken(auth) {
		if refreshed, refreshErr := refreshCodexToken(ctx, home, auth); refreshErr == nil {
			auth = refreshed
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, codexUsageURL, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	req.Header.Set("Accept", "application/json")
	if auth.AccountID != "" {
		req.Header.Set("ChatGPT-Account-Id", auth.AccountID)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		if quotas, rpcErr := probeCodexRPC(ctx); rpcErr == nil && len(quotas) > 0 {
			return quotas, nil, nil
		}
		return nil, nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		if quotas, rpcErr := probeCodexRPC(ctx); rpcErr == nil && len(quotas) > 0 {
			return quotas, nil, nil
		}
		return nil, nil, fmt.Errorf("codex oauth unauthorized")
	}
	if resp.StatusCode >= 300 {
		if quotas, rpcErr := probeCodexRPC(ctx); rpcErr == nil && len(quotas) > 0 {
			return quotas, nil, nil
		}
		return nil, nil, fmt.Errorf("codex usage http %d", resp.StatusCode)
	}

	var usage codexUsageResponse
	if err := json.Unmarshal(body, &usage); err != nil {
		return nil, nil, err
	}

	account, _ := CodexAccountFromAuth(home)
	if account != nil {
		if usage.PlanType != "" {
			account.Plan = usage.PlanType
		}
		if account.Email == "" && usage.Email != "" {
			account.Email = usage.Email
		}
	}

	var snapshots []types.QuotaSnapshot
	if primary := usage.RateLimit.PrimaryWindow; primary.UsedPercent > 0 || codexResetAtString(primary.ResetAt) != "" {
		snapshots = append(snapshots, types.QuotaSnapshot{
			ToolName:    "codex",
			WindowType:  "session_5h",
			UsedPercent: floatPtr(primary.UsedPercent),
			ResetAt:     strPtr(parseUnixOrRFC3339(codexResetAtString(primary.ResetAt)).UTC().Format(time.RFC3339)),
			Source:      "oauth_api",
		})
	}
	if secondary := usage.RateLimit.SecondaryWindow; secondary != nil {
		if secondary.UsedPercent > 0 || codexResetAtString(secondary.ResetAt) != "" {
			snapshots = append(snapshots, types.QuotaSnapshot{
				ToolName:    "codex",
				WindowType:  "weekly",
				UsedPercent: floatPtr(secondary.UsedPercent),
				ResetAt:     strPtr(parseUnixOrRFC3339(codexResetAtString(secondary.ResetAt)).UTC().Format(time.RFC3339)),
				Source:      "oauth_api",
			})
		}
	}
	if usage.Credits.HasCredits {
		snapshots = append(snapshots, types.QuotaSnapshot{
			ToolName:         "codex",
			WindowType:       "credits",
			CreditsRemaining: floatPtr(codexCreditsBalance(usage.Credits.Balance)),
			Source:           "oauth_api",
		})
	}
	return snapshots, account, nil
}

func shouldRefreshCodexToken(auth *codexAuthFile) bool {
	if strings.TrimSpace(auth.RefreshToken) == "" {
		return false
	}
	if auth.LastRefresh == "" {
		return true
	}
	t := parseUnixOrRFC3339(auth.LastRefresh)
	if t.IsZero() {
		return true
	}
	return time.Since(t) > 7*24*time.Hour
}

func refreshCodexToken(ctx context.Context, home string, auth *codexAuthFile) (*codexAuthFile, error) {
	form := "grant_type=refresh_token&refresh_token=" + auth.RefreshToken + "&client_id=" + codexOAuthClientID
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, codexTokenURL, strings.NewReader(form))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("codex token refresh http %d", resp.StatusCode)
	}
	var refreshed map[string]any
	if err := json.Unmarshal(body, &refreshed); err != nil {
		return nil, err
	}
	if v, ok := refreshed["access_token"].(string); ok && v != "" {
		auth.AccessToken = v
	}
	if v, ok := refreshed["refresh_token"].(string); ok && v != "" {
		auth.RefreshToken = v
	}
	if v, ok := refreshed["id_token"].(string); ok && v != "" {
		auth.IDToken = v
	}
	auth.LastRefresh = time.Now().UTC().Format(time.RFC3339)
	_ = SaveCodexAuth(home, auth)
	return auth, nil
}

type rpcWindow struct {
	UsedPercent float64
	ResetAt     *string
}

func numberValue(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case json.Number:
		f, _ := n.Float64()
		return f
	default:
		return 0
	}
}

func stringValue(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
