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
	Short: "UseJunction local agent for AI coding observability",
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	rootCmd.PersistentFlags().StringVar(&format, "format", "text", "Output format: text|json")
	rootCmd.PersistentFlags().BoolVar(&verbose, "verbose", false, "Verbose output")
	rootCmd.PersistentFlags().BoolVar(&noColor, "no-color", false, "Disable colors")
}

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func hostname() string {
	h, _ := os.Hostname()
	if h == "" {
		return "unknown"
	}
	return h
}

func platformInfo() (osName, arch string) {
	return runtime.GOOS, runtime.GOARCH
}

func requireConfig() (*config.Config, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, fmt.Errorf("not enrolled — run: usejunction enroll --token <token>")
	}
	return cfg, nil
}
