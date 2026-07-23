package probe

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"github.com/usejunction/agent/internal/platformdirs"
	"github.com/usejunction/agent/internal/sqlitedb"
	"github.com/usejunction/agent/internal/types"
)

const (
	antigravityUserStatusKey   = "antigravityUnifiedStateSync.userStatus"
	antigravityModelCreditsKey = "antigravityUnifiedStateSync.modelCredits"
	antigravityOAuthTokenKey   = "antigravityUnifiedStateSync.oauthToken"
	antigravityTrajectoryKey   = "antigravityUnifiedStateSync.trajectorySummaries"
	antigravityAuthStatusKey   = "antigravityAuthStatus"
)

// antigravityStateDBPathOverride is set by tests to point at a fixture state.vscdb.
var antigravityStateDBPathOverride string

// SetAntigravityStateDBPathForTest points account/quota/trajectory reads at a fixture DB.
func SetAntigravityStateDBPathForTest(path string) (restore func()) {
	prev := antigravityStateDBPathOverride
	antigravityStateDBPathOverride = path
	return func() { antigravityStateDBPathOverride = prev }
}

var (
	emailRe       = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)
	planTierRe    = regexp.MustCompile(`(?i)\bg1-(?:pro|ultra|plus|free)(?:-tier)?\b`)
	planDisplayRe = regexp.MustCompile(`(?i)Google AI (?:Pro|Ultra(?: Max)?|Plus)|Individual`)
	uuidRe        = regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	githubRepoRe  = regexp.MustCompile(`(?i)(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+)(?:\.git)?`)
	fileURIRe     = regexp.MustCompile(`file://[^\s"'<>]+`)
)

func antigravityStateDBPaths() []string {
	if antigravityStateDBPathOverride != "" {
		return []string{antigravityStateDBPathOverride}
	}
	var out []string
	for _, userDir := range platformdirs.AntigravityUserDirs() {
		out = append(out, filepath.Join(userDir, "globalStorage", "state.vscdb"))
	}
	return out
}

