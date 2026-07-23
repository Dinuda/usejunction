package probe

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/types"
)

const (
	antigravityCloudCodeURL  = "https://cloudcode-pa.googleapis.com"
	antigravityOAuthTokenURL = "https://oauth2.googleapis.com/token"
	antigravityQuotaSource   = "oauth_api"
	// Antigravity's desktop OAuth client lives in the IDE / language_server binary.
	// Do not commit those credentials; supply them at runtime for token refresh.
	antigravityOAuthClientIDEnv     = "UJ_ANTIGRAVITY_OAUTH_CLIENT_ID"
	antigravityOAuthClientSecretEnv = "UJ_ANTIGRAVITY_OAUTH_CLIENT_SECRET"
)

var (
	antigravityAccessTokenRe  = regexp.MustCompile(`ya29\.[A-Za-z0-9._\-/+=]+`)
	antigravityRefreshTokenRe = regexp.MustCompile(`1//[A-Za-z0-9_\-]+`)
)

// Overrides for unit tests.
var (
	antigravityCloudCodeURLOverride      string
	antigravityOAuthTokenURLOverride     string
	antigravityOAuthClientIDOverride     string
	antigravityOAuthClientSecretOverride string
	antigravityHTTPClient                = &http.Client{Timeout: 12 * time.Second}
)

func antigravityOAuthClientID() string {
	if v := strings.TrimSpace(antigravityOAuthClientIDOverride); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv(antigravityOAuthClientIDEnv))
}

func antigravityOAuthClientSecret() string {
	if v := strings.TrimSpace(antigravityOAuthClientSecretOverride); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv(antigravityOAuthClientSecretEnv))
}

type antigravityOAuthTokens struct {
	AccessToken  string
	RefreshToken string
}

type antigravityLoadCodeAssistResponse struct {
	CloudaicompanionProject string          `json:"cloudaicompanionProject"`
	CurrentTier             json.RawMessage `json:"currentTier"`
}

type antigravityFetchModelsResponse struct {
	Models map[string]antigravityModelInfo `json:"models"`
}

type antigravityModelInfo struct {
	DisplayName string                `json:"displayName"`
	QuotaInfo   *antigravityQuotaInfo `json:"quotaInfo"`
}

type antigravityQuotaInfo struct {
	RemainingFraction *float64 `json:"remainingFraction"`
	ResetTime         string   `json:"resetTime"`
	IsExhausted       bool     `json:"isExhausted"`
}

// probeAntigravityCloudCodeQuota loads per-model remainingFraction + resetTime
// via Cloud Code (same endpoint the IDE uses). Soft-fails to nil on auth/network errors.
func probeAntigravityCloudCodeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	tokens, err := loadAntigravityOAuthTokens()
	if err != nil || tokens == nil || tokens.AccessToken == "" {
		return nil, err
	}

	project, err := antigravityLoadCodeAssist(ctx, tokens.AccessToken)
	if err != nil && isUnauthorized(err) && tokens.RefreshToken != "" {
		refreshed, refreshErr := refreshAntigravityAccessToken(ctx, tokens.RefreshToken)
		if refreshErr != nil {
			return nil, err
		}
		tokens.AccessToken = refreshed
		project, err = antigravityLoadCodeAssist(ctx, tokens.AccessToken)
	}
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(project) == "" {
		return nil, fmt.Errorf("antigravity cloudcode: empty project")
	}

	models, err := antigravityFetchAvailableModels(ctx, tokens.AccessToken, project)
	if err != nil && isUnauthorized(err) && tokens.RefreshToken != "" {
		refreshed, refreshErr := refreshAntigravityAccessToken(ctx, tokens.RefreshToken)
		if refreshErr != nil {
			return nil, err
		}
		tokens.AccessToken = refreshed
		models, err = antigravityFetchAvailableModels(ctx, tokens.AccessToken, project)
	}
	if err != nil {
		return nil, err
	}
	return antigravityModelQuotaSnapshots(models, time.Now()), nil
}

