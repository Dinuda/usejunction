package probe

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/types"
)

const copilotInternalUserURL = "https://api.github.com/copilot_internal/user"

type copilotQuotaBucket struct {
	OverageCount      float64 `json:"overage_count"`
	OveragePermitted  bool    `json:"overage_permitted"`
	PercentRemaining  float64 `json:"percent_remaining"`
	QuotaRemaining    float64 `json:"quota_remaining"`
	Unlimited         bool    `json:"unlimited"`
	HasQuota          bool    `json:"has_quota"`
	CreditsUsed       float64 `json:"credits_used"`
	Remaining         float64 `json:"remaining"`
	Entitlement       float64 `json:"entitlement"`
	TokenBasedBilling bool    `json:"token_based_billing"`
}

type copilotInternalUser struct {
	Login             string                        `json:"login"`
	AccessTypeSKU     string                        `json:"access_type_sku"`
	CopilotPlan       string                        `json:"copilot_plan"`
	QuotaResetDateUTC string                        `json:"quota_reset_date_utc"`
	QuotaResetDate    string                        `json:"quota_reset_date"`
	QuotaSnapshots    map[string]copilotQuotaBucket `json:"quota_snapshots"`
	CanUpgradePlan    bool                          `json:"can_upgrade_plan"`
}

func githubCLIToken(ctx context.Context) (string, error) {
	cmd := exec.CommandContext(ctx, "gh", "auth", "token")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("gh auth token: %w", err)
	}
	token := strings.TrimSpace(string(out))
	if token == "" {
		return "", fmt.Errorf("gh auth token empty")
	}
	return token, nil
}

func CopilotAccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	token, err := githubCLIToken(ctx)
	if err != nil {
		return &types.ToolAccount{ToolName: "copilot", LoginMethod: "github", AuthPresent: false}, nil
	}
	user, err := fetchCopilotInternalUser(ctx, token)
	if err != nil {
		return &types.ToolAccount{ToolName: "copilot", LoginMethod: "github", AuthPresent: true}, nil
	}
	return copilotAccountFromUser(user), nil
}

func ProbeCopilotQuota(ctx context.Context) ([]types.QuotaSnapshot, *types.ToolAccount, error) {
	token, err := githubCLIToken(ctx)
	if err != nil {
		return nil, nil, err
	}
	user, err := fetchCopilotInternalUser(ctx, token)
	if err != nil {
		return nil, nil, err
	}

	resetAt := copilotResetAt(user)
	account := copilotAccountFromUser(user)
	return copilotQuotaSnapshots(user, resetAt), account, nil
}

func copilotAccountFromUser(user *copilotInternalUser) *types.ToolAccount {
	if user == nil {
		return &types.ToolAccount{ToolName: "copilot", LoginMethod: "github", AuthPresent: true}
	}
	plan := strings.TrimSpace(user.CopilotPlan)
	if sku := strings.TrimSpace(user.AccessTypeSKU); sku != "" {
		if plan == "" {
			plan = sku
		} else if !strings.EqualFold(plan, sku) {
			plan = plan + "/" + sku
		}
	}
	return &types.ToolAccount{
		ToolName:    "copilot",
		Email:       strings.TrimSpace(user.Login),
		Plan:        plan,
		LoginMethod: "github",
		AuthPresent: true,
	}
}

func copilotQuotaSnapshots(user *copilotInternalUser, resetAt *string) []types.QuotaSnapshot {
	if user == nil {
		return nil
	}
	var snapshots []types.QuotaSnapshot
	for name, bucket := range user.QuotaSnapshots {
		if !bucket.HasQuota && !bucket.Unlimited && bucket.Entitlement <= 0 && bucket.Remaining <= 0 {
			continue
		}
		windowType := "copilot_" + strings.TrimSpace(name)
		if bucket.Unlimited {
			snapshots = append(snapshots, types.QuotaSnapshot{
				ToolName:    "copilot",
				WindowType:  windowType,
				UsedPercent: floatPtr(0),
				ResetAt:     resetAt,
				Source:      "github_api",
			})
			continue
		}
		usedPercent := 100 - bucket.PercentRemaining
		if bucket.Entitlement > 0 {
			usedPercent = (bucket.CreditsUsed / bucket.Entitlement) * 100
		}
		snap := types.QuotaSnapshot{
			ToolName:    "copilot",
			WindowType:  windowType,
			UsedPercent: floatPtr(usedPercent),
			ResetAt:     resetAt,
			Source:      "github_api",
		}
		if bucket.Remaining > 0 || bucket.QuotaRemaining > 0 {
			remaining := bucket.Remaining
			if remaining == 0 {
				remaining = bucket.QuotaRemaining
			}
			snap.CreditsRemaining = floatPtr(remaining)
		}
		snapshots = append(snapshots, snap)
	}
	return snapshots
}

func fetchCopilotInternalUser(ctx context.Context, token string) (*copilotInternalUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, copilotInternalUserURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "usejunction-agent")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("copilot internal user http %d", resp.StatusCode)
	}
	var user copilotInternalUser
	if err := json.Unmarshal(body, &user); err != nil {
		return nil, err
	}
	return &user, nil
}

func copilotResetAt(user *copilotInternalUser) *string {
	if user == nil {
		return nil
	}
	for _, raw := range []string{user.QuotaResetDateUTC, user.QuotaResetDate} {
		parsed := parseUnixOrRFC3339(raw)
		if !parsed.IsZero() {
			return strPtr(parsed.UTC().Format(time.RFC3339))
		}
		if t, err := time.Parse("2006-01-02", strings.TrimSpace(raw)); err == nil {
			return strPtr(t.UTC().Format(time.RFC3339))
		}
	}
	return nil
}
