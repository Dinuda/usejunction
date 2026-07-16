package cmd

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/updater"
)

var (
	updateCheck    bool
	updateRollback bool
	updateForce    bool
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Check, install, or roll back the UseJunction agent",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := requireConfig()
		if err != nil {
			return err
		}
		api := client.New(cfg)
		if updateRollback {
			if err := updater.Rollback(cfg, api, ""); err != nil {
				return err
			}
			if err := restartBackgroundAgent(); err != nil && verbose {
				fmt.Printf("rollback installed; restart warning: %v\n", err)
			}
			fmt.Println("Rolled back the UseJunction agent. The rejected version is blocked until a newer release or --force.")
			return nil
		}

		directive, err := api.CheckAgentUpdate()
		if err != nil {
			return err
		}
		if directive == nil {
			if format == "json" {
				printJSON(map[string]any{"updateAvailable": false, "currentVersion": config.Version})
			} else {
				fmt.Printf("UseJunction agent v%s is current.\n", config.Version)
			}
			return nil
		}
		if updateCheck {
			if format == "json" {
				printJSON(map[string]any{"updateAvailable": true, "currentVersion": config.Version, "targetVersion": directive.TargetVersion, "urgency": directive.Urgency})
			} else {
				fmt.Printf("Update available: v%s → v%s (%s).\n", config.Version, directive.TargetVersion, directive.Urgency)
			}
			return nil
		}

		updated, err := updater.Apply(cmd.Context(), cfg, updater.ApplyOptions{
			Directive: *directive, CurrentVersion: config.Version, ControlPlaneURL: cfg.ControlPlaneURL,
			Reporter: api, Force: updateForce,
		})
		if errors.Is(err, updater.ErrBlockedVersion) {
			return fmt.Errorf("version %s is blocked after rollback; use --force to reinstall it", directive.TargetVersion)
		}
		if err != nil {
			return err
		}
		if !updated {
			return nil
		}
		if err := restartBackgroundAgent(); err != nil && verbose {
			fmt.Printf("update installed; restart warning: %v\n", err)
		}
		fmt.Printf("Installed UseJunction agent v%s. The background service is restarting.\n", directive.TargetVersion)
		return nil
	},
}

func restartBackgroundAgent() error {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		label := fmt.Sprintf("gui/%d/com.usejunction.agent", os.Getuid())
		if err := exec.Command("launchctl", "kickstart", "-k", label).Run(); err == nil {
			return nil
		}
		plist := filepath.Join(home, "Library", "LaunchAgents", "com.usejunction.agent.plist")
		return exec.Command("launchctl", "load", plist).Run()
	case "linux":
		return exec.CommandContext(context.Background(), "systemctl", "--user", "restart", "usejunction-agent.service").Run()
	default:
		return fmt.Errorf("automatic restart is unsupported on %s", runtime.GOOS)
	}
}

func init() {
	updateCmd.Flags().BoolVar(&updateCheck, "check", false, "Check for an update without installing it")
	updateCmd.Flags().BoolVar(&updateRollback, "rollback", false, "Restore the previous agent binary")
	updateCmd.Flags().BoolVar(&updateForce, "force", false, "Install a version blocked after rollback")
	rootCmd.AddCommand(updateCmd)
}
