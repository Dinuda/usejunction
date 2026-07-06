package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/configure"
	"github.com/usejunction/agent/internal/providers"
)

var configureCmd = &cobra.Command{
	Use:   "configure",
	Short: "Configure detected tools to use the organization gateway",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := requireConfig()
		if err != nil {
			return err
		}
		ctx := context.Background()
		virtualKey := cfg.DeviceToken[:16]
		var configured []string
		for _, p := range providers.All() {
			status, err := p.Detect(ctx)
			if err != nil || !status.Detected {
				continue
			}
			switch p.ID() {
			case "codex":
				if err := configure.ConfigureCodex(cfg.GatewayURL, virtualKey); err == nil {
					configured = append(configured, "codex")
				}
			case "claude":
				if err := configure.ConfigureClaude(cfg.GatewayURL, virtualKey); err == nil {
					configured = append(configured, "claude")
				}
			case "continue":
				if err := configure.ConfigureContinue(cfg.GatewayURL, virtualKey); err == nil {
					configured = append(configured, "continue")
				}
			}
		}
		if format == "json" {
			printJSON(map[string]any{"configured": configured})
		} else {
			fmt.Printf("Configured tools: %v\n", configured)
			fmt.Println("Run: source ~/.usejunction/claude-env.sh (for Claude Code)")
		}
		return nil
	},
}

var unconfigureCmd = &cobra.Command{
	Use:   "unconfigure",
	Short: "Restore tool configs from backups",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := configure.UnconfigureAll(); err != nil {
			return err
		}
		fmt.Println("Restored configs from backups.")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(configureCmd)
	rootCmd.AddCommand(unconfigureCmd)
}
