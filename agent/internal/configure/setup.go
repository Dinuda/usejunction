package configure

import (
	"context"
	"fmt"
	"strings"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/providers"
)

// SetupOptions controls gateway + OTEL wiring during enroll/setup.
type SetupOptions struct {
	ConfigureGateway bool
	EnableOtel       bool
}

// RunSetup configures detected tools and writes Claude OTEL env when enrolled.
func RunSetup(cfg *config.Config, opts SetupOptions) ([]string, error) {
	ctx := context.Background()
	virtualKey := cfg.DeviceToken
	if len(virtualKey) > 32 {
		virtualKey = virtualKey[:32]
	}

	var configured []string
	if opts.ConfigureGateway {
		for _, p := range providers.All() {
			status, err := p.Detect(ctx)
			if err != nil || !status.Detected {
				continue
			}
			var configErr error
			switch p.ID() {
			case "codex":
				configErr = ConfigureCodex(cfg.GatewayURL, virtualKey)
			case "claude":
				configErr = ConfigureClaude(cfg.GatewayURL, virtualKey)
			case "continue":
				configErr = ConfigureContinue(cfg.GatewayURL, virtualKey)
			default:
				continue
			}
			if configErr == nil {
				configured = append(configured, p.ID())
			}
		}
	}

	otelEndpoint := strings.TrimRight(cfg.ControlPlaneURL, "/") + "/api/otel/v1/metrics"
	if opts.EnableOtel {
		if err := WriteClaudeEnv(ClaudeEnvOptions{
			GatewayURL:          cfg.GatewayURL,
			VirtualKey:          virtualKey,
			OtelEnabled:         true,
			OtelMetricsEndpoint: otelEndpoint,
			DeviceToken:         cfg.DeviceToken,
		}); err != nil {
			return configured, fmt.Errorf("claude otel env: %w", err)
		}
		cfg.OtelEnabled = true
		cfg.OtelMetricsEndpoint = otelEndpoint
		if err := config.Save(cfg); err != nil {
			return configured, err
		}
	}

	return configured, nil
}