func antigravityStateDBValue(key string) (string, error) {
	var lastErr error
	for _, path := range antigravityStateDBPaths() {
		if _, err := os.Stat(path); err != nil {
			lastErr = err
			continue
		}
		value, err := antigravityStateDBValueAt(path, key)
		if err != nil {
			lastErr = err
			continue
		}
		if strings.TrimSpace(value) != "" {
			return value, nil
		}
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", os.ErrNotExist
}

func antigravityStateDBValueAt(dbPath, key string) (string, error) {
	db, err := sqlitedb.OpenReadonly(dbPath)
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

func antigravityAuthPresent() bool {
	if raw, err := antigravityStateDBValue(antigravityOAuthTokenKey); err == nil && len(raw) > 20 {
		return true
	}
	if raw, err := antigravityStateDBValue(antigravityUserStatusKey); err == nil && len(raw) > 20 && raw != "null" {
		return true
	}
	if raw, err := antigravityStateDBValue(antigravityAuthStatusKey); err == nil {
		v := strings.TrimSpace(strings.ToLower(raw))
		if v != "" && v != "null" && v != "false" && v != "{}" {
			return true
		}
	}
	return false
}

// AntigravityAccountFromLocal reads identity from Antigravity's state.vscdb.
// It never returns oauth token material.
func AntigravityAccountFromLocal() (*types.ToolAccount, error) {
	email, plan := "", ""
	if raw, err := antigravityStateDBValue(antigravityUserStatusKey); err == nil {
		parsed := parseAntigravityUserStatus(raw)
		email = parsed.Email
		plan = parsed.Plan
	}
	auth := antigravityAuthPresent() || email != "" || plan != ""
	if !auth {
		return &types.ToolAccount{ToolName: "antigravity", LoginMethod: "local_app", AuthPresent: false}, nil
	}
	return &types.ToolAccount{
		ToolName:    "antigravity",
		Email:       email,
		Plan:        plan,
		LoginMethod: "local_app",
		AuthPresent: true,
	}, nil
}

// AntigravityAccountIdentity returns the best available local Antigravity account.
func AntigravityAccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	_ = ctx
	return AntigravityAccountFromLocal()
}

// ProbeAntigravityQuota prefers Cloud Code model quotas (used% + reset) for pace,
// and always folds in local credit-remaining when present.
func ProbeAntigravityQuota(ctx context.Context) ([]types.QuotaSnapshot, *types.ToolAccount, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	account, err := AntigravityAccountFromLocal()
	if err != nil {
		return nil, nil, err
	}
	if account == nil || !account.AuthPresent {
		return nil, account, nil
	}

	var snapshots []types.QuotaSnapshot
	if apiSnaps, apiErr := probeAntigravityCloudCodeQuota(ctx); apiErr == nil {
		snapshots = append(snapshots, apiSnaps...)
	}

	if raw, err := antigravityStateDBValue(antigravityModelCreditsKey); err == nil {
		if credits := parseAntigravityModelCredits(raw); credits != nil {
			snapshots = append(snapshots, types.QuotaSnapshot{
				ToolName:         "antigravity",
				WindowType:       "credits",
				CreditsRemaining: credits,
				Source:           "antigravity_model_credits",
			})
		}
	}
	return snapshots, account, nil
}

type antigravityUserStatus struct {
	Email string
	Name  string
	Plan  string
}

func parseAntigravityUserStatus(raw string) antigravityUserStatus {
	out := antigravityUserStatus{}
	for _, layer := range peelAntigravityLayers(raw, 4) {
		for _, s := range extractPrintableStrings(layer, 3) {
			if out.Email == "" {
				if m := emailRe.FindString(s); m != "" {
					out.Email = m
				}
			}
			if out.Plan == "" {
				if m := planTierRe.FindString(s); m != "" {
					out.Plan = normalizeAntigravityPlan(m)
				} else if m := planDisplayRe.FindString(s); m != "" {
					out.Plan = normalizeAntigravityPlan(m)
				}
			}
			if out.Name == "" && looksLikePersonName(s) {
				out.Name = s
			}
		}
		if out.Email != "" && out.Plan != "" {
			break
		}
	}
	return out
}

func normalizeAntigravityPlan(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	s = strings.ReplaceAll(s, " ", "-")
	s = strings.ReplaceAll(s, "_", "-")
	switch {
	case strings.Contains(s, "ultra-max"), strings.Contains(s, "ultra") && strings.Contains(s, "20"):
		return "google-ai-ultra-max"
	case strings.Contains(s, "g1-ultra"), strings.Contains(s, "ultra"):
		return "google-ai-ultra"
	case strings.Contains(s, "g1-pro"), strings.Contains(s, "pro"):
		return "google-ai-pro"
	case strings.Contains(s, "g1-plus"), strings.Contains(s, "plus"):
		return "google-ai-plus"
	case strings.Contains(s, "organization"), strings.Contains(s, "enterprise"):
		return "organization"
	case strings.Contains(s, "individual"), strings.Contains(s, "free"), s == "g1-free", s == "g1-free-tier":
		return "individual"
	default:
		return s
	}
}

func parseAntigravityModelCredits(raw string) *float64 {
	if n := parseAntigravityCreditsSentinel(raw, "availableCreditsSentinelKey"); n != nil {
		return n
	}
	layers := peelAntigravityLayers(raw, 4)
	for _, layer := range layers {
		for _, s := range extractPrintableStrings(layer, 1) {
			if n, err := strconv.ParseFloat(s, 64); err == nil && n >= 0 && n < 1e9 {
				v := n
				return &v
			}
		}
	}
	for _, layer := range layers {
		ascii := 0
		for _, b := range layer {
			if b >= 32 && b < 127 {
				ascii++
			}
		}
		if len(layer) > 0 && float64(ascii)/float64(len(layer)) > 0.85 {
			continue // skip mostly-ascii base64 wrappers
		}
		if n, ok := largestVarint(layer, 1, 1_000_000_000); ok {
			v := float64(n)
			return &v
		}
	}
	return nil
}

// parseAntigravityCreditsSentinel reads the IDE's sentinel-keyed credit envelope:
// availableCreditsSentinelKey → length-delimited payload (often base64) → protobuf field 2 varint.
func parseAntigravityCreditsSentinel(raw, sentinel string) *float64 {
	needle := []byte(sentinel)
	for _, layer := range peelAntigravityLayers(raw, 4) {
		idx := bytes.Index(layer, needle)
		if idx < 0 {
			continue
		}
		rest := layer[idx+len(needle):]
		payload := nextProtoBytesField(rest)
		if payload == nil {
			continue
		}
		candidates := [][]byte{payload}
		if nested := nextProtoBytesField(payload); nested != nil {
			candidates = append(candidates, nested)
		}
		for _, cand := range candidates {
			text := strings.TrimSpace(string(cand))
			if decoded, err := base64.StdEncoding.DecodeString(text); err == nil && len(decoded) > 0 {
				if n, ok := protoFieldVarint(decoded, 2); ok {
					v := float64(n)
					return &v
				}
				if n, ok := protoFieldVarint(decoded, 1); ok {
					v := float64(n)
					return &v
				}
			}
			if decoded, err := base64.RawStdEncoding.DecodeString(text); err == nil && len(decoded) > 0 {
				if n, ok := protoFieldVarint(decoded, 2); ok {
					v := float64(n)
					return &v
				}
			}
			if n, ok := protoFieldVarint(cand, 2); ok {
				v := float64(n)
				return &v
			}
		}
	}
	return nil
}

func nextProtoBytesField(buf []byte) []byte {
	i := 0
	for i < len(buf) {
		tag, n := binary.Uvarint(buf[i:])
		if n <= 0 {
			return nil
		}
		i += n
		kind := tag & 7
		switch kind {
		case 0: // varint
			_, n := binary.Uvarint(buf[i:])
			if n <= 0 {
				return nil
			}
			i += n
		case 1: // fixed64
			if i+8 > len(buf) {
				return nil
			}
			i += 8
		case 2: // bytes
			l, n := binary.Uvarint(buf[i:])
			if n <= 0 {
				return nil
			}
			i += n
			end := i + int(l)
			if end > len(buf) || end < i {
				return nil
			}
			return buf[i:end]
		case 5: // fixed32
			if i+4 > len(buf) {
				return nil
			}
			i += 4
		default:
			return nil
		}
	}
	return nil
}

func protoFieldVarint(buf []byte, field uint64) (uint64, bool) {
	i := 0
	for i < len(buf) {
		tag, n := binary.Uvarint(buf[i:])
		if n <= 0 {
			return 0, false
		}
		i += n
		found := tag >> 3
		kind := tag & 7
		switch kind {
		case 0:
			v, n := binary.Uvarint(buf[i:])
			if n <= 0 {
				return 0, false
			}
			i += n
			if found == field {
				return v, true
			}
		case 1:
			if i+8 > len(buf) {
				return 0, false
			}
			i += 8
		case 2:
			l, n := binary.Uvarint(buf[i:])
			if n <= 0 {
				return 0, false
			}
			i += n
			end := i + int(l)
			if end > len(buf) || end < i {
				return 0, false
			}
			i = end
		case 5:
			if i+4 > len(buf) {
				return 0, false
			}
			i += 4
		default:
			return 0, false
		}
	}
	return 0, false
}

// AntigravityTrajectorySummary is a privacy-safe session index entry.
type AntigravityTrajectorySummary struct {
	LocalID    string
	Title      string
	Workspace  string
	RepoHost   string
	RepoOwner  string
	RepoName   string
	ObservedAt string
}

// AntigravityTrajectorySummaries reads the session index from state.vscdb.
func AntigravityTrajectorySummaries() ([]AntigravityTrajectorySummary, error) {
	raw, err := antigravityStateDBValue(antigravityTrajectoryKey)
	if err != nil {
		return nil, err
	}
	return parseAntigravityTrajectorySummaries(raw), nil
}

func parseAntigravityTrajectorySummaries(raw string) []AntigravityTrajectorySummary {
	var best []byte
	for _, layer := range peelAntigravityLayers(raw, 3) {
		best = layer
		// Prefer the first mostly-binary layer that still has readable titles.
		ascii := 0
		for _, b := range layer {
			if b >= 32 && b < 127 {
				ascii++
			}
		}
		if len(layer) > 0 && float64(ascii)/float64(len(layer)) < 0.85 {
			break
		}
	}
	if len(best) == 0 {
		return nil
	}

	stringsList := extractPrintableStrings(best, 6)
	uuids := uuidRe.FindAllString(string(best), -1)
	if len(uuids) == 0 {
		// Titles may appear before UUID extraction succeeds via strings.
		for _, s := range stringsList {
			if uuidRe.MatchString(s) {
				uuids = append(uuids, uuidRe.FindString(s))
			}
		}
	}

	type pending struct {
		title string
		ws    string
		host  string
		owner string
		name  string
	}
	byID := map[string]*pending{}
	order := make([]string, 0)
	var currentID string

	for _, s := range stringsList {
		if id := uuidRe.FindString(s); id != "" {
			currentID = id
			if _, ok := byID[id]; !ok {
				byID[id] = &pending{}
				order = append(order, id)
			}
			continue
		}
		if currentID == "" {
			continue
		}
		p := byID[currentID]
		if p == nil {
			continue
		}
		if uri := fileURIRe.FindString(s); uri != "" {
			p.ws = workspaceBasename(uri)
			continue
		}
		if m := githubRepoRe.FindStringSubmatch(s); len(m) == 3 {
			p.host = "github.com"
			p.owner = m[1]
			p.name = strings.TrimSuffix(m[2], ".git")
			continue
		}
		if p.title == "" && looksLikeSessionTitle(s) {
			p.title = clipAntigravity(s, 160)
		}
	}

	// If UUID scan of raw bytes found ids not walked above, seed them.
	for _, id := range uuids {
		if _, ok := byID[id]; !ok {
			byID[id] = &pending{}
			order = append(order, id)
		}
	}

	out := make([]AntigravityTrajectorySummary, 0, len(order))
	for _, id := range order {
		p := byID[id]
		if p == nil {
			continue
		}
		if p.title == "" && p.ws == "" && p.name == "" {
			continue
		}
		out = append(out, AntigravityTrajectorySummary{
			LocalID:   id,
			Title:     p.title,
			Workspace: p.ws,
			RepoHost:  p.host,
			RepoOwner: p.owner,
			RepoName:  p.name,
		})
	}
	return out
}

func peelAntigravityLayers(raw string, max int) [][]byte {
	cur := []byte(strings.TrimSpace(raw))
	out := make([][]byte, 0, max)
	seen := map[string]bool{}
	for i := 0; i < max && len(cur) > 0; i++ {
		key := string(cur)
		if seen[key] {
			break
		}
		seen[key] = true
		out = append(out, cur)

		decoded, ok := tryBase64(cur)
		if ok && len(decoded) > 0 {
			cur = decoded
			continue
		}
		// Nested base64 runs inside protobuf wrappers.
		if run := longestBase64Run(cur); len(run) > 40 {
			if nested, ok := tryBase64(run); ok && len(nested) > 0 {
				cur = nested
				continue
			}
		}
		break
	}
	return out
}

func tryBase64(in []byte) ([]byte, bool) {
	s := strings.TrimSpace(string(in))
	if s == "" {
		return nil, false
	}
	// Fast reject obvious non-b64.
	for _, r := range s {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '+' || r == '/' || r == '=' || r == '-' || r == '_' || unicode.IsSpace(r) {
			continue
		}
		return nil, false
	}
	s = strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, s)
	encodings := []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding}
	for _, enc := range encodings {
		if decoded, err := enc.DecodeString(s); err == nil && len(decoded) > 0 {
			return decoded, true
		}
		if pad := (4 - len(s)%4) % 4; pad > 0 {
			if decoded, err := enc.DecodeString(s + strings.Repeat("=", pad)); err == nil && len(decoded) > 0 {
				return decoded, true
			}
		}
	}
	return nil, false
}

