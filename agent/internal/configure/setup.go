package configure

import (
	"fmt"
	"strings"

	"github.com/usejunction/agent/internal/config"
)

// SetupOptions controls OTEL wiring during enroll/setup.
type SetupOptions struct {
	EnableOtel bool
}

// RunSetup writes Claude OTEL env when enrolled.
// It must never modify vendor tool configs (Codex, Cursor, etc.).
func RunSetup(cfg *config.Config, opts SetupOptions) error {
	if !opts.EnableOtel {
		return nil
	}

	otelEndpoint := strings.TrimRight(cfg.ControlPlaneURL, "/") + "/api/otel/v1/metrics"
	if err := WriteClaudeOtelEnv(ClaudeOtelOptions{
		MetricsEndpoint: otelEndpoint,
		DeviceToken:     cfg.DeviceToken,
	}); err != nil {
		return fmt.Errorf("claude otel env: %w", err)
	}
	cfg.OtelEnabled = true
	cfg.OtelMetricsEndpoint = otelEndpoint
	// Drop any legacy gateway URL persisted by older agent versions.
	cfg.GatewayURL = ""
	return config.Save(cfg)
}
