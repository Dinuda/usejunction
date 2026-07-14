package probe

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"github.com/usejunction/agent/internal/types"
)

type cursorUsageSummary struct {
	BillingCycleEnd  string                 `json:"billingCycleEnd"`
	MembershipType   string                 `json:"membershipType"`
	IndividualUsage  *cursorIndividualUsage `json:"individualUsage"`
}

type cursorStripeProfile struct {
	MembershipType           string `json:"membershipType"`
	IndividualMembershipType string `json:"individualMembershipType"`
	TeamMembershipType       string `json:"teamMembershipType"`
	SubscriptionStatus       string `json:"subscriptionStatus"`
}

type cursorIndividualUsage struct {
	Plan     *cursorPlanUsage     `json:"plan"`
	OnDemand *cursorOnDemandUsage `json:"onDemand"`
}

type cursorPlanUsage struct {
	TotalPercentUsed float64 `json:"totalPercentUsed"`
	AutoPercentUsed  float64 `json:"autoPercentUsed"`
	ApiPercentUsed   float64 `json:"apiPercentUsed"`
	Used             int     `json:"used"`
	Limit            int     `json:"limit"`
}

type cursorOnDemandUsage struct {
	Used      int  `json:"used"`
	Limit     *int `json:"limit"`
	Remaining *int `json:"remaining"`
}

type cursorUserInfo struct {
	Email            string `json:"email"`
	Name             string `json:"name"`
	MembershipType   string `json:"membershipType"`
	Sub              string `json:"sub"`
}

func cursorStateDBPath() string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb")
	}
	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		configHome = filepath.Join(home, ".config")
	}
	return filepath.Join(configHome, "Cursor", "User", "globalStorage", "state.vscdb")
}

func cursorStateDBValue(key string) (string, error) {
	dbPath := cursorStateDBPath()
	if _, err := os.Stat(dbPath); err != nil {
		return "", err
	}
	db, err := sql.Open("sqlite", "file:"+dbPath+"?mode=ro")
	if err != nil {
		return "", err
	}
	defer db.Close()

	var value string
	err = db.QueryRow(`SELECT value FROM ItemTable WHERE key = ? LIMIT 1`, key).Scan(&value)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(value), nil
}

func cursorAccessToken() (string, error) {
	value, err := cursorStateDBValue("cursorAuth/accessToken")
	if err != nil {
		return "", err
	}
	if value == "" {
		return "", fmt.Errorf("cursor access token empty")
	}
	return value, nil
}

func cursorSessionCookie(accessToken string) (string, error) {
	parts := strings.Split(accessToken, ".")
	if len(parts) < 2 {
		return "", fmt.Errorf("invalid cursor token")
	}
	claims := jwtPayload(accessToken)
	userID := claimString(claims, "sub")
	if userID == "" {
		return "", fmt.Errorf("cursor token missing sub")
	}
	return fmt.Sprintf("WorkosCursorSessionToken=%s%%3A%%3A%s", userID, accessToken), nil
}

func cursorLocalMembershipType() string {
	if v, err := cursorStateDBValue("cursorAuth/stripeMembershipType"); err == nil && v != "" {
		return v
	}
	return ""
}

func cursorLocalEmail(token string) string {
	if v, err := cursorStateDBValue("cursorAuth/cachedEmail"); err == nil && v != "" {
		return v
	}
	claims := jwtPayload(token)
	return claimString(claims, "email")
}

func fetchCursorStripeProfile(ctx context.Context, cookie string) *cursorStripeProfile {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://cursor.com/api/auth/stripe", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cookie", cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp == nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	var profile cursorStripeProfile
	if json.NewDecoder(resp.Body).Decode(&profile) != nil {
		return nil
	}
	return &profile
}

