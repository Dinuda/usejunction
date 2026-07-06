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
	Short:  "Send heartbeat and status to control plane (used by background service)",
	Hidden: true,
	RunE: func(cmd *cobra.Command, args []string) error {
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
		var quotas []client.QuotaReport
		var models []client.LocalModelReport
		var usageAggs []client.UsageAggregate

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
			if qs, _ := p.ProbeQuota(ctx); len(qs) > 0 {
				for _, q := range qs {
					quotas = append(quotas, client.QuotaReport{
						ToolName:         q.ToolName,
						WindowType:       q.WindowType,
						UsedPercent:      q.UsedPercent,
						ResetAt:          q.ResetAt,
						CreditsRemaining: q.CreditsRemaining,
						Source:           q.Source,
					})
				}
			}
			if usage, _ := p.ScanLocalUsage(ctx, false); len(usage) > 0 {
				for _, u := range usage {
					usageAggs = append(usageAggs, client.UsageAggregate{
						Date:            u.Date,
						ToolName:        u.ToolName,
						Model:           u.Model,
						InputTokens:     u.InputTokens,
						OutputTokens:    u.OutputTokens,
						CacheReadTokens: u.CacheReadTokens,
						EstimatedCost:   u.EstimatedCost,
					})
				}
			}
			if o, ok := p.(*providers.OllamaProvider); ok {
				if ms, _ := o.LocalModels(ctx); len(ms) > 0 {
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
				if ms, _ := l.LocalModels(ctx); len(ms) > 0 {
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
		}

		_ = api.ReportTools(tools)
		_ = api.ReportAccounts(accounts)
		_ = api.ReportQuotas(quotas)
		_ = api.ReportLocalModels(models)
		_ = api.ReportLocalUsage(usageAggs)

		if format == "json" {
			printJSON(map[string]any{"ok": true, "tools": len(tools), "models": len(models)})
		}
		return nil
	},
}

var daemonCmd = &cobra.Command{
	Use:    "daemon",
	Short:  "Run periodic reporting loop",
	Hidden: true,
	RunE: func(cmd *cobra.Command, args []string) error {
		for {
			_ = reportCmd.RunE(cmd, args)
			time.Sleep(60 * time.Second)
		}
	},
}

func init() {
	rootCmd.AddCommand(reportCmd)
	rootCmd.AddCommand(daemonCmd)
}