func longestBase64Run(data []byte) []byte {
	re := regexp.MustCompile(`[A-Za-z0-9+/=_-]{40,}`)
	matches := re.FindAll(data, -1)
	var best []byte
	for _, m := range matches {
		if len(m) > len(best) {
			best = m
		}
	}
	return best
}

func extractPrintableStrings(data []byte, minLen int) []string {
	if minLen < 1 {
		minLen = 1
	}
	out := make([]string, 0)
	var cur []byte
	flush := func() {
		if len(cur) >= minLen {
			out = append(out, string(cur))
		}
		cur = cur[:0]
	}
	for _, b := range data {
		if b >= 32 && b < 127 {
			cur = append(cur, b)
			continue
		}
		flush()
	}
	flush()
	return out
}

func largestVarint(data []byte, min, max uint64) (uint64, bool) {
	var best uint64
	found := false
	i := 0
	for i < len(data) {
		var x uint64
		var s uint
		start := i
		for {
			if i >= len(data) {
				break
			}
			b := data[i]
			i++
			if s >= 64 {
				break
			}
			x |= uint64(b&0x7f) << s
			if b < 0x80 {
				if x >= min && x <= max && (!found || x > best) {
					best = x
					found = true
				}
				break
			}
			s += 7
			if i-start > 10 {
				break
			}
		}
	}
	return best, found
}

