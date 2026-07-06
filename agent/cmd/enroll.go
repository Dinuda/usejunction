package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
)

var (
	enrollToken       string
	controlPlaneURL   string
	enrollEmail       string
	enrollName        string
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
		if err := config.Save(cfg); err != nil {
			return err
		}
		if format == "json" {
			printJSON(cfg)
		} else {
			fmt.Printf("Enrolled device %s for org %s\n", resp.DeviceID, resp.OrgID)
			fmt.Printf("Gateway: %s\n", resp.GatewayURL)
		}
		return nil
	},
}

func init() {
	enrollCmd.Flags().StringVar(&enrollToken, "token", "", "Enrollment token")
	enrollCmd.Flags().StringVar(&controlPlaneURL, "url", "", "Control plane URL")
	enrollCmd.Flags().StringVar(&enrollEmail, "email", "", "Developer email")
	enrollCmd.Flags().StringVar(&enrollName, "name", "", "Developer name")
	rootCmd.AddCommand(enrollCmd)
}
