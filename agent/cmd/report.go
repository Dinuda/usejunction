package cmd

import (
	"context"
	"fmt"
	"time"

	"github.com/spf13/cobra"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
	"github.com/usejunction/agent/internal/providers"
)

var reportCmd = &cobra.Command{
	Use:    "report",
	Short:  "Send one heartbeat + tool/model report to the control plane",
	Hidden: true,
	RunE:   runReport,
}

var daemonCmd = &cobra.Command{
	Use:    "daemon",
	Short:  "Run the reporting loop every 60 seconds",
	Hidden: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Starting UseJunction daemon (Ctrl-C to stop)…")
		for {
			if err := runReport(cmd, args); err != nil && verbose {
				fmt.Printf("[daemon] report error: %v\n", err)
			}
			time.Sleep(60 * time.Second)
		}
	},
}

func runReport(cmd *cobra.Command, args []string) error {
	cfg, err := requireConfig()
	if err != nil {
		return err
	}
	ctx := context.Background()
	api := client.New(cfg)

	osName, arch := platformInfo()
	if err := api.Heartbeat(client.HeartbeatPayload{
		Hostname:     hostname(),
		OS:           osName,
		Architecture: arch,
		AgentVersion: config.Version,
	}); err != nil {
		return fmt.Errorf("heartbeat: %w", err)
	}

	var tools []client.ToolReport
	var accounts []client.AccountReport
	var models []client.LocalModelReport

	for _, p := range providers.All() {
		status, _ := p.Detect(ctx)
		if status != nil {
			tools = append(tools, client.ToolReport{
				ToolName:   status.ToolName,
				Detected:   status.Detected,
				Configured: status.Configured,
				ConfigPath: status.ConfigPath,
				Version:    status.Version,
			})
		}

		if acc, _ := p.AccountIdentity(ctx); acc != nil && acc.AuthPresent {
			accounts = append(accounts, client.AccountReport{
				ToolName:    acc.ToolName,
				Email:       acc.Email,
				Plan:        acc.Plan,
				LoginMethod: acc.LoginMethod,
				AuthPresent: acc.AuthPresent,
			})
		}

		// Collect local models from Ollama and LM Studio.
		if o, ok := p.(*providers.OllamaProvider); ok {
			if ms, err := o.LocalModels(ctx); err == nil {
				for _, m := range ms {
					models = append(models, client.LocalModelReport{
						Provider:  m.Provider,
						ModelName: m.ModelName,
						Size:      m.Size,
						Running:   m.Running,
					})
				}
			}
		}
		if l, ok := p.(*providers.LMStudioProvider); ok {
			if ms, err := l.LocalModels(ctx); err == nil {
				for _, m := range ms {
					models = append(models, client.LocalModelReport{
						Provider:  m.Provider,
						ModelName: m.ModelName,
						Running:   m.Running,
					})
				}
			}
		}
	}

	_ = api.ReportTools(tools)
	if len(accounts) > 0 {
		_ = api.ReportAccounts(accounts)
	}
	if len(models) > 0 {
		_ = api.ReportLocalModels(models)
	}

	if format == "json" {
		printJSON(map[string]any{
			"ok":     true,
			"tools":  len(tools),
			"models": len(models),
		})
	}
	return nil
}

func init() {
	rootCmd.AddCommand(reportCmd)
	rootCmd.AddCommand(daemonCmd)
}
