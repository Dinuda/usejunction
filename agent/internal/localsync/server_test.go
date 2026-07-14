package localsync

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/usejunction/agent/internal/config"
)

func TestOriginAllowed(t *testing.T) {
	s := New(&config.Config{ControlPlaneURL: "https://app.usejunction.com"}, func(bool) (int, int, int, int, error) {
		return 0, 0, 0, 0, nil
	})
	if !s.originAllowed("https://app.usejunction.com") {
		t.Fatal("control plane origin should be allowed")
	}
	if !s.originAllowed("http://localhost:3001") {
		t.Fatal("local admin origin should be allowed")
	}
	if s.originAllowed("https://evil.example") {
		t.Fatal("foreign origin must be denied")
	}
}

func TestAuthorizeBearer(t *testing.T) {
	s := New(&config.Config{LocalSyncToken: "uj_local_secret"}, func(bool) (int, int, int, int, error) {
		return 1, 2, 3, 4, nil
	})
	req := httptest.NewRequest(http.MethodPost, "/v1/sync", nil)
	req.Header.Set("Authorization", "Bearer uj_local_secret")
	if !s.authorize(req) {
		t.Fatal("expected bearer auth to pass")
	}
	req.Header.Set("Authorization", "Bearer wrong")
	if s.authorize(req) {
		t.Fatal("expected bearer auth to fail")
	}
}
