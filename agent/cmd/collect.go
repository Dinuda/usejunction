package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/probe"
	"github.com/usejunction/agent/internal/providers"
	"github.com/usejunction/agent/internal/types"
)

func mergeToolAccounts(base, richer *types.ToolAccount) *types.ToolAccount {
	if base == nil && richer == nil {
		return nil
	}
	if base == nil {
		return richer
	}
	if richer == nil {
		return base
	}
	out := *base
	if strings.TrimSpace(out.Email) == "" {
		out.Email = richer.Email
	}
	if strings.TrimSpace(out.Plan) == "" {
		out.Plan = richer.Plan
	}
	if richer.AuthPresent {
		out.AuthPresent = true
	}
	return &out
}

func accountFromProbe(ctx context.Context, p providers.Provider) *types.ToolAccount {
	switch p.ID() {
	case "cursor":
		_, probeAcc, err := probe.ProbeCursorQuota(ctx)
		if err == nil {
			return probeAcc
		}
	case "codex":
		_, probeAcc, err := probe.ProbeCodexQuota(ctx, codexHomeForProbe())
		if err == nil {
			return probeAcc
		}
	}
	return nil
}

func codexHomeForProbe() string {
	if h := os.Getenv("CODEX_HOME"); h != "" {
		return h
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".codex")
}

// collectAndReport gathers telemetry from all providers and posts to the control plane.
// When refresh is false, providers may use on-disk usage caches.
func collectAndReport(api *client.APIClient, refresh bool) (tools int, accounts int, quotas int, usage int, err error) {
	ctx := context.Background()

	if err = sendHeartbeat(api); err != nil {
		return 0, 0, 0, 0, fmt.Errorf("heartbeat: %w", err)
	}

	var toolReports []client.ToolReport
	var accountReports []client.AccountReport
	var modelReports []client.LocalModelReport
	var usageReports []client.UsageAggregate
	var quotaReports []client.QuotaReport

	for _, p := range providers.All() {
		status, _ := p.Detect(ctx)
		if status == nil || !status.Detected {
			continue
		}

		toolReports = append(toolReports, client.ToolReport{
			ToolName:   status.ToolName,
			Detected:   true,
			Configured: status.Configured,
			ConfigPath: status.ConfigPath,
			Version:    status.Version,
		})

		acc, _ := p.AccountIdentity(ctx)
		acc = mergeToolAccounts(acc, accountFromProbe(ctx, p))
		if acc != nil && acc.AuthPresent {
			accountReports = append(accountReports, client.AccountReport{
				ToolName:    acc.ToolName,
				Email:       acc.Email,
				Plan:        acc.Plan,
				LoginMethod: acc.LoginMethod,
				AuthPresent: acc.AuthPresent,
			})
		}

		if snaps, _ := p.ProbeQuota(ctx); len(snaps) > 0 {
			for _, snap := range snaps {
				quotaReports = append(quotaReports, client.QuotaReport{
					ToolName:         snap.ToolName,
					WindowType:       snap.WindowType,
					UsedPercent:      snap.UsedPercent,
					ResetAt:          snap.ResetAt,
					CreditsRemaining: snap.CreditsRemaining,
					Source:           snap.Source,
				})
			}
		}

		if daily, scanErr := p.ScanLocalUsage(ctx, refresh); scanErr == nil {
			for _, row := range daily {
				usageReports = append(usageReports, usageToAggregate(row))
			}
		}

		if o, ok := p.(*providers.OllamaProvider); ok {
			if ms, localErr := o.LocalModels(ctx); localErr == nil {
				for _, m := range ms {
					modelReports = append(modelReports, client.LocalModelReport{
						Provider:  m.Provider,
						ModelName: m.ModelName,
						Size:      m.Size,
						Running:   m.Running,
					})
				}
			}
		}
		if l, ok := p.(*providers.LMStudioProvider); ok {
			if ms, localErr := l.LocalModels(ctx); localErr == nil {
				for _, m := range ms {
					modelReports = append(modelReports, client.LocalModelReport{
						Provider:  m.Provider,
						ModelName: m.ModelName,
						Running:   m.Running,
					})
				}
			}
		}
	}

	if err := api.ReportTools(toolReports); err != nil {
		return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), fmt.Errorf("tools: %w", err)
	}
	if len(accountReports) > 0 {
		if err := api.ReportAccounts(accountReports); err != nil {
			return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), fmt.Errorf("accounts: %w", err)
		}
	}
	if len(quotaReports) > 0 {
		if err := api.ReportQuotas(quotaReports); err != nil {
			return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), fmt.Errorf("quotas: %w", err)
		}
	}
	if len(modelReports) > 0 {
		if err := api.ReportLocalModels(modelReports); err != nil && verbose {
			fmt.Printf("[report] models: %v\n", err)
		}
	}
	if len(usageReports) > 0 {
		if err := api.ReportLocalUsage(usageReports); err != nil {
			return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), fmt.Errorf("usage: %w", err)
		}
	}

	return len(toolReports), len(accountReports), len(quotaReports), len(usageReports), nil
}