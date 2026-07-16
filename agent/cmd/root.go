package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"runtime"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/config"
)

var (
	format  string
	verbose bool
	noColor bool
)

var rootCmd = &cobra.Command{
	Use:   "usejunction",
	Short: "UseJunction local agent — AI coding observability",
	Long: `UseJunction local agent detects AI coding tools on this device
and reports usage telemetry to the control plane.`,
}

// Execute is the entry point called by main.
func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.PersistentFlags().StringVar(&format, "format", "text", "Output format: text|json")
	rootCmd.PersistentFlags().BoolVar(&verbose, "verbose", false, "Verbose output")
	rootCmd.PersistentFlags().BoolVar(&noColor, "no-color", false, "Disable color output")
}

// printJSON pretty-prints v as indented JSON to stdout.
func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

// hostname returns the machine hostname or "unknown".
func hostname() string {
	h, _ := os.Hostname()
	if h == "" {
		return "unknown"
	}
	return h
}

// platformInfo returns the GOOS and GOARCH strings.
func platformInfo() (osName, arch string) {
	return runtime.GOOS, runtime.GOARCH
}

// requireConfig loads the config or returns a user-friendly error.
func requireConfig() (*config.Config, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("not enrolled — run: usejunction enroll --token <token>")
	}
	return cfg, nil
}