func cursorMeProfile(ctx context.Context, cookie string) *cursorUserInfo {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://cursor.com/api/auth/me", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cookie", cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp == nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	var user cursorUserInfo
	if json.NewDecoder(resp.Body).Decode(&user) != nil {
		return nil
	}
	return &user
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func resolveCursorPlan(ctx context.Context, cookie string, summary *cursorUsageSummary) string {
	local := cursorLocalMembershipType()
	if summary != nil && summary.MembershipType != "" {
		return firstNonEmpty(local, summary.MembershipType)
	}
	if local != "" {
		return local
	}
	if profile := fetchCursorStripeProfile(ctx, cookie); profile != nil {
		return firstNonEmpty(
			profile.IndividualMembershipType,
			profile.MembershipType,
			profile.TeamMembershipType,
		)
	}
	if user := cursorMeProfile(ctx, cookie); user != nil {
		return user.MembershipType
	}
	return ""
}

func CursorAccountFromLocal() (*types.ToolAccount, error) {
	token, err := cursorAccessToken()
	if err != nil {
		return nil, err
	}
	email := cursorLocalEmail(token)
	plan := cursorLocalMembershipType()
	return &types.ToolAccount{
		ToolName:    "cursor",
		Email:       email,
		Plan:        plan,
		LoginMethod: "local_app",
		AuthPresent: true,
	}, nil
}

// CursorAccountIdentity returns the best available Cursor account including plan tier.
func CursorAccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	token, err := cursorAccessToken()
	if err != nil {
		return nil, err
	}
	cookie, err := cursorSessionCookie(token)
	if err != nil {
		return &types.ToolAccount{
			ToolName: "cursor", Email: cursorLocalEmail(token),
			Plan: cursorLocalMembershipType(), LoginMethod: "local_app", AuthPresent: true,
		}, nil
	}

	email := cursorLocalEmail(token)
	plan := cursorLocalMembershipType()

	summaryReq, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://cursor.com/api/usage-summary", nil)
	summaryReq.Header.Set("Accept", "application/json")
	summaryReq.Header.Set("Cookie", cookie)
	var summary cursorUsageSummary
	if resp, err := http.DefaultClient.Do(summaryReq); err == nil && resp != nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			_ = json.Unmarshal(body, &summary)
			plan = resolveCursorPlan(ctx, cookie, &summary)
		}
	}
	if plan == "" {
		plan = resolveCursorPlan(ctx, cookie, nil)
	}
	if user := cursorMeProfile(ctx, cookie); user != nil {
		if email == "" {
			email = user.Email
		}
		if plan == "" {
			plan = user.MembershipType
		}
	}

	return &types.ToolAccount{
		ToolName:    "cursor",
		Email:       email,
		Plan:        plan,
		LoginMethod: "local_app",
		AuthPresent: true,
	}, nil
}