func isUnauthorized(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "http 401") || strings.Contains(msg, "http 403")
}

func loadAntigravityOAuthTokens() (*antigravityOAuthTokens, error) {
	raw, err := antigravityStateDBValue(antigravityOAuthTokenKey)
	if err != nil {
		return nil, err
	}
	return parseAntigravityOAuthTokens(raw), nil
}

func parseAntigravityOAuthTokens(raw string) *antigravityOAuthTokens {
	out := &antigravityOAuthTokens{}
	for _, layer := range peelAntigravityLayers(raw, 4) {
		extractAntigravityOAuthFromBytes(layer, out)
		if out.AccessToken != "" && out.RefreshToken != "" {
			return out
		}
	}
	if out.AccessToken == "" && out.RefreshToken == "" {
		return nil
	}
	return out
}

func extractAntigravityOAuthFromBytes(layer []byte, out *antigravityOAuthTokens) {
	if out.AccessToken == "" {
		if m := antigravityAccessTokenRe.Find(layer); len(m) > 0 {
			out.AccessToken = string(m)
		}
	}
	if out.RefreshToken == "" {
		if m := antigravityRefreshTokenRe.Find(layer); len(m) > 0 {
			out.RefreshToken = string(m)
		}
	}

	needle := []byte("oauthTokenInfoSentinelKey")
	idx := bytes.Index(layer, needle)
	if idx < 0 {
		return
	}
	rest := layer[idx+len(needle):]
	payload := nextProtoBytesField(rest)
	if payload == nil {
		return
	}
	candidates := [][]byte{payload}
	if nested := nextProtoBytesField(payload); nested != nil {
		candidates = append(candidates, nested)
	}
	for _, cand := range candidates {
		text := strings.TrimSpace(string(cand))
		for _, decoded := range decodeAntigravityBase64Candidates(text) {
			extractAntigravityOAuthFromBytes(decoded, out)
			if out.AccessToken != "" && out.RefreshToken != "" {
				return
			}
		}
	}
}

func decodeAntigravityBase64Candidates(text string) [][]byte {
	var out [][]byte
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding} {
		if decoded, err := enc.DecodeString(text); err == nil && len(decoded) > 0 {
			out = append(out, decoded)
		}
	}
	return out
}

func refreshAntigravityAccessToken(ctx context.Context, refreshToken string) (string, error) {
	clientID := antigravityOAuthClientID()
	clientSecret := antigravityOAuthClientSecret()
	if clientID == "" || clientSecret == "" {
		return "", fmt.Errorf("antigravity oauth: set %s and %s", antigravityOAuthClientIDEnv, antigravityOAuthClientSecretEnv)
	}
	endpoint := antigravityOAuthTokenURL
	if antigravityOAuthTokenURLOverride != "" {
		endpoint = antigravityOAuthTokenURLOverride
	}
	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := antigravityHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("antigravity oauth refresh http %d", resp.StatusCode)
	}
	var parsed struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if strings.TrimSpace(parsed.AccessToken) == "" {
		return "", fmt.Errorf("antigravity oauth refresh: empty access_token")
	}
	return parsed.AccessToken, nil
}

func antigravityCloudCodeBase() string {
	if antigravityCloudCodeURLOverride != "" {
		return strings.TrimRight(antigravityCloudCodeURLOverride, "/")
	}
	return antigravityCloudCodeURL
}

func antigravityLoadCodeAssist(ctx context.Context, accessToken string) (string, error) {
	payload := map[string]any{
		"metadata": map[string]string{
			"ideType":    "ANTIGRAVITY",
			"platform":   "PLATFORM_UNSPECIFIED",
			"pluginType": "GEMINI",
		},
	}
	var parsed antigravityLoadCodeAssistResponse
	if err := antigravityCloudCodePOST(ctx, accessToken, "/v1internal:loadCodeAssist", payload, &parsed); err != nil {
		return "", err
	}
	project := strings.TrimSpace(parsed.CloudaicompanionProject)
	project = strings.TrimPrefix(project, "projects/")
	return project, nil
}

