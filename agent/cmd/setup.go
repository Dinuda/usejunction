package cmd

import (
	"errors"
	"fmt"
	"runtime"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/configure"
)

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Enable Claude OTEL and send an initial report",
	Long: `setup runs after enroll to write Claude Code OTEL environment variables
and push the first telemetry report.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := requireConfig()
		if err != nil {
			return err
		}

		if err := configure.RunSetup(cfg, configure.SetupOptions{
			EnableOtel: true,
		}); err != nil {
			return err
		}

		if err := runReport(cmd, args); err != nil {
			if errors.Is(err, client.ErrUnauthorized) {
				return fmt.Errorf(
					"initial report: device credentials were revoked on the control plane; remove ~/.usejunction and enroll again with a fresh token (do not use --resume)",
				)
			}
			return fmt.Errorf("initial report: %w", err)
		}

		if format == "json" {
			printJSON(map[string]any{"otelEnabled": true, "reported": true})
			return nil
		}

		if runtime.GOOS == "windows" {
			fmt.Println("Claude OTEL env written to ~/.usejunction/claude-env.sh and claude-env.ps1")
			fmt.Println("Initial report sent.")
			fmt.Println(`Load Claude env in PowerShell: . "$HOME\.usejunction\claude-env.ps1"`)
			return nil
		}
		fmt.Println("Claude OTEL env written to ~/.usejunction/claude-env.sh")
		fmt.Println("Initial report sent.")
		fmt.Println("Source Claude env in your shell: source ~/.usejunction/claude-env.sh")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(setupCmd)
}
