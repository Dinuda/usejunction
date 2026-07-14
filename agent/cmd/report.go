package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/localsync"
)

var reportCmd = &cobra.Command{
	Use:    "report",
	Short:  "Send one heartbeat + tool/model report to the control plane",
	Hidden: true,
	RunE:   runReport,
}

var daemonCmd = &cobra.Command{
	Use:    "daemon",
	Short:  "Run the reporting loop and localhost sync endpoint",
	Hidden: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := requireConfig()
		if err != nil {
			return err
		}
		if changed, err := cfg.EnsureLocalSyncCredentials(); err != nil {
			return err
		} else if changed {
			if err := config.Save(cfg); err != nil {
				return err
			}
		}

		api := client.New(cfg)
		syncFn := func(refresh bool) (int, int, int, int, error) {
			return collectAndReport(api, refresh)
		}

		go func() {
			srv := localsync.New(cfg, syncFn)
			fmt.Printf("Local sync endpoint: %s\n", cfg.LocalSyncURL())
			if err := srv.ListenAndServe(); err != nil {
				fmt.Printf("[daemon] local sync server stopped: %v\n", err)
			}
		}()

		// Register endpoint on the control plane immediately.
		_ = sendHeartbeat(api)

		fmt.Println("Starting UseJunction daemon (Ctrl-C to stop)…")
		iteration := 0
		for {
			var loopErr error
			if iteration%15 == 0 {
				// Full collect every ~15 minutes (refresh caches).
				_, _, _, _, loopErr = collectAndReport(api, true)
			} else {
				loopErr = sendHeartbeat(api)
			}
			if loopErr != nil && verbose {
				fmt.Printf("[daemon] report error: %v\n", loopErr)
			}
			iteration++
			time.Sleep(60 * time.Second)
		}
	},
}

func runReport(cmd *cobra.Command, args []string) error {
	cfg, err := requireConfig()
	if err != nil {
		return err
	}
	if changed, err := cfg.EnsureLocalSyncCredentials(); err != nil {
		return err
	} else if changed {
		_ = config.Save(cfg)
	}
	tools, accounts, quotas, usage, err := collectAndReport(client.New(cfg), true)
	if err != nil {
		return err
	}
	if format == "json" {
		printJSON(map[string]any{
			"ok":       true,
			"tools":    tools,
			"accounts": accounts,
			"quotas":   quotas,
			"usage":    usage,
		})
	} else {
		fmt.Printf("Reported %d tool(s), %d account(s), %d quota window(s), %d usage row(s).\n", tools, accounts, quotas, usage)
	}
	return nil
}

func runHeartbeat() error {
	cfg, err := requireConfig()
	if err != nil {
		return err
	}
	return sendHeartbeat(client.New(cfg))
}

func sendHeartbeat(api *client.APIClient) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if changed, err := cfg.EnsureLocalSyncCredentials(); err != nil {
		return err
	} else if changed {
		_ = config.Save(cfg)
	}
	osName, arch := platformInfo()
	return api.Heartbeat(client.HeartbeatPayload{
		Hostname:       hostname(),
		OS:             osName,
		Architecture:   arch,
		AgentVersion:   config.Version,
		LocalEndpoint:  cfg.LocalSyncURL(),
		LocalSyncToken: cfg.LocalSyncToken,
	})
}

func init() {
	rootCmd.AddCommand(reportCmd)
	rootCmd.AddCommand(daemonCmd)
}
