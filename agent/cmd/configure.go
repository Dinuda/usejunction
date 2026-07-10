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
	Long: `configure detects supported AI coding tools and rewrites their config
files to route through the UseJunction gateway. Original config files are
backed up to ~/.usejunction/backups/ before any modification.

Run 'usejunction unconfigure' to restore the originals.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := requireConfig()
		if err != nil {
			return err
		}
		ctx := context.Background()

		// Use the first 16 chars of the device token as the virtual API key.
		virtualKey := cfg.DeviceToken
		if len(virtualKey) > 32 {
			virtualKey = virtualKey[:32]
		}

		var configured []string
		var skipped []string

		for _, p := range providers.All() {
			status, err := p.Detect(ctx)
			if err != nil || !status.Detected {
				continue
			}

			var configErr error
			switch p.ID() {
			case "codex":
				configErr = configure.ConfigureCodex(cfg.GatewayURL, virtualKey)
			case "claude":
				configErr = configure.ConfigureClaude(cfg.GatewayURL, virtualKey)
			case "continue":
				configErr = configure.ConfigureContinue(cfg.GatewayURL, virtualKey)
			default:
				// detect-only providers
				skipped = append(skipped, p.ID())
				continue
			}

			if configErr != nil {
				if verbose {
					fmt.Printf("  %s: failed — %v\n", p.ID(), configErr)
				}
				skipped = append(skipped, p.ID())
			} else {
				configured = append(configured, p.ID())
			}
		}

		if format == "json" {
			printJSON(map[string]any{
				"configured": configured,
				"skipped":    skipped,
				"gatewayUrl": cfg.GatewayURL,
			})
			return nil
		}

		if len(configured) == 0 {
			fmt.Println("No configurable tools detected.")
		} else {
			fmt.Printf("Configured: %v\n", configured)
		}
		if len(skipped) > 0 && verbose {
			fmt.Printf("Skipped (detect-only or error): %v\n", skipped)
		}

		// Print the Claude env snippet hint when claude was configured.
		for _, t := range configured {
			if t == "claude" {
				fmt.Println("\nFor Claude Code, source the env snippet:")
				fmt.Printf("  source ~/.usejunction/claude-env.sh\n")
				fmt.Println("Or add that line to ~/.zshrc / ~/.bashrc")
				break
			}
		}
		return nil
	},
}

var unconfigureCmd = &cobra.Command{
	Use:   "unconfigure",
	Short: "Restore original tool configs from backups",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := configure.UnconfigureAll(); err != nil {
			return fmt.Errorf("unconfigure: %w", err)
		}
		fmt.Println("Original tool configs restored from backups.")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(configureCmd)
	rootCmd.AddCommand(unconfigureCmd)
}
