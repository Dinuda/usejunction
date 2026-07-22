package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/configure"
	"github.com/usejunction/agent/internal/scan"
)

var (
	enrollToken     string
	controlPlaneURL string
	enrollEmail     string
	enrollName      string
	enrollSetup     bool
)

var enrollCmd = &cobra.Command{
	Use:   "enroll",
	Short: "Enroll this device with the UseJunction control plane",
	RunE: func(cmd *cobra.Command, args []string) error {
		if enrollToken == "" {
			return fmt.Errorf("--token is required")
		}
		if controlPlaneURL == "" {
			controlPlaneURL = os.Getenv("USEJUNCTION_URL")
		}
		if controlPlaneURL == "" {
			controlPlaneURL = "http://localhost:3001"
		}

		osName, arch := platformInfo()
		resp, err := client.Enroll(controlPlaneURL, client.EnrollRequest{
			Token:        enrollToken,
			Email:        enrollEmail,
			Name:         enrollName,
			Hostname:     hostname(),
			OS:           osName,
			Architecture: arch,
			AgentVersion: config.Version,
		})
		if err != nil {
			return err
		}

		cfg := &config.Config{
			ControlPlaneURL: controlPlaneURL,
			DeviceToken:     resp.DeviceToken,
			DeviceID:        resp.DeviceID,
			UserID:          resp.UserID,
			OrgID:           resp.OrgID,
			GatewayURL:      resp.GatewayURL,
		}
		if resp.Otel != nil {
			cfg.OtelEnabled = resp.Otel.Enabled
			cfg.OtelMetricsEndpoint = resp.Otel.MetricsEndpoint
		}
		if _, err := cfg.EnsureLocalSyncCredentials(); err != nil {
			return fmt.Errorf("local sync credentials: %w", err)
		}
		// Drop prior-enrollment upload fingerprints so history is re-uploaded
		// into this device instead of being skipped against an empty DB.
		if err := scan.ClearUsageUploadStore(); err != nil {
			return fmt.Errorf("clear usage upload cache: %w", err)
		}
		if err := config.Save(cfg); err != nil {
			return fmt.Errorf("saving config: %w", err)
		}

		if enrollSetup {
			if err := configure.RunSetup(cfg, configure.SetupOptions{
				EnableOtel: true,
			}); err != nil {
				fmt.Printf("setup warning: %v\n", err)
			}
			if err := runReport(cmd, args); err != nil {
				fmt.Printf("initial report warning: %v\n", err)
			}
		}

		if format == "json" {
			printJSON(map[string]any{
				"deviceId":   resp.DeviceID,
				"orgId":      resp.OrgID,
				"gatewayUrl": resp.GatewayURL,
			})
		} else {
			fmt.Printf("Enrolled device %s for org %s\n", resp.DeviceID, resp.OrgID)
			fmt.Printf("Gateway: %s\n", resp.GatewayURL)
			fmt.Printf("Config saved to %s\n", config.ConfigPath())
		}
		return nil
	},
}

func init() {
	enrollCmd.Flags().StringVar(&enrollToken, "token", "", "Enrollment token (required)")
	enrollCmd.Flags().StringVar(&controlPlaneURL, "url", "", "Control plane URL (default: $USEJUNCTION_URL or http://localhost:3001)")
	enrollCmd.Flags().StringVar(&enrollEmail, "email", "", "Developer email")
	enrollCmd.Flags().StringVar(&enrollName, "name", "", "Developer name")
	enrollCmd.Flags().BoolVar(&enrollSetup, "setup", true, "Enable Claude OTEL and send initial report")
	rootCmd.AddCommand(enrollCmd)
}
