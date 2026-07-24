package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/configure"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/types"
	"github.com/usejunction/agent/internal/ui"
)

var (
	onboardToken    string
	onboardURL      string
	onboardEmail    string
	onboardName     string
	onboardComplete bool
)

var onboardCmd = &cobra.Command{
	Use:   "onboard",
	Short: "Animated first-run enroll, tool scan, and success panel",
	Long: `Runs the branded first-run experience:
  1. Enroll this device
  2. Configure Claude OTEL and send an initial report
  3. Scan for AI coding tools
  4. Show a status card

After the installer starts the background agent, call again with --complete
to print the success panel (admin URL + PATH tips).`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ui.SetNoColor(noColor || format == "json")

		if onboardComplete {
			return runOnboardComplete()
		}
		return runOnboard()
	},
}

func runOnboardComplete() error {
	cfg, err := config.Load()
	adminURL := "http://localhost:3001"
	if err == nil && cfg.ControlPlaneURL != "" {
		adminURL = cfg.ControlPlaneURL
	} else if u := os.Getenv("USEJUNCTION_URL"); u != "" {
		adminURL = u
	}
	cliPath, _ := os.Executable()
	if cliPath == "" {
		home, _ := os.UserHomeDir()
		cliPath = filepath.Join(home, ".usejunction", "bin", "usejunction")
	}
	if format == "json" {
		printJSON(map[string]any{
			"ok":       true,
			"adminUrl": adminURL,
			"cliPath":  cliPath,
		})
		return nil
	}
	ui.SuccessBox(adminURL, cliPath)
	return nil
}

func runOnboard() error {
	if onboardToken == "" {
		return fmt.Errorf("--token is required")
	}

	if format == "json" {
		res, err := doEnroll(enrollOptions{
			Token:         onboardToken,
			URL:           onboardURL,
			Email:         onboardEmail,
			Name:          onboardName,
			Setup:         true,
			Quiet:         true,
			NoReportPrint: true,
		})
		if err != nil {
			return err
		}
		tools := detectTools()
		printJSON(map[string]any{
			"deviceId":      res.cfg.DeviceID,
			"orgId":         res.cfg.OrgID,
			"agentVersion":  config.Version,
			"toolsDetected": len(tools),
			"tools":         tools,
		})
		return nil
	}

	ui.Banner()

	enrollStep := ui.StepStart("Enrolling device")
	res, err := doEnroll(enrollOptions{
		Token:         onboardToken,
		URL:           onboardURL,
		Email:         onboardEmail,
		Name:          onboardName,
		Setup:         false,
		Quiet:         true,
		NoReportPrint: true,
	})
	if err != nil {
		enrollStep.Fail(err.Error())
		return err
	}
	enrollStep.Done(fmt.Sprintf("device %s", res.cfg.DeviceID))
	ui.QuietLine("Config saved to " + config.ConfigPath())

	setupStep := ui.StepStart("Configuring local tools")
	if err := configure.RunSetup(res.cfg, configure.SetupOptions{EnableOtel: true}); err != nil {
		setupStep.Fail(err.Error())
		ui.WarnLine(fmt.Sprintf("setup warning: %v", err))
	} else {
		setupStep.Done("Claude OTEL ready")
	}

	reportStep := ui.StepStart("Uploading initial usage")
	stats, err := runInitialReport(true)
	if err != nil {
		reportStep.Fail(err.Error())
		ui.WarnLine(fmt.Sprintf("initial report warning: %v", err))
	} else {
		reportStep.Done(fmt.Sprintf("%d tools · %d accounts · %d quotas · %d usage rows",
			stats.Tools, stats.Accounts, stats.Quotas, stats.Usage))
	}

	scanStep := ui.StepStart("Scanning AI coding tools")
	tools := detectTools()
	scanStep.Done(fmt.Sprintf("%d found", len(tools)))
	fmt.Println()
	for _, t := range tools {
		ui.ToolReveal(t.ToolName, t.Configured)
	}

	ui.StatusSummary(res.cfg.DeviceID, res.cfg.OrgID, config.Version, len(tools))
	return nil
}

func detectTools() []types.ToolStatus {
	ctx := context.Background()
	var tools []types.ToolStatus
	for _, p := range providers.All() {
		s, err := p.Detect(ctx)
		if err != nil || s == nil || !s.Detected {
			continue
		}
		tools = append(tools, *s)
	}
	return tools
}

func init() {
	onboardCmd.Flags().StringVar(&onboardToken, "token", "", "Enrollment token (required unless --complete)")
	onboardCmd.Flags().StringVar(&onboardURL, "url", "", "Control plane URL")
	onboardCmd.Flags().StringVar(&onboardEmail, "email", "", "Developer email")
	onboardCmd.Flags().StringVar(&onboardName, "name", "", "Developer name")
	onboardCmd.Flags().BoolVar(&onboardComplete, "complete", false, "Print the post-install success panel only")
	rootCmd.AddCommand(onboardCmd)
}
