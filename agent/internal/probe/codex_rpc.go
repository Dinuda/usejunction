package probe

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync/atomic"
	"time"

	"github.com/usejunction/agent/internal/types"
)

var rpcRequestID atomic.Uint64

func runCodexAppServerRPC(ctx context.Context, method string, params map[string]any) (map[string]any, error) {
	execPath, err := exec.LookPath("codex")
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, execPath, "-s", "read-only", "-a", "untrusted", "app-server")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		return nil, err
	}

	reader := bufio.NewReader(stdout)
	write := func(msg map[string]any) error {
		data, err := json.Marshal(msg)
		if err != nil {
			return err
		}
		_, err = stdin.Write(append(data, '\n'))
		return err
	}

	id := rpcRequestID.Add(1)
	if err := write(map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  "initialize",
		"params": map[string]any{
			"clientInfo": map[string]any{"name": "usejunction-agent", "version": "0.1.0"},
		},
	}); err != nil {
		_ = cmd.Process.Kill()
		return nil, err
	}
	if _, err := readRPCResponse(reader, id); err != nil {
		_ = cmd.Process.Kill()
		return nil, err
	}
	if err := write(map[string]any{"jsonrpc": "2.0", "method": "initialized"}); err != nil {
		_ = cmd.Process.Kill()
		return nil, err
	}

	reqID := rpcRequestID.Add(1)
	req := map[string]any{"jsonrpc": "2.0", "id": reqID, "method": method}
	if params != nil {
		req["params"] = params
	}
	if err := write(req); err != nil {
		_ = cmd.Process.Kill()
		return nil, err
	}
	resp, err := readRPCResponse(reader, reqID)
	_ = stdin.Close()
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	return resp, err
}

func readRPCResponse(reader *bufio.Reader, id uint64) (map[string]any, error) {
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		line, err := reader.ReadString('\n')
		if err != nil {
			return nil, err
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var msg map[string]any
		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			continue
		}
		if msg["id"] == nil {
			continue
		}
		var msgID uint64
		switch v := msg["id"].(type) {
		case float64:
			msgID = uint64(v)
		case json.Number:
			n, _ := v.Int64()
			msgID = uint64(n)
		default:
			continue
		}
		if msgID != id {
			continue
		}
		if errObj, ok := msg["error"].(map[string]any); ok {
			return nil, fmt.Errorf("rpc error: %v", errObj["message"])
		}
		result, ok := msg["result"].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("rpc missing result")
		}
		return result, nil
	}
	return nil, fmt.Errorf("rpc timeout")
}

func probeCodexRPC(ctx context.Context) ([]types.QuotaSnapshot, error) {
	limits, _, err := fetchCodexRateLimitsRPC(ctx)
	if err != nil {
		return nil, err
	}
	var snapshots []types.QuotaSnapshot
	for windowType, window := range limits {
		snapshots = append(snapshots, types.QuotaSnapshot{
			ToolName:    "codex",
			WindowType:  windowType,
			UsedPercent: floatPtr(window.UsedPercent),
			ResetAt:     window.ResetAt,
			Source:      "cli_rpc",
		})
	}
	return snapshots, nil
}

func fetchCodexRateLimitsRPC(ctx context.Context) (map[string]rpcWindow, map[string]any, error) {
	result, err := runCodexAppServerRPC(ctx, "account/rateLimits/read", nil)
	if err != nil {
		return nil, nil, err
	}
	windows := map[string]rpcWindow{}
	if primary, ok := result["primary_window"].(map[string]any); ok {
		windows["session_5h"] = rpcWindow{
			UsedPercent: numberValue(primary["used_percent"]),
			ResetAt:     strPtr(parseUnixOrRFC3339(stringValue(primary["reset_at"])).UTC().Format(time.RFC3339)),
		}
	}
	if secondary, ok := result["secondary_window"].(map[string]any); ok {
		windows["weekly"] = rpcWindow{
			UsedPercent: numberValue(secondary["used_percent"]),
			ResetAt:     strPtr(parseUnixOrRFC3339(stringValue(secondary["reset_at"])).UTC().Format(time.RFC3339)),
		}
	}
	account, _ := runCodexAppServerRPC(ctx, "account/read", nil)
	return windows, account, nil
}
