package cmd

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

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
  2. Enable Claude Code OpenTelemetry metrics export
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

	setupStep := ui.StepStart("Enabling Claude Code metrics")
	setupErr := configure.RunSetup(res.cfg, configure.SetupOptions{EnableOtel: true})
	if setupErr != nil {
		setupStep.Fail(setupErr.Error())
		ui.WarnLine(fmt.Sprintf("setup warning: %v", setupErr))
	} else {
		setupStep.Done("OpenTelemetry usage export → UseJunction")
		ui.QuietLine("Writes ~/.usejunction/claude-env.sh so Claude Code can send usage metrics")
	}

	toolIDs := providerToolIDs()
	reportPanel := ui.ScanPanelStart("Uploading initial usage", toolIDs)
	stats, reportErr := runInitialReportWithProgress(true, func(step, message string) {
		switch step {
		case "scan-tool-start":
			reportPanel.ToolStart(message)
		case "scan-tool-done":
			reportPanel.ToolFinish(message, false)
		case "scan-tool-skip":
			reportPanel.ToolFinish(message, true)
		default:
			if label := humanizeCollectProgress(step, message); label != "" {
				reportPanel.Update(label)
			}
		}
	})

	tools := []types.ToolStatus{}
	if stats != nil {
		tools = stats.ToolList
	}
	if reportErr != nil {
		if errors.Is(reportErr, errUsageQueuePending) && stats != nil {
			reportPanel.Done(fmt.Sprintf("%d tools · %d accounts · %d quotas · %d usage rows (more queued)",
				stats.Tools, stats.Accounts, stats.Quotas, stats.Usage))
			ui.WarnLine(fmt.Sprintf("initial report warning: %v", reportErr))
		} else {
			reportPanel.Fail(reportErr.Error())
			ui.WarnLine(fmt.Sprintf("initial report warning: %v", reportErr))
		}
	} else if stats != nil {
		reportPanel.Done(fmt.Sprintf("%d tools · %d accounts · %d quotas · %d usage rows",
			stats.Tools, stats.Accounts, stats.Quotas, stats.Usage))
	} else {
		reportPanel.Done("")
	}

	scanStep := ui.StepStart("Scanning AI coding tools")
	if len(tools) == 0 {
		tools = detectTools()
	}
	scanStep.Done(fmt.Sprintf("%d found", len(tools)))
	fmt.Println()
	for _, t := range tools {
		ui.ToolReveal(t.ToolName, t.Configured)
	}

	ui.StatusSummary(res.cfg.DeviceID, res.cfg.OrgID, config.Version, len(tools))
	if reportErr != nil && !errors.Is(reportErr, errUsageQueuePending) {
		return fmt.Errorf("initial sync incomplete: %w", reportErr)
	}
	return nil
}

func providerToolIDs() []string {
	all := providers.All()
	ids := make([]string, 0, len(all))
	for _, p := range all {
		ids = append(ids, p.ID())
	}
	return ids
}

func detectTools() []types.ToolStatus {
	ctx := context.Background()
	providersList := providers.All()
	results := make([]types.ToolStatus, 0, len(providersList))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, p := range providersList {
		wg.Add(1)
		go func(prov providers.Provider) {
			defer wg.Done()
			s, err := prov.Detect(ctx)
			if err != nil || s == nil || !s.Detected {
				return
			}
			mu.Lock()
			results = append(results, *s)
			mu.Unlock()
		}(p)
	}
	wg.Wait()
	return results
}

// humanizeCollectProgress maps collect progress callbacks to short onboard labels.
func humanizeCollectProgress(step, message string) string {
	switch step {
	case "scan-tool-start", "scan-tool-done", "scan-tool-skip":
		return ""
	case "scan":
		// Tool rows in ScanPanel already cover per-tool scan progress.
		return ""
	}
	if strings.TrimSpace(message) != "" {
		return strings.TrimSpace(message)
	}
	switch step {
	case "heartbeat":
		return "Registering local agent"
	case "upload-tools":
		return "Preparing inventory"
	case "upload-models":
		return "Uploading local models"
	case "upload-usage":
		return "Syncing usage"
	case "work-extract":
		return "Extracting work sessions"
	case "complete":
		return "Finishing sync"
	default:
		return step
	}
}

func init() {
	onboardCmd.Flags().StringVar(&onboardToken, "token", "", "Enrollment token (required unless --complete)")
	onboardCmd.Flags().StringVar(&onboardURL, "url", "", "Control plane URL")
	onboardCmd.Flags().StringVar(&onboardEmail, "email", "", "Developer email")
	onboardCmd.Flags().StringVar(&onboardName, "name", "", "Developer name")
	onboardCmd.Flags().BoolVar(&onboardComplete, "complete", false, "Print the post-install success panel only")
	rootCmd.AddCommand(onboardCmd)
}
