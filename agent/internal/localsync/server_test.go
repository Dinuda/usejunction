package localsync

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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
	const secret = "uj_local_secret"
	s := New(&config.Config{LocalSyncToken: secret}, func(bool) (int, int, int, int, error) {
		return 1, 2, 3, 4, nil
	})
	expiresAt := time.Now().Add(time.Minute).Unix()
	payload := fmt.Sprintf("v1.%d.test-nonce", expiresAt)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	grant := payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	req := httptest.NewRequest(http.MethodPost, "/v1/sync", nil)
	req.Header.Set("Authorization", "Bearer "+grant)
	if !s.authorize(req) {
		t.Fatal("expected short-lived grant to pass")
	}
	req.Header.Set("Authorization", "Bearer wrong")
	if s.authorize(req) {
		t.Fatal("expected bearer auth to fail")
	}
	queryReq := httptest.NewRequest(http.MethodPost, "/v1/sync?token="+secret, nil)
	if s.authorize(queryReq) {
		t.Fatal("query-string credentials must be rejected")
	}
}

func TestExpiredGrantRejected(t *testing.T) {
	const secret = "uj_local_secret"
	expiresAt := time.Now().Add(-time.Minute).Unix()
	payload := fmt.Sprintf("v1.%d.test-nonce", expiresAt)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	grant := payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if validGrant(grant, secret, time.Now()) {
		t.Fatal("expired grant must be rejected")
	}
}
