package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/configure"
)

var uninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Restore tool configs, remove agent data, and stop background services",
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Unconfiguring tools…")
		if err := configure.UnconfigureAll(); err != nil && verbose {
			fmt.Printf("  warning: %v\n", err)
		}

		fmt.Println("Removing ~/.usejunction…")
		_ = os.RemoveAll(config.ConfigDir())

		stopLaunchAgents()

		fmt.Println("UseJunction agent uninstalled.")
		return nil
	},
}

// stopLaunchAgents removes platform-specific background service registrations.
func stopLaunchAgents() {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "darwin":
		plist := filepath.Join(home, "Library", "LaunchAgents", "com.usejunction.agent.plist")
		_ = exec.Command("launchctl", "unload", plist).Run()
		_ = os.Remove(plist)
		fmt.Println("Removed launchd plist.")
	case "linux":
		unitFile := filepath.Join(home, ".config", "systemd", "user", "usejunction-agent.service")
		_ = exec.Command("systemctl", "--user", "disable", "--now", "usejunction-agent.service").Run()
		_ = os.Remove(unitFile)
		fmt.Println("Removed systemd user service.")
	}
}

func init() {
	rootCmd.AddCommand(uninstallCmd)
}
