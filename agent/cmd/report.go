package cmd

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/localsync"
	ujsignals "github.com/usejunction/agent/internal/signals"
	"github.com/usejunction/agent/internal/uninstall"
	"github.com/usejunction/agent/internal/updater"
)

const (
	heartbeatInterval  = 15 * time.Minute
	collectionInterval = 30 * time.Minute
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
		syncFn := func(ctx context.Context, refresh bool, progress localsync.ProgressFunc) (int, int, int, int, []string, error) {
			return collectAndReportWithProgress(ctx, api, refresh, progress)
		}

		go func() {
			srv := localsync.New(cfg, syncFn)
			fmt.Printf("Local sync endpoint: %s\n", cfg.LocalSyncURL())
			if err := srv.ListenAndServe(); err != nil {
				fmt.Printf("[daemon] local sync server stopped: %v\n", err)
			}
		}()

		if _, err := updater.ConfirmPending(cfg, api, config.Version); err != nil && verbose {
			fmt.Printf("[daemon] update confirmation: %v\n", err)
		}

		// Register endpoint on the control plane immediately and apply an eligible update.
		if response, err := heartbeat(api); err != nil {
			if errors.Is(err, client.ErrUnauthorized) {
				fmt.Println("Device credentials revoked; uninstalling…")
				return uninstall.Run(verbose)
			}
			if verbose {
				fmt.Printf("[daemon] initial heartbeat: %v\n", err)
			}
		} else if response.Uninstall {
			fmt.Println("Control plane requested uninstall; removing agent…")
			return uninstall.Run(verbose)
		} else if updated, updateErr := applyUpdate(cmd.Context(), cfg, api, response.Update); updateErr != nil {
			if verbose {
				fmt.Printf("[daemon] automatic update: %v\n", updateErr)
			}
		} else if updated {
			fmt.Printf("Updated UseJunction agent; restarting service…\n")
			return nil
		}
		go ujsignals.NewRunner(api, cfg, verbose).Run(context.Background())

		fmt.Println("Starting UseJunction daemon (Ctrl-C to stop)…")
		if _, _, _, _, err := collectAndReport(api, true); err != nil && verbose {
			fmt.Printf("[daemon] initial collect error: %v\n", err)
		}

		heartbeatTicker := time.NewTicker(heartbeatInterval)
		collectionTicker := time.NewTicker(collectionInterval)
		defer heartbeatTicker.Stop()
		defer collectionTicker.Stop()

		for {
			var loopErr error
			select {
			case <-heartbeatTicker.C:
				var response *client.HeartbeatResponse
				response, loopErr = heartbeat(api)
				if errors.Is(loopErr, client.ErrUnauthorized) {
					fmt.Println("Device credentials revoked; uninstalling…")
					return uninstall.Run(verbose)
				}
				if loopErr == nil {
					if response.Uninstall {
						fmt.Println("Control plane requested uninstall; removing agent…")
						return uninstall.Run(verbose)
					}
					if _, confirmErr := updater.ConfirmPending(cfg, api, config.Version); confirmErr != nil && verbose {
						fmt.Printf("[daemon] update confirmation: %v\n", confirmErr)
					}
					var updated bool
					updated, loopErr = applyUpdate(cmd.Context(), cfg, api, response.Update)
					if updated {
						fmt.Printf("Updated UseJunction agent; restarting service…\n")
						return nil
					}
				}
			case <-collectionTicker.C:
				// Rescan every 30 minutes; usage/work uploads stay incremental
				// (fingerprint deltas + ObservedAt watermark).
				_, _, _, _, loopErr = collectAndReport(api, true)
			case <-cmd.Context().Done():
				return nil
			}
			if loopErr != nil && verbose {
				fmt.Printf("[daemon] report error: %v\n", loopErr)
			}
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
	_, err := heartbeat(api)
	return err
}

func heartbeat(api *client.APIClient) (*client.HeartbeatResponse, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	if changed, err := cfg.EnsureLocalSyncCredentials(); err != nil {
		return nil, err
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

func applyUpdate(ctx context.Context, cfg *config.Config, api *client.APIClient, directive *client.AgentUpdateDirective) (bool, error) {
	if directive == nil {
		return false, nil
	}
	updated, err := updater.Apply(ctx, cfg, updater.ApplyOptions{
		Directive: *directive, CurrentVersion: config.Version,
		ControlPlaneURL: cfg.ControlPlaneURL, Reporter: api,
	})
	if errors.Is(err, updater.ErrBlockedVersion) {
		return false, nil
	}
	return updated, err
}

func init() {
	rootCmd.AddCommand(reportCmd)
	rootCmd.AddCommand(daemonCmd)
}
