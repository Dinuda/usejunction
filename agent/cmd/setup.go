package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/configure"
)

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Configure tools, enable Claude OTEL, and send an initial report",
	Long: `setup runs after enroll to wire detected tools through the organization gateway,
write Claude Code OTEL environment variables, and push the first telemetry report.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := requireConfig()
		if err != nil {
			return err
		}

		configured, err := configure.RunSetup(cfg, configure.SetupOptions{
			ConfigureGateway: true,
			EnableOtel:       true,
		})
		if err != nil {
			return err
		}

		if err := runReport(cmd, args); err != nil {
			return fmt.Errorf("initial report: %w", err)
		}

		if format == "json" {
			printJSON(map[string]any{"configured": configured, "reported": true})
			return nil
		}

		if len(configured) > 0 {
			fmt.Printf("Configured tools: %v\n", configured)
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