func looksLikePersonName(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) < 3 || len(s) > 60 {
		return false
	}
	if strings.ContainsAny(s, "@/\\{}[]<>=") {
		return false
	}
	parts := strings.Fields(s)
	if len(parts) < 2 || len(parts) > 4 {
		return false
	}
	for _, p := range parts {
		if len(p) < 2 {
			return false
		}
		for _, r := range p {
			if !unicode.IsLetter(r) && r != '-' && r != '\'' {
				return false
			}
		}
	}
	return true
}

func looksLikeSessionTitle(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) < 8 || len(s) > 160 {
		return false
	}
	if strings.HasPrefix(s, "http") || strings.HasPrefix(s, "file:") {
		return false
	}
	if strings.Contains(s, "Sentinel") || strings.Contains(s, "application/") {
		return false
	}
	if !strings.Contains(s, " ") {
		return false
	}
	letters := 0
	for _, r := range s {
		if unicode.IsLetter(r) {
			letters++
		}
	}
	return letters >= 6
}

func workspaceBasename(uri string) string {
	uri = strings.TrimSpace(uri)
	uri = strings.TrimPrefix(uri, "file://")
	// Strip optional protobuf length prefix digits sometimes glued on.
	for len(uri) > 0 && uri[0] >= '0' && uri[0] <= '9' {
		uri = uri[1:]
	}
	uri = strings.TrimPrefix(uri, "/")
	if strings.HasPrefix(uri, "Users/") || strings.HasPrefix(uri, "home/") {
		uri = "/" + uri
	}
	base := filepath.Base(filepath.Clean(uri))
	if base == "." || base == "/" || base == "" {
		return ""
	}
	return clipAntigravity(base, 80)
}

func clipAntigravity(s string, n int) string {
	s = strings.TrimSpace(s)
	if n <= 0 || len(s) <= n {
		return s
	}
	return s[:n]
}
