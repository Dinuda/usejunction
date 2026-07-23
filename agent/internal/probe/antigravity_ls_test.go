package probe

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseAntigravityGeneratorMetadataJSON(t *testing.T) {
	raw := []byte(`{
	  "generatorMetadata": [
	    {
	      "chatModel": {
	        "model": "MODEL_PLACEHOLDER_M264",
	        "responseModel": "gemini-3.6-flash",
	        "usage": {
	          "model": "MODEL_PLACEHOLDER_M264",
	          "inputTokens": "12313",
	          "outputTokens": "305",
	          "thinkingOutputTokens": "251",
	          "cacheReadTokens": "100",
	          "responseId": "rid-1"
	        },
	        "chatStartMetadata": {"createdAt": "2026-07-22T18:39:16.573678Z"}
	      }
	    },
	    {
	      "chatModel": {
	        "model": "MODEL_PLACEHOLDER_M35",
	        "responseModel": "claude-sonnet-4-6",
	        "usage": {
	          "inputTokens": 100,
	          "outputTokens": 50,
	          "responseId": "rid-2"
	        },
	        "chatStartMetadata": {"createdAt": "2026-07-22T19:00:00Z"}
	      }
	    },
	    {
	      "chatModel": {
	        "usage": {"inputTokens": 0, "outputTokens": 0}
	      }
	    }
	  ]
	}`)
	events, err := parseAntigravityGeneratorMetadataJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 2 {
		t.Fatalf("events = %#v", events)
	}
	if events[0].Model != "gemini-3.6-flash" || events[0].Input != 12313 || events[0].Output != 305 || events[0].Reasoning != 251 || events[0].CacheRead != 100 {
		t.Fatalf("event0 = %#v", events[0])
	}
	if events[0].Date != "2026-07-22" || events[0].ResponseID != "rid-1" {
		t.Fatalf("event0 meta = %#v", events[0])
	}
	if events[1].Model != "claude-sonnet-4.6" || events[1].Input != 100 || events[1].Output != 50 {
		t.Fatalf("event1 = %#v", events[1])
	}
}

func TestParseAntigravityLSMainLog(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ls-main.log")
	content := strings.Join([]string{
		`2026-07-23 00:08:19.440 [info] [LS Main] Args: --csrf_token 947b5bbb-7184-4983-b021-e144b10bfcce --extension_server_port 65234`,
		`I0723 00:08:23.080790 26267 server.go:485] Language server listening on random port at 65239 for HTTPS (gRPC)`,
		`I0723 00:08:23.081044 26267 server.go:492] Language server listening on random port at 65240 for HTTP`,
		`2026-07-23 00:08:23.544 [info] [LS Main] LS started on port 65239`,
	}, "\n")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	ep, err := parseAntigravityLSMainLog(path)
	if err != nil {
		t.Fatal(err)
	}
	if ep.CSRF != "947b5bbb-7184-4983-b021-e144b10bfcce" {
		t.Fatalf("csrf = %q", ep.CSRF)
	}
	if ep.BaseURL != "http://127.0.0.1:65240" {
		t.Fatalf("base = %q", ep.BaseURL)
	}
}

func TestScanAntigravityUsageFromLSFixtureServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != antigravityLSGeneratorPath {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("x-codeium-csrf-token") != "test-csrf" {
			http.Error(w, `{"code":"unauthenticated"}`, http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"generatorMetadata":[{"chatModel":{"responseModel":"gemini-3.6-flash","usage":{"inputTokens":"10","outputTokens":"4","responseId":"a"},"chatStartMetadata":{"createdAt":"2026-07-22T12:00:00Z"}}}]}`))
	}))
	defer srv.Close()

	restore := SetAntigravityLSEndpointForTest(srv.URL, "test-csrf")
	defer restore()

	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "brain", "cascade-fixture"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("ANTIGRAVITY_CLI_ROOT", root)

	rows, err := ScanAntigravityUsageFromLS(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("rows = %#v", rows)
	}
	if rows[0].InputTokens != 10 || rows[0].OutputTokens != 4 || rows[0].Model != "gemini-3.6-flash" {
		t.Fatalf("row = %#v", rows[0])
	}
	if rows[0].Source != antigravityUsageSource {
		t.Fatalf("source = %q", rows[0].Source)
	}
}
