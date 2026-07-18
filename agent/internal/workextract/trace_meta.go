package workextract

import (
	"path/filepath"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
)

const maxSourceLen = 64

var exploreTools = map[string]bool{
	"read": true, "grep": true, "glob": true, "semanticsearch": true,
	"websearch": true, "webfetch": true, "rg": true, "readfile": true,
	"askquestion": true, "exec": true, "exec_command": true, "bash": true,
}

var editTools = map[string]bool{
	"write": true, "strreplace": true, "streplace": true, "delete": true, "editnotebook": true,
	"deletefile": true, "apply_patch": true, "applypatch": true, "searchreplace": true,
	"edit": true,
}

var verifyTools = map[string]bool{
	"readlints": true,
}

var verifyShellTokens = map[string]string{
	"test": "test", "pytest": "test", "vitest": "test", "jest": "test",
	"go": "test", "tsc": "typecheck", "eslint": "lint", "lint": "lint",
	"build": "build", "cargo": "build", "npm": "test", "pnpm": "test", "yarn": "test",
}

var languageByExt = map[string]string{
	".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
	".go": "go", ".py": "python", ".rs": "rust", ".java": "java", ".kt": "kotlin",
	".swift": "swift", ".rb": "ruby", ".php": "php", ".cs": "csharp", ".cpp": "cpp",
	".c": "c", ".h": "c", ".md": "markdown", ".sql": "sql", ".json": "json",
	".yml": "yaml", ".yaml": "yaml", ".toml": "toml", ".css": "css", ".scss": "scss",
}

type toolEvent struct {
	Name       string
	ShellToken string // first token only when tool is Shell; never full argv
	FileBase   string // basename for write-like tools
	IsSkill    bool
	SkillName  string
}

func clampSource(parts ...string) string {
	clean := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		clean = append(clean, p)
	}
	if len(clean) == 0 {
		return "unknown"
	}
	// Prefer short codes.
	mapped := make([]string, 0, len(clean))
	for _, p := range clean {
		switch {
		case strings.Contains(p, "composer_headers"):
			mapped = append(mapped, "headers")
		case strings.Contains(p, "conversation_summaries"):
			mapped = append(mapped, "summaries")
		case strings.Contains(p, "agent_transcript"):
			mapped = append(mapped, "transcript")
		case strings.HasPrefix(p, "cursor"):
			mapped = append(mapped, "cursor")
		case strings.HasPrefix(p, "codex"):
			mapped = append(mapped, "codex")
		case strings.HasPrefix(p, "claude"):
			mapped = append(mapped, "claude")
		default:
			mapped = append(mapped, clip(p, 24))
		}
	}
	out := strings.Join(uniqStrings(mapped), "+")
	if len(out) <= maxSourceLen {
		return out
	}
	return out[:maxSourceLen]
}

func mergeSource(existing, next string) string {
	if existing == "" {
		return clampSource(next)
	}
	if next == "" {
		return clampSource(existing)
	}
	parts := append(strings.Split(existing, "+"), strings.Split(next, "+")...)
	return clampSource(parts...)
}

func toolPhase(name, shellToken string) string {
	n := strings.ToLower(strings.TrimSpace(name))
	if verifyTools[n] {
		return "verify"
	}
	if n == "shell" || n == "bash" || n == "exec" || n == "exec_command" {
		if _, ok := verifyShellTokens[strings.ToLower(shellToken)]; ok {
			return "verify"
		}
		return "explore"
	}
	if editTools[n] {
		return "edit"
	}
	if exploreTools[n] || n == "grep" || n == "glob" || n == "read" {
		return "explore"
	}
	if n == "task" || n == "todowrite" || n == "createplan" {
		return "plan"
	}
	return ""
}

