package probe

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
)

func floatPtr(v float64) *float64 { return &v }

func strPtr(v string) *string { return &v }

func resetAtRFC3339(t time.Time) *string {
	if t.IsZero() {
		return nil
	}
	s := t.UTC().Format(time.RFC3339)
	return &s
}

func parseUnixOrRFC3339(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}
	}
	if sec, err := json.Number(raw).Int64(); err == nil {
		if sec > 1_000_000_000_000 {
			return time.UnixMilli(sec)
		}
		return time.Unix(sec, 0)
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t
	}
	return time.Time{}
}

func jwtPayload(token string) map[string]any {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return nil
	}
	payload := parts[1]
	if m := len(payload) % 4; m != 0 {
		payload += strings.Repeat("=", 4-m)
	}
	data, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		data, err = base64.URLEncoding.DecodeString(payload)
		if err != nil {
			return nil
		}
	}
	var claims map[string]any
	if json.Unmarshal(data, &claims) != nil {
		return nil
	}
	return claims
}

func claimString(claims map[string]any, keys ...string) string {
	for _, key := range keys {
		if v, ok := claims[key].(string); ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
