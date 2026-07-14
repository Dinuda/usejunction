// Package localsync runs a localhost-only HTTP server so the dashboard can
// trigger an on-demand collect and bounce metrics to the control plane.
package localsync

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/usejunction/agent/internal/config"
)

// SyncFunc runs a collect+report cycle. refresh=true bypasses usage caches.
type SyncFunc func(refresh bool) (tools, accounts, quotas, usage int, err error)

// Server is the loopback metrics trigger.
type Server struct {
	cfg    *config.Config
	syncFn SyncFunc
	mu     sync.Mutex
	last   time.Time
}

// New creates a localsync server. syncFn must be non-nil.
func New(cfg *config.Config, syncFn SyncFunc) *Server {
	return &Server{cfg: cfg, syncFn: syncFn}
}

// ListenAndServe binds 127.0.0.1 only and serves until the listener fails.
func (s *Server) ListenAndServe() error {
	port := s.cfg.LocalSyncPort
	if port <= 0 {
		port = config.DefaultLocalSyncPort
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return err
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.withCORS(s.handleHealth))
	mux.HandleFunc("/v1/sync", s.withCORS(s.handleSync))
	mux.HandleFunc("/v1/metrics", s.withCORS(s.handleMetrics))
	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	return srv.Serve(ln)
}

func (s *Server) withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if s.originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func (s *Server) originAllowed(origin string) bool {
	if origin == "" {
		return false
	}
	allowed := []string{s.cfg.ControlPlaneURL}
	if s.cfg.GatewayURL != "" {
		allowed = append(allowed, s.cfg.GatewayURL)
	}
	// Common local admin ports during development.
	allowed = append(allowed, "http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001")
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	for _, a := range allowed {
		au, err := url.Parse(a)
		if err != nil || au.Scheme == "" || au.Host == "" {
			continue
		}
		if strings.EqualFold(au.Scheme, u.Scheme) && strings.EqualFold(au.Host, u.Host) {
			return true
		}
	}
	return false
}

func (s *Server) authorize(r *http.Request) bool {
	token := strings.TrimSpace(s.cfg.LocalSyncToken)
	if token == "" {
		return false
	}
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		got := strings.TrimSpace(auth[7:])
		return got == token
	}
	if q := r.URL.Query().Get("token"); q != "" {
		return q == token
	}
	return false
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"version": config.Version,
		"device":  s.cfg.DeviceID,
	})
}

func (s *Server) handleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	refresh := r.URL.Query().Get("refresh") == "1" || r.URL.Query().Get("refresh") == "true"

	s.mu.Lock()
	if !refresh && time.Since(s.last) < 30*time.Second {
		last := s.last
		s.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         true,
			"debounced":  true,
			"observedAt": last.UTC().Format(time.RFC3339),
		})
		return
	}
	s.mu.Unlock()

	tools, accounts, quotas, usage, err := s.syncFn(refresh)
	now := time.Now().UTC()
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}
	s.mu.Lock()
	s.last = now
	s.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"tools":      tools,
		"accounts":   accounts,
		"quotas":     quotas,
		"usageRows":  usage,
		"observedAt": now.Format(time.RFC3339),
	})
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"deviceId": s.cfg.DeviceID,
		"endpoint": s.cfg.LocalSyncURL(),
		"note":     "Use POST /v1/sync to collect and bounce metrics",
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}