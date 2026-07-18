package workextract

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/scan"
)

// enrichSessionGit fills trace.git from local git metadata for cwd.
// cwd must already be a validated project path (privacy rules applied by caller).
func enrichSessionGit(session *client.WorkSession, cwd string) {
	if session == nil || cwd == "" || scan.IsPrivacyProtectedPath(cwd) {
		return
	}
	start, end := sessionTimeWindow(*session)
	if start.IsZero() {
		start = time.Now().UTC().Add(-24 * time.Hour)
	}
	if end.IsZero() {
		end = time.Now().UTC()
	}
	end = end.Add(30 * time.Minute)

	git := &client.WorkTraceGit{}
	if branch := gitOutput(cwd, "rev-parse", "--abbrev-ref", "HEAD"); branch != "" && branch != "HEAD" {
		git.Branch = clip(branch, 200)
	}

	commits := gitCommitsInWindow(cwd, start, end)
	if len(commits) > 20 {
		commits = commits[:20]
	}
	git.Commits = commits
	committed := len(commits) > 0
	git.Committed = &committed

	if pr := gitPRNumber(cwd); pr > 0 {
		git.PRNumber = pr
	}

	if git.Branch == "" && len(git.Commits) == 0 && git.PRNumber == 0 {
		return
	}
	if session.Trace == nil {
		session.Trace = &client.WorkTrace{}
	}
	session.Trace.Git = git
}

func sessionTimeWindow(session client.WorkSession) (time.Time, time.Time) {
	var start, end time.Time
	if session.StartedAt != "" {
		if t, err := time.Parse(time.RFC3339, session.StartedAt); err == nil {
			start = t.UTC()
		}
	}
	if session.EndedAt != "" {
		if t, err := time.Parse(time.RFC3339, session.EndedAt); err == nil {
			end = t.UTC()
		}
	}
	if end.IsZero() && session.ObservedAt != "" {
		if t, err := time.Parse(time.RFC3339, session.ObservedAt); err == nil {
			end = t.UTC()
		}
	}
	if start.IsZero() && !end.IsZero() {
		start = end.Add(-2 * time.Hour)
	}
	return start, end
}

func gitOutput(cwd string, args ...string) string {
	cmd := exec.Command("git", append([]string{"-C", cwd}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func gitCommitsInWindow(cwd string, start, end time.Time) []client.WorkTraceGitCommit {
	args := []string{
		"-C", cwd,
		"log",
		"--since=" + start.Format(time.RFC3339),
		"--until=" + end.Format(time.RFC3339),
		"--pretty=format:===%h|%s",
		"--numstat",
		"-n", "20",
	}
	cmd := exec.Command("git", args...)
	out, err := cmd.Output()
	if err != nil || len(out) == 0 {
		return nil
	}

	var commits []client.WorkTraceGitCommit
	var cur *client.WorkTraceGitCommit
	flush := func() {
		if cur == nil {
			return
		}
		commits = append(commits, *cur)
		cur = nil
	}

	sc := bufio.NewScanner(bytes.NewReader(out))
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "===") {
			flush()
			payload := strings.TrimPrefix(line, "===")
			parts := strings.SplitN(payload, "|", 2)
			if len(parts) != 2 {
				continue
			}
			cur = &client.WorkTraceGitCommit{
				SHA:     clip(parts[0], 12),
				Subject: clip(parts[1], 120),
			}
			continue
		}
		if cur == nil || line == "" {
			continue
		}
		fields := strings.Split(line, "\t")
		if len(fields) < 3 {
			continue
		}
		cur.FilesChanged++
		if n, err := strconv.Atoi(fields[0]); err == nil {
			cur.LinesAdded += n
		}
		if n, err := strconv.Atoi(fields[1]); err == nil {
			cur.LinesRemoved += n
		}
	}
	flush()
	return commits
}

func gitPRNumber(cwd string) int {
	if _, err := exec.LookPath("gh"); err != nil {
		return 0
	}
	cmd := exec.Command("gh", "pr", "view", "--json", "number")
	cmd.Dir = cwd
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	var raw struct {
		Number int `json:"number"`
	}
	if json.Unmarshal(out, &raw) == nil && raw.Number >= 1 {
		return raw.Number
	}
	return 0
}