func buildPhases(events []toolEvent) (phases []string, fingerprint string, verify *client.WorkTraceVerify) {
	seenPhase := map[string]bool{}
	var order []string
	kindsSeen := map[string]bool{}
	var kinds []string
	sawEdit := false
	afterEdit := false

	for _, ev := range events {
		phase := toolPhase(ev.Name, ev.ShellToken)
		if phase == "" {
			continue
		}
		if phase == "edit" {
			sawEdit = true
		}
		if phase == "verify" {
			if sawEdit {
				afterEdit = true
			}
			kind := "lint"
			if strings.EqualFold(ev.Name, "Shell") || strings.EqualFold(ev.Name, "Bash") {
				if mapped, ok := verifyShellTokens[strings.ToLower(ev.ShellToken)]; ok {
					kind = mapped
				} else {
					kind = "shell"
				}
			} else if strings.EqualFold(ev.Name, "ReadLints") {
				kind = "lint"
			}
			if !kindsSeen[kind] {
				kindsSeen[kind] = true
				kinds = append(kinds, kind)
			}
		}
		if !seenPhase[phase] {
			seenPhase[phase] = true
			order = append(order, phase)
		}
	}
	if len(order) > 8 {
		order = order[:8]
	}
	phases = order
	if len(phases) > 0 {
		fingerprint = strings.Join(phases, ">")
		fingerprint = clip(fingerprint, 120)
	}
	if afterEdit || len(kinds) > 0 {
		verify = &client.WorkTraceVerify{AfterEdit: afterEdit, Kinds: kinds}
	}
	return phases, fingerprint, verify
}

func buildChurn(events []toolEvent) *client.WorkTraceChurn {
	writes := map[string]int{}
	rewriteEvents := 0
	for _, ev := range events {
		if ev.FileBase == "" || !editTools[strings.ToLower(ev.Name)] {
			continue
		}
		writes[ev.FileBase]++
		if writes[ev.FileBase] > 1 {
			rewriteEvents++
		}
	}
	filesRewritten := 0
	for _, n := range writes {
		if n >= 2 {
			filesRewritten++
		}
	}
	if filesRewritten == 0 && rewriteEvents == 0 {
		return nil
	}
	return &client.WorkTraceChurn{FilesRewritten: filesRewritten, RewriteEvents: rewriteEvents}
}

func languagesAndTests(files []string) (langs []string, testInvolved bool) {
	seen := map[string]bool{}
	for _, file := range files {
		base := strings.ToLower(filepath.Base(file))
		if strings.Contains(base, ".test.") || strings.Contains(base, "_test.") ||
			strings.HasSuffix(base, "_test.go") || strings.HasPrefix(base, "test_") {
			testInvolved = true
		}
		ext := strings.ToLower(filepath.Ext(base))
		if lang, ok := languageByExt[ext]; ok && !seen[lang] {
			seen[lang] = true
			langs = append(langs, lang)
		}
		if len(langs) >= 12 {
			break
		}
	}
	return langs, testInvolved
}

func shellFirstToken(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	// Only first token — never store full argv.
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return ""
	}
	tok := fields[0]
	tok = strings.Trim(tok, `"'`)
	tok = filepath.Base(tok)
	tok = strings.ToLower(tok)
	if len(tok) > 32 {
		return ""
	}
	// Only keep allowlisted tokens so we don't leak unusual binaries/paths.
	if _, ok := verifyShellTokens[tok]; ok {
		return tok
	}
	return ""
}

func durationBetween(start, end time.Time) int {
	if start.IsZero() || end.IsZero() {
		return 0
	}
	d := int(end.Sub(start).Seconds())
	if d < 0 {
		return 0
	}
	const max = 7 * 24 * 60 * 60
	if d > max {
		return max
	}
	return d
}

func boolPtr(v bool) *bool { return &v }

func enrichTraceDerived(trace *client.WorkTrace, events []toolEvent, files []string) {
	if trace == nil {
		return
	}
	phases, fingerprint, verify := buildPhases(events)
	if len(phases) > 0 {
		trace.Phases = phases
		trace.PhaseFingerprint = fingerprint
	}
	if verify != nil {
		trace.Verify = verify
	}
	if churn := buildChurn(events); churn != nil {
		trace.Churn = churn
	}
	langs, testInvolved := languagesAndTests(files)
	if len(langs) > 0 {
		trace.Languages = langs
	}
	if testInvolved {
		trace.TestInvolved = boolPtr(true)
	} else if len(files) > 0 {
		trace.TestInvolved = boolPtr(false)
	}
	skillCounts := map[string]int{}
	for _, ev := range events {
		if ev.IsSkill && ev.SkillName != "" {
			skillCounts[ev.SkillName]++
		}
	}
	if len(skillCounts) > 0 {
		if len(skillCounts) > 40 {
			trimmed := map[string]int{}
			i := 0
			for k, v := range skillCounts {
				if i >= 40 {
					break
				}
				trimmed[k] = v
				i++
			}
			skillCounts = trimmed
		}
		trace.SkillCounts = skillCounts
	}
}
