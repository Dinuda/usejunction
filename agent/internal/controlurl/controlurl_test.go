package controlurl

import "testing"

func TestValidateAllowsHTTPSAndLoopbackHTTP(t *testing.T) {
	for _, raw := range []string{"https://app.example.com", "http://localhost:3001", "http://127.0.0.1:3001", "http://[::1]:3001"} {
		if err := Validate(raw); err != nil {
			t.Fatalf("Validate(%q) = %v", raw, err)
		}
	}
}

func TestValidateRejectsRemoteHTTP(t *testing.T) {
	for _, raw := range []string{"http://192.168.1.10:3001", "http://example.com", "ftp://example.com"} {
		if err := Validate(raw); err == nil {
			t.Fatalf("Validate(%q) succeeded, want error", raw)
		}
	}
}
