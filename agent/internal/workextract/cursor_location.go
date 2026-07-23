package workextract

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/scan"
)

func enrichCursorGit(byID map[string]client.WorkSession) {
	home, _ := os.UserHomeDir()
	for id, session := range byID {
		var candidates []string
		name := ""
		if session.Repository != nil && session.Repository.Name != "" {
			name = session.Repository.Name
		} else if session.Trace != nil && session.Trace.Location != nil {
			name = session.Trace.Location.Project
		}
		if name != "" && home != "" {
			for _, root := range []string{
				filepath.Join(home, "code"),
				filepath.Join(home, "src"),
				filepath.Join(home, "dev"),
				filepath.Join(home, "Developer"),
				filepath.Join(home, "Projects"),
				filepath.Join(home, "repos"),
			} {
				candidates = append(candidates, filepath.Join(root, name))
			}
		}
		cwd := ""
		for _, candidate := range candidates {
			if scan.IsPrivacyProtectedPath(candidate) {
				continue
			}
			if st, err := os.Stat(candidate); err == nil && st.IsDir() {
				cwd = candidate
				break
			}
		}
		if cwd == "" {
			continue
		}
		enrichSessionGit(&session, cwd)
		byID[id] = session
	}
}

func cursorProjectSlugFromTranscriptPath(path string) string {
	// ~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl
	parts := strings.Split(filepath.ToSlash(path), "/")
	for i, part := range parts {
		if part == "projects" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	return ""
}

func locationFromCursorProjectSlug(slug string) *client.WorkTraceLocation {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil
	}
	out := &client.WorkTraceLocation{
		Kind:    "local",
		Project: clip(cursorProjectLabel(slug), 128),
	}
	// Never Stat/git under Documents/Desktop/Downloads — that triggers macOS TCC
	// prompts. Prefer the slug label; only enrich repo for non-protected paths.
	if path := reconstructPathFromCursorSlug(slug); path != "" {
		if repo := repositoryFromLocalPath(path); repo != nil {
			out.Repository = repo
			if repo.Name != "" {
				out.Project = clip(repo.Name, 128)
			}
		}
	}
	return out
}

func cursorProjectLabel(slug string) string {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return ""
	}
	// Slugs look like Users-name-Documents-work-usejunciton — take the last segment.
	parts := strings.Split(slug, "-")
	if len(parts) == 0 {
		return slug
	}
	return parts[len(parts)-1]
}

func reconstructPathFromCursorSlug(slug string) string {
	home, _ := os.UserHomeDir()
	if home == "" || slug == "" {
		return ""
	}
	// Common macOS layout: Users-<user>-Documents-work-<repo>
	prefix := "Users-"
	if !strings.HasPrefix(slug, prefix) {
		return ""
	}
	rest := strings.TrimPrefix(slug, prefix)
	// Split user from the remainder at the first known home folder marker.
	for _, marker := range []string{"-Documents-", "-Desktop-", "-Downloads-", "-Developer-", "-Projects-", "-Code-", "-src-", "-repos-"} {
		idx := strings.Index(rest, marker)
		if idx <= 0 {
			continue
		}
		user := rest[:idx]
		tail := strings.ReplaceAll(rest[idx+1:], "-", string(filepath.Separator))
		candidate := filepath.Join("/Users", user, tail)
		if scan.IsPrivacyProtectedPath(candidate) {
			return ""
		}
		if st, err := os.Stat(candidate); err == nil && st.IsDir() {
			return candidate
		}
	}
	return ""
}
