// Package configure handles post-enroll setup such as Claude OTEL env snippets
// and restoring tool configs that older agent versions may have backed up.
package configure

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/config"
)

type manifestEntry struct {
	OriginalPath string `json:"originalPath"`
	BackupFile   string `json:"backupFile"`
	Tool         string `json:"tool"`
	BackedUpAt   string `json:"backedUpAt"`
}

func manifestPath() string {
	return filepath.Join(config.BackupDir(), "manifest.json")
}

func loadManifest() []manifestEntry {
	data, err := os.ReadFile(manifestPath())
	if err != nil {
		return nil
	}
	var entries []manifestEntry
	_ = json.Unmarshal(data, &entries)
	return entries
}

// RestoreBackups restores tool configs backed up by legacy agent versions.
func RestoreBackups() error {
	entries := loadManifest()
	if len(entries) == 0 {
		return nil
	}

	latest := make(map[string]manifestEntry)
	for _, e := range entries {
		latest[e.OriginalPath] = e
	}

	var firstErr error
	for origPath, entry := range latest {
		src := filepath.Join(config.BackupDir(), entry.BackupFile)
		if !fileExists(src) {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(origPath), 0700); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if err := copyFile(src, origPath); err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("restore %s: %w", origPath, err)
			}
		}
	}

	_ = os.Remove(filepath.Join(config.ConfigDir(), "claude-env.sh"))

	return firstErr
}

// UnconfigureAll restores legacy backups and removes generated env snippets.
func UnconfigureAll() error {
	return RestoreBackups()
}

// ClaudeOtelOptions configures Claude Code OTLP metrics export.
type ClaudeOtelOptions struct {
	MetricsEndpoint string
	DeviceToken     string
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func validateHTTPSURL(raw string) error {
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("URL must be an absolute http(s) URL")
	}
	host := parsed.Hostname()
	isLoopback := host == "localhost"
	if ip := net.ParseIP(host); ip != nil {
		isLoopback = ip.IsLoopback()
	}
	if parsed.Scheme != "https" && !isLoopback {
		return fmt.Errorf("URL must use HTTPS unless it is loopback")
	}
	return nil
}

// WriteClaudeOtelEnv writes ~/.usejunction/claude-env.sh with OTEL settings only.
func WriteClaudeOtelEnv(opts ClaudeOtelOptions) error {
	if err := validateHTTPSURL(opts.MetricsEndpoint); err != nil {
		return fmt.Errorf("OTEL metrics endpoint: %w", err)
	}
	if strings.TrimSpace(opts.DeviceToken) == "" {
		return fmt.Errorf("device token is required for OTEL export")
	}

	snippetPath := filepath.Join(config.ConfigDir(), "claude-env.sh")
	var b strings.Builder
	b.WriteString("# Managed by UseJunction agent — source from your shell RC.\n")
	b.WriteString("export CLAUDE_CODE_ENABLE_TELEMETRY=1\n")
	b.WriteString("export OTEL_METRICS_EXPORTER=otlp\n")
	b.WriteString("export OTEL_LOGS_EXPORTER=none\n")
	b.WriteString("export OTEL_TRACES_EXPORTER=none\n")
	b.WriteString("export OTEL_EXPORTER_OTLP_METRICS_PROTOCOL=http/json\n")
	b.WriteString(fmt.Sprintf("export OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=%s\n", shellQuote(opts.MetricsEndpoint)))
	b.WriteString(fmt.Sprintf("export OTEL_EXPORTER_OTLP_METRICS_HEADERS=%s\n", shellQuote("Authorization=Bearer "+opts.DeviceToken)))
	b.WriteString("export OTEL_LOG_USER_PROMPTS=0\n")
	b.WriteString("export OTEL_LOG_TOOL_DETAILS=0\n")
	b.WriteString("export OTEL_LOG_TOOL_CONTENT=0\n")
	b.WriteString(fmt.Sprintf("# source %s\n", snippetPath))
	if err := os.MkdirAll(config.ConfigDir(), 0700); err != nil {
		return err
	}
	return os.WriteFile(snippetPath, []byte(b.String()), 0600)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0700); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
