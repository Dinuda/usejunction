package providers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/usejunction/agent/internal/types"
)

const lmStudioBaseURL = "http://localhost:1234"

type LMStudioProvider struct{}

func (p *LMStudioProvider) ID() string { return "lmstudio" }

func (p *LMStudioProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(lmStudioBaseURL + "/v1/models")
	if err != nil {
		return &types.ToolStatus{ToolName: p.ID(), Detected: false}, nil
	}
	defer resp.Body.Close()
	return &types.ToolStatus{
		ToolName: p.ID(),
		Detected: resp.StatusCode == http.StatusOK,
	}, nil
}

// LocalModels lists models loaded in LM Studio.
func (p *LMStudioProvider) LocalModels(ctx context.Context) ([]types.LocalModelInfo, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(lmStudioBaseURL + "/v1/models")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var out struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	models := make([]types.LocalModelInfo, 0, len(out.Data))
	for _, m := range out.Data {
		models = append(models, types.LocalModelInfo{
			Provider:  "lmstudio",
			ModelName: m.ID,
			Running:   true,
		})
	}
	return models, nil
}

func (p *LMStudioProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "local"}, nil
}

func (p *LMStudioProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	return nil, nil
}

func (p *LMStudioProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return nil, nil
}
