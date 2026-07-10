package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/usejunction/agent/internal/types"
)

const ollamaBaseURL = "http://localhost:11434"

type OllamaProvider struct{}

func (p *OllamaProvider) ID() string { return "ollama" }

func (p *OllamaProvider) Detect(ctx context.Context) (*types.ToolStatus, error) {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(ollamaBaseURL + "/api/tags")
	if err != nil {
		return &types.ToolStatus{ToolName: p.ID(), Detected: false}, nil
	}
	defer resp.Body.Close()
	return &types.ToolStatus{
		ToolName: p.ID(),
		Detected: resp.StatusCode == http.StatusOK,
	}, nil
}

// LocalModels lists models currently available in Ollama.
func (p *OllamaProvider) LocalModels(ctx context.Context) ([]types.LocalModelInfo, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(ollamaBaseURL + "/api/tags")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var out struct {
		Models []struct {
			Name string `json:"name"`
			Size int64  `json:"size"`
		} `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	models := make([]types.LocalModelInfo, 0, len(out.Models))
	for _, m := range out.Models {
		sizeStr := ""
		if m.Size > 0 {
			sizeStr = fmt.Sprintf("%.1fGB", float64(m.Size)/(1024*1024*1024))
		}
		models = append(models, types.LocalModelInfo{
			Provider:  "ollama",
			ModelName: m.Name,
			Size:      sizeStr,
			Running:   true,
		})
	}
	return models, nil
}

func (p *OllamaProvider) AccountIdentity(ctx context.Context) (*types.ToolAccount, error) {
	return &types.ToolAccount{ToolName: p.ID(), LoginMethod: "local"}, nil
}

func (p *OllamaProvider) ProbeQuota(ctx context.Context) ([]types.QuotaSnapshot, error) {
	return nil, nil
}

func (p *OllamaProvider) ScanLocalUsage(ctx context.Context, refresh bool) ([]types.DailyUsage, error) {
	return nil, nil
}
