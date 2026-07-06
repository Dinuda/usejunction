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
	Short: "Show enrollment and device status",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			if format == "json" {
				printJSON(map[string]string{"status": "not_enrolled"})
			} else {
				fmt.Println("Not enrolled.")
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
			"enrolled":    true,
			"deviceId":    cfg.DeviceID,
			"orgId":       cfg.OrgID,
			"gatewayUrl":  cfg.GatewayURL,
			"agentVersion": config.Version,
			"tools":       tools,
		}
		if format == "json" {
			printJSON(out)
		} else {
			fmt.Printf("Device: %s\nOrg: %s\nGateway: %s\n", cfg.DeviceID, cfg.OrgID, cfg.GatewayURL)
			fmt.Printf("Tools detected: %d\n", len(tools))
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(statusCmd)
}