func ProbeCursorQuota(ctx context.Context) ([]types.QuotaSnapshot, *types.ToolAccount, error) {
	token, err := cursorAccessToken()
	if err != nil {
		return nil, nil, err
	}
	cookie, err := cursorSessionCookie(token)
	if err != nil {
		return nil, nil, err
	}

	client := &http.Client{Timeout: 15 * time.Second}
	summaryReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://cursor.com/api/usage-summary", nil)
	if err != nil {
		return nil, nil, err
	}
	summaryReq.Header.Set("Accept", "application/json")
	summaryReq.Header.Set("Cookie", cookie)

	summaryResp, err := client.Do(summaryReq)
	if err != nil {
		return nil, nil, err
	}
	defer summaryResp.Body.Close()
	summaryBody, _ := io.ReadAll(summaryResp.Body)
	if summaryResp.StatusCode >= 300 {
		return nil, nil, fmt.Errorf("cursor usage-summary http %d", summaryResp.StatusCode)
	}

	var summary cursorUsageSummary
	if err := json.Unmarshal(summaryBody, &summary); err != nil {
		return nil, nil, err
	}

	account, _ := CursorAccountIdentity(ctx)
	if account == nil {
		account = &types.ToolAccount{ToolName: "cursor", LoginMethod: "local_app", AuthPresent: true}
	}
	if account.Plan == "" {
		account.Plan = resolveCursorPlan(ctx, cookie, &summary)
	}

	var snapshots []types.QuotaSnapshot
	resetAt := strPtr(parseUnixOrRFC3339(summary.BillingCycleEnd).UTC().Format(time.RFC3339))

	if summary.IndividualUsage != nil && summary.IndividualUsage.Plan != nil {
		plan := summary.IndividualUsage.Plan
		if plan.TotalPercentUsed > 0 || plan.Limit > 0 {
			used := plan.TotalPercentUsed
			if used == 0 && plan.Limit > 0 {
				used = (float64(plan.Used) / float64(plan.Limit)) * 100
			}
			snapshots = append(snapshots, types.QuotaSnapshot{
				ToolName: "cursor", WindowType: "plan",
				UsedPercent: floatPtr(used), ResetAt: resetAt, Source: "local_app",
			})
		}
		if plan.AutoPercentUsed > 0 {
			snapshots = append(snapshots, types.QuotaSnapshot{
				ToolName: "cursor", WindowType: "auto",
				UsedPercent: floatPtr(plan.AutoPercentUsed), ResetAt: resetAt, Source: "local_app",
			})
		}
		if plan.ApiPercentUsed > 0 {
			snapshots = append(snapshots, types.QuotaSnapshot{
				ToolName: "cursor", WindowType: "api",
				UsedPercent: floatPtr(plan.ApiPercentUsed), ResetAt: resetAt, Source: "local_app",
			})
		}
	}
	if summary.IndividualUsage != nil && summary.IndividualUsage.OnDemand != nil {
		od := summary.IndividualUsage.OnDemand
		if od.Used > 0 {
			var remaining float64
			if od.Remaining != nil {
				remaining = float64(*od.Remaining) / 100
			}
			snapshots = append(snapshots, types.QuotaSnapshot{
				ToolName: "cursor", WindowType: "on_demand",
				UsedPercent: floatPtr(float64(od.Used) / 100), ResetAt: resetAt,
				CreditsRemaining: floatPtr(remaining), Source: "local_app",
			})
		}
	}

	return snapshots, account, nil
}

// ScanCursorUsage is deprecated in favor of local + events merge in the provider.
// Kept for backward compatibility: returns plan utilization as a synthetic observation.
func ScanCursorUsage(ctx context.Context) ([]types.DailyUsage, error) {
	quotas, _, err := ProbeCursorQuota(ctx)
	if err != nil {
		return nil, err
	}
	today := time.Now().UTC().Format("2006-01-02")
	var rows []types.DailyUsage
	for _, q := range quotas {
		if q.WindowType != "plan" || q.UsedPercent == nil {
			continue
		}
		credits := int(*q.UsedPercent * 100)
		if credits <= 0 {
			continue
		}
		rows = append(rows, types.DailyUsage{
			Date:          today,
			ToolName:      "cursor",
			Model:         "plan",
			InputTokens:   credits,
			OutputTokens:  0,
			EstimatedCost: 0,
			Source:        "cursor_plan_percent",
		})
	}
	return rows, nil
}

type cursorUsageEventsResponse struct {
	TotalUsageEventsCount int `json:"totalUsageEventsCount"`
	UsageEventsDisplay    []struct {
		Timestamp        string `json:"timestamp"`
		Model            string `json:"model"`
		Kind             string `json:"kind"`
		IsTokenBasedCall bool   `json:"isTokenBasedCall"`
		ChargedCents     *float64 `json:"chargedCents"`
		TokenUsage       *struct {
			InputTokens      int     `json:"inputTokens"`
			OutputTokens     int     `json:"outputTokens"`
			CacheWriteTokens int     `json:"cacheWriteTokens"`
			CacheReadTokens  int     `json:"cacheReadTokens"`
			TotalCents       float64 `json:"totalCents"`
		} `json:"tokenUsage"`
	} `json:"usageEventsDisplay"`
}

type cursorEventsCache struct {
	Version            string             `json:"version"`
	CalculationVersion string             `json:"calculationVersion"`
	LastEventTimestamp string             `json:"lastEventTimestamp,omitempty"`
	Rows               []types.DailyUsage `json:"rows"`
}

