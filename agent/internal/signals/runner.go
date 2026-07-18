package signals

import (
	"context"
	"fmt"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
)

type Runner struct {
	api       *client.APIClient
	cfg       *config.Config
	collector Collector
	sessioner *Sessionizer
	pending   []client.SignalsSession
	verbose   bool
}

func NewRunner(api *client.APIClient, cfg *config.Config, verbose bool) *Runner {
	policy := Policy{CollectionMode: CollectionModeAppDomain}
	return &Runner{
		api:       api,
		cfg:       cfg,
		collector: NewCollector(),
		sessioner: NewSessionizer(policy, NoopBrowserContextProvider{}),
		verbose:   verbose,
	}
}

func (r *Runner) Run(ctx context.Context) {
	policyTicker := time.NewTicker(time.Minute)
	sampleTicker := time.NewTicker(2 * time.Second)
	uploadTicker := time.NewTicker(time.Minute)
	defer policyTicker.Stop()
	defer sampleTicker.Stop()
	defer uploadTicker.Stop()

	_ = r.refreshPolicy()
	for {
		select {
		case <-ctx.Done():
			r.pending = append(r.pending, r.sessioner.Flush(time.Now().UTC())...)
			_ = r.upload()
			return
		case <-policyTicker.C:
			_ = r.refreshPolicy()
		case <-sampleTicker.C:
			if !r.cfg.SignalsEnabled {
				continue
			}
			snapshot, err := r.collector.Snapshot()
			if err != nil {
				if r.verbose {
					fmt.Printf("[signals] collect: %v\n", err)
				}
				continue
			}
			r.pending = append(r.pending, r.sessioner.Observe(snapshot)...)
			if len(r.pending) >= 50 {
				_ = r.upload()
			}
		case <-uploadTicker.C:
			if !r.cfg.SignalsEnabled {
				continue
			}
			_ = r.upload()
		}
	}
}

func (r *Runner) refreshPolicy() error {
	policy, err := r.api.SignalsPolicy()
	if err != nil {
		if r.verbose {
			fmt.Printf("[signals] policy: %v\n", err)
		}
		return err
	}
	r.cfg.SignalsEnabled = policy.Enabled
	r.cfg.SignalsWorkExtraction = policy.WorkExtractionEnabled
	r.cfg.SignalsPolicyUpdatedAt = policy.UpdatedAt
	r.sessioner.SetPolicy(Policy{
		Enabled:         policy.Enabled,
		RetentionDays:   policy.RetentionDays,
		CollectionMode:  policy.CollectionMode,
		ExcludedApps:    policy.ExcludedApps,
		ExcludedDomains: policy.ExcludedDomains,
		UpdatedAt:       policy.UpdatedAt,
	})
	_ = config.Save(r.cfg)
	return nil
}

func (r *Runner) upload() error {
	if len(r.pending) == 0 {
		return nil
	}
	batchSize := len(r.pending)
	if batchSize > 500 {
		batchSize = 500
	}
	batch := append([]client.SignalsSession(nil), r.pending[:batchSize]...)
	if err := r.api.ReportSignalsSessions(batch); err != nil {
		if r.verbose {
			fmt.Printf("[signals] upload: %v\n", err)
		}
		return err
	}
	r.pending = r.pending[batchSize:]
	r.cfg.SignalsLastUploadAt = time.Now().UTC().Format(time.RFC3339)
	_ = config.Save(r.cfg)
	return nil
}
