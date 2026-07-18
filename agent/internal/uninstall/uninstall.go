package uninstall

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/configure"
)

// Run restores tool configs, removes agent data, and stops background services.
func Run(verbose bool) error {
	fmt.Println("Restoring legacy tool config backups…")
	if err := configure.UnconfigureAll(); err != nil && verbose {
		fmt.Printf("  warning: %v\n", err)
	}

	fmt.Println("Removing ~/.usejunction…")
	_ = os.RemoveAll(config.ConfigDir())

	stopServices()

	fmt.Println("UseJunction agent uninstalled.")
	return nil
}

func stopServices() {
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