// ScanCursorUsageEvents fetches billed usage events using the local Cursor
// session cookie. Results are cached for one hour under ~/.usejunction/cache.
func ScanCursorUsageEvents(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	cachePath := filepath.Join(os.Getenv("HOME"), ".usejunction", "cache", "cursor-usage-events.json")
	if home, err := os.UserHomeDir(); err == nil {
		cachePath = filepath.Join(home, ".usejunction", "cache", "cursor-usage-events.json")
	}
	if !refresh {
		if cached, err := loadCursorEventsCache(cachePath); err == nil {
			return cached, nil
		}
	}

	token, err := cursorAccessToken()
	if err != nil {
		return nil, err
	}
	cookie, err := cursorSessionCookie(token)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 30 * time.Second}
	buckets := map[string]*types.DailyUsage{}
	page := 1
	pageSize := 200
	var lastEventTS string

	for {
		body := map[string]any{
			"page":     page,
			"pageSize": pageSize,
		}
		payload, _ := json.Marshal(body)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://cursor.com/api/dashboard/get-filtered-usage-events", strings.NewReader(string(payload)))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Cookie", cookie)
		req.Header.Set("Origin", "https://cursor.com")

		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			return nil, fmt.Errorf("cursor usage-events http %d", resp.StatusCode)
		}

		var out cursorUsageEventsResponse
		if err := json.Unmarshal(respBody, &out); err != nil {
			return nil, err
		}
		if len(out.UsageEventsDisplay) == 0 {
			break
		}

		for _, ev := range out.UsageEventsDisplay {
			date := cursorEventDate(ev.Timestamp)
			if ev.Timestamp != "" {
				lastEventTS = ev.Timestamp
			}
			model := strings.TrimSpace(ev.Model)
			if model == "" {
				model = "unknown"
			}
			key := date + "|" + model
			if buckets[key] == nil {
				buckets[key] = &types.DailyUsage{
					Date: date, ToolName: "cursor", Model: model,
					Source: "cursor_usage_events", Verified: true,
					MetricKind: types.MetricKindUsage, CostKind: types.CostKindVerifiedUsage,
					TokenSemantics: types.TokenSemanticsVendor, CalculationVersion: "usage-v2",
				}
			}
			b := buckets[key]
			b.Requests++
			if ev.TokenUsage != nil {
				b.InputTokens += ev.TokenUsage.InputTokens
				b.OutputTokens += ev.TokenUsage.OutputTokens
				b.CacheReadTokens += ev.TokenUsage.CacheReadTokens
				b.CacheWriteTokens += ev.TokenUsage.CacheWriteTokens
			}
			// chargedCents is authoritative when present, including zero.
			if ev.ChargedCents != nil {
				b.EstimatedCost += *ev.ChargedCents / 100
			}
		}

		if len(out.UsageEventsDisplay) < pageSize {
			break
		}
		if out.TotalUsageEventsCount > 0 && page*pageSize >= out.TotalUsageEventsCount {
			break
		}
		page++
		if page > 1000 {
			break
		}
	}

	result := make([]types.DailyUsage, 0, len(buckets))
	for _, b := range buckets {
		result = append(result, *b)
	}
	cache := cursorEventsCache{
		Version: "2", CalculationVersion: "usage-v2",
		LastEventTimestamp: lastEventTS, Rows: result,
	}
	_ = saveCursorEventsCache(cachePath, cache)
	return result, nil
}

func cursorEventDate(ts string) string {
	ts = strings.TrimSpace(ts)
	if ts == "" {
		return time.Now().UTC().Format("2006-01-02")
	}
	t := parseUnixOrRFC3339(ts)
	if t.IsZero() {
		return time.Now().UTC().Format("2006-01-02")
	}
	return t.UTC().Format("2006-01-02")
}

func loadCursorEventsCache(path string) ([]types.DailyUsage, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if time.Since(info.ModTime()) > time.Hour {
		return nil, fmt.Errorf("cache stale")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var wrapped cursorEventsCache
	if err := json.Unmarshal(data, &wrapped); err == nil && len(wrapped.Rows) > 0 {
		return wrapped.Rows, nil
	}
	var out []types.DailyUsage
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func saveCursorEventsCache(path string, cache cursorEventsCache) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.Marshal(cache)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}
