package client

import (
	"fmt"
	"testing"
)

func TestIsPayloadTooLarge(t *testing.T) {
	if !isPayloadTooLarge(fmt.Errorf(`POST /api/ingest/sync/usage/chunk returned 413: {"error":"request body too large"}`)) {
		t.Fatal("413 status should match")
	}
	if isPayloadTooLarge(fmt.Errorf("POST /api/ingest/sync/usage/chunk returned 500: boom")) {
		t.Fatal("500 should not match")
	}
}
