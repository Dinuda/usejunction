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

const claudeUsageURL = "https://api.anthropic.com/api/oauth/usage"

type claudeCredentials struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	Email        string `json:"email"`
	AccountUUID  string `json:"account_uuid"`
}

type claudeUsageWindow struct {
	Utilization float64 `json:"utilization"`
	ResetsAt    string  `json:"resets_at"`
}

func LoadClaudeCredentials(dir string) (*claudeCredentials, error) {
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

func ClaudeAccountFromCredentials(dir string) (*types.ToolAccount, error) {
	creds, err := LoadClaudeCredentials(dir)
	if err != nil {
		return nil, err
	}
	return &types.ToolAccount{
		ToolName:    "claude",
		Email:       strings.TrimSpace(creds.Email),
		LoginMethod: "oauth",
		AuthPresent: true,
	}, nil
}

func ProbeClaudeQuota(ctx context.Context, dir string) ([]types.QuotaSnapshot, *types.ToolAccount, error) {
	creds, err := LoadClaudeCredentials(dir)
	if err != nil {
		return nil, nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, claudeUsageURL, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+creds.AccessToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("anthropic-beta", "oauth-2025-04-20")
	req.Header.Set("User-Agent", "claude-code/2.1.0")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("claude oauth usage http %d", resp.StatusCode)
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, nil, err
	}

	account, _ := ClaudeAccountFromCredentials(dir)
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

	return snapshots, account, nil
}
