package cmd

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/ably/ably-go/ably"
	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/localsync"
)

func signalRemoteSync(ch chan<- struct{}) {
	select {
	case ch <- struct{}{}:
	default:
	}
}

func runRemoteSyncWorker(
	ctx context.Context,
	api *client.APIClient,
	doCollect func(context.Context, bool, localsync.ProgressFunc) (int, int, int, int, []string, error),
	signals <-chan struct{},
) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-signals:
			for len(signals) > 0 {
				<-signals
			}
			processRemoteSync(ctx, api, doCollect)
		}
	}
}

func processRemoteSync(
	ctx context.Context,
	api *client.APIClient,
	doCollect func(context.Context, bool, localsync.ProgressFunc) (int, int, int, int, []string, error),
) {
	claimCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	claim, err := api.ClaimRemoteSync(claimCtx)
	cancel()
	if err != nil {
		if verbose {
			fmt.Printf("[daemon] remote sync claim: %v\n", err)
		}
		return
	}
	if claim == nil || claim.LeaseToken == "" || len(claim.Targets) == 0 {
		return
	}

	targetIDs := make([]string, 0, len(claim.Targets))
	for _, target := range claim.Targets {
		targetIDs = append(targetIDs, target.ID)
	}
	reportCtx, reportCancel := context.WithTimeout(ctx, 20*time.Second)
	_, _ = api.ReportRemoteSync(reportCtx, client.RemoteSyncReport{
		LeaseToken: claim.LeaseToken,
		TargetIDs:  targetIDs,
		Status:     "running",
	})
	reportCancel()

	collectCtx, collectCancel := context.WithTimeout(ctx, collectTimeout)
	startedAt := time.Now()
	tools, accounts, quotas, usage, warnings, collectErr := doCollect(collectCtx, true, nil)
	collectCancel()
	if ctx.Err() != nil {
		return
	}

	status := "succeeded"
	errorMessage := ""
	if collectErr != nil && !errors.Is(collectErr, errUsageQueuePending) {
		status = "failed"
		errorMessage = collectErr.Error()
		if collectCtx.Err() == context.DeadlineExceeded {
			errorMessage = "remote sync collect timed out"
		}
	}
	report := client.RemoteSyncReport{
		LeaseToken:   claim.LeaseToken,
		TargetIDs:    targetIDs,
		Status:       status,
		Tools:        tools,
		Accounts:     accounts,
		Quotas:       quotas,
		UsageRows:    usage,
		Warnings:     warnings,
		ErrorMessage: errorMessage,
	}
	doneCtx, doneCancel := context.WithTimeout(ctx, 30*time.Second)
	if _, err := api.ReportRemoteSync(doneCtx, report); err != nil && verbose {
		fmt.Printf("[daemon] remote sync report: %v\n", err)
	}
	doneCancel()
	if verbose {
		fmt.Printf("[daemon] remote sync %s for %d request(s) after %s\n", status, len(targetIDs), time.Since(startedAt).Round(time.Second))
	}
}

func runRemoteSyncRealtime(ctx context.Context, api *client.APIClient, signals chan<- struct{}) {
	bootstrap, err := api.BootstrapRemoteSync(ctx)
	if err != nil {
		if verbose {
			fmt.Printf("[daemon] remote sync realtime disabled: %v\n", err)
		}
		return
	}
	if bootstrap == nil || bootstrap.Realtime.Provider != "ably" || len(bootstrap.Realtime.Channels) == 0 {
		return
	}

	authCallback := func(callbackCtx context.Context, _ ably.TokenParams) (ably.Tokener, error) {
		next, err := api.BootstrapRemoteSync(callbackCtx)
		if err != nil {
			return nil, err
		}
		req := next.Realtime.TokenRequest
		return ably.TokenRequest{
			TokenParams: ably.TokenParams{
				TTL:        req.TTL,
				Capability: req.Capability,
				ClientID:   req.ClientID,
				Timestamp:  req.Timestamp,
			},
			KeyName: req.KeyName,
			Nonce:   req.Nonce,
			MAC:     req.MAC,
		}, nil
	}

	realtime, err := ably.NewRealtime(
		ably.WithAuthCallback(authCallback),
		ably.WithAutoConnect(true),
	)
	if err != nil {
		if verbose {
			fmt.Printf("[daemon] remote sync realtime: %v\n", err)
		}
		return
	}
	defer realtime.Close()

	realtime.Connection.On(ably.ConnectionEventConnected, func(ably.ConnectionStateChange) {
		signalRemoteSync(signals)
	})
	for _, channelName := range bootstrap.Realtime.Channels {
		channel := realtime.Channels.Get(channelName)
		if _, err := channel.Subscribe(ctx, "sync-request", func(*ably.Message) {
			signalRemoteSync(signals)
		}); err != nil && verbose {
			fmt.Printf("[daemon] remote sync subscribe %s: %v\n", channelName, err)
		}
	}
	signalRemoteSync(signals)
	<-ctx.Done()
}