func antigravityFetchAvailableModels(ctx context.Context, accessToken, project string) (map[string]antigravityModelInfo, error) {
	payload := map[string]any{"project": project}
	var parsed antigravityFetchModelsResponse
	if err := antigravityCloudCodePOST(ctx, accessToken, "/v1internal:fetchAvailableModels", payload, &parsed); err != nil {
		return nil, err
	}
	return parsed.Models, nil
}

func antigravityCloudCodePOST(ctx context.Context, accessToken, path string, payload any, dest any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, antigravityCloudCodeBase()+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "antigravity")

	resp, err := antigravityHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("antigravity cloudcode %s http %d", path, resp.StatusCode)
	}
	if dest == nil {
		return nil
	}
	return json.Unmarshal(raw, dest)
}

func antigravityModelFamily(modelID string) string {
	id := strings.ToLower(strings.TrimSpace(modelID))
	switch {
	case strings.Contains(id, "claude"):
		return "claude"
	case strings.Contains(id, "gemini"), strings.HasPrefix(id, "chat_"), strings.HasPrefix(id, "tab_"):
		return "gemini"
	case strings.Contains(id, "gpt"), strings.Contains(id, "oss"):
		return "gpt"
	default:
		return "model"
	}
}

func antigravityWindowPeriod(resetAt time.Time, now time.Time) string {
	if resetAt.IsZero() {
		return "5h"
	}
	remaining := resetAt.Sub(now)
	if remaining <= 6*time.Hour {
		return "5h"
	}
	if remaining <= 8*24*time.Hour {
		return "weekly"
	}
	return "monthly"
}

type antigravityFamilyQuota struct {
	family    string
	remaining float64
	resetAt   time.Time
	exhausted bool
}

func antigravityModelQuotaSnapshots(models map[string]antigravityModelInfo, now time.Time) []types.QuotaSnapshot {
	byFamily := map[string]*antigravityFamilyQuota{}
	for modelID, info := range models {
		qi := info.QuotaInfo
		if qi == nil || qi.RemainingFraction == nil {
			continue
		}
		resetAt := parseUnixOrRFC3339(qi.ResetTime)
		// Skip inventory rows with no reset clock (always-full tab models, etc.).
		if resetAt.IsZero() {
			continue
		}
		family := antigravityModelFamily(modelID)
		remaining := *qi.RemainingFraction
		if qi.IsExhausted {
			remaining = 0
		}
		existing := byFamily[family]
		if existing == nil {
			byFamily[family] = &antigravityFamilyQuota{
				family:    family,
				remaining: remaining,
				resetAt:   resetAt,
				exhausted: qi.IsExhausted,
			}
			continue
		}
		// Keep the tightest remaining pool for that family.
		if remaining < existing.remaining {
			existing.remaining = remaining
			existing.resetAt = resetAt
			existing.exhausted = qi.IsExhausted
		} else if remaining == existing.remaining && !resetAt.IsZero() && (existing.resetAt.IsZero() || resetAt.Before(existing.resetAt)) {
			existing.resetAt = resetAt
		}
	}

	families := make([]*antigravityFamilyQuota, 0, len(byFamily))
	for _, row := range byFamily {
		families = append(families, row)
	}
	sort.Slice(families, func(i, j int) bool {
		if families[i].remaining != families[j].remaining {
			return families[i].remaining < families[j].remaining
		}
		return families[i].family < families[j].family
	})

	out := make([]types.QuotaSnapshot, 0, len(families))
	for _, row := range families {
		used := (1 - row.remaining) * 100
		if used < 0 {
			used = 0
		}
		if row.exhausted || used > 100 {
			used = 100
		}
		period := antigravityWindowPeriod(row.resetAt, now)
		out = append(out, types.QuotaSnapshot{
			ToolName:    "antigravity",
			WindowType:  row.family + "_" + period,
			UsedPercent: floatPtr(used),
			ResetAt:     resetAtRFC3339(row.resetAt),
			Source:      antigravityQuotaSource,
		})
	}
	return out
}
