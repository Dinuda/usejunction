package cmd

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/types"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show enrollment status and detected tools",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			if format == "json" {
				printJSON(map[string]any{"enrolled": false})
			} else {
				fmt.Println("Status: not enrolled")
				fmt.Println("Run:    usejunction enroll --token <token>")
			}
			return nil
		}

		ctx := context.Background()
		var tools []types.ToolStatus
		for _, p := range providers.All() {
			s, _ := p.Detect(ctx)
			if s != nil && s.Detected {
				tools = append(tools, *s)
			}
		}

		out := map[string]any{
			"enrolled":      true,
			"deviceId":      cfg.DeviceID,
			"orgId":         cfg.OrgID,
			"agentVersion":  config.Version,
			"toolsDetected": len(tools),
			"tools":         tools,
		}

		if format == "json" {
			printJSON(out)
			return nil
		}

		fmt.Printf("Status:       enrolled\n")
		fmt.Printf("Device ID:    %s\n", cfg.DeviceID)
		fmt.Printf("Org ID:       %s\n", cfg.OrgID)
		fmt.Printf("Agent:        v%s\n", config.Version)
		fmt.Printf("Tools found:  %d\n", len(tools))
		for _, t := range tools {
			tag := ""
			if t.Configured {
				tag = " [ready]"
			}
			fmt.Printf("  • %s%s\n", t.ToolName, tag)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(statusCmd)
}
