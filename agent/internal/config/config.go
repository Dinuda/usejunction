package config

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Version is replaced by release builds through -ldflags. The fallback keeps
// local source builds and the first updater bootstrap identifiable.
var Version = "0.3.1"

// LocalSyncProtocol identifies the background-job localhost sync contract.
const LocalSyncProtocol = 2

// Config holds the persisted enrollment state.
type Config struct {
	ControlPlaneURL         string `json:"controlPlaneUrl"`
	DeviceToken             string `json:"deviceToken"`
	DeviceID                string `json:"deviceId"`
	UserID                  string `json:"userId"`
	OrgID                   string `json:"orgId"`
	GatewayURL              string `json:"gatewayUrl"`
	OtelEnabled             bool   `json:"otelEnabled,omitempty"`
	OtelMetricsEndpoint     string `json:"otelMetricsEndpoint,omitempty"`
	LocalSyncPort           int    `json:"localSyncPort,omitempty"`
	LocalSyncToken          string `json:"localSyncToken,omitempty"`
	SignalsEnabled          bool   `json:"signalsEnabled,omitempty"`
	SignalsWorkExtraction   bool   `json:"signalsWorkExtraction,omitempty"`
	SignalsPolicyUpdatedAt  string `json:"signalsPolicyUpdatedAt,omitempty"`
	SignalsLastUploadAt     string `json:"signalsLastUploadAt,omitempty"`
	WorkExtractionStartedAt string `json:"workExtractionStartedAt,omitempty"`
	WorkExtractionLastAt    string `json:"workExtractionLastAt,omitempty"`
	BlockedUpdateVersion    string `json:"blockedUpdateVersion,omitempty"`
}

const DefaultLocalSyncPort = 47832

// LocalSyncURL returns the loopback metrics endpoint for this device.
func (c *Config) LocalSyncURL() string {
	port := c.LocalSyncPort
	if port <= 0 {
		port = DefaultLocalSyncPort
	}
	return fmt.Sprintf("http://127.0.0.1:%d", port)
}

// EnsureLocalSyncCredentials creates a local sync token/port if missing.
func (c *Config) EnsureLocalSyncCredentials() (bool, error) {
	changed := false
	if c.LocalSyncPort <= 0 {
		c.LocalSyncPort = DefaultLocalSyncPort
		changed = true
	}
	if strings.TrimSpace(c.LocalSyncToken) == "" {
		token, err := randomToken(24)
		if err != nil {
			return false, err
		}
		c.LocalSyncToken = token
		changed = true
	}
	return changed, nil
}

// ConfigDir returns ~/.usejunction.
func ConfigDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".usejunction")
}

// ConfigPath returns ~/.usejunction/config.json.
func ConfigPath() string {
	return filepath.Join(ConfigDir(), "config.json")
}

// BackupDir returns ~/.usejunction/backups.
func BackupDir() string {
	return filepath.Join(ConfigDir(), "backups")
}

// CacheDir returns ~/.usejunction/cache/cost-usage — scan caches and
// usage-upload.json fingerprints for incremental local-usage uploads.
func CacheDir() string {
	return filepath.Join(ConfigDir(), "cache", "cost-usage")
}

func UpdateStatePath() string {
	return filepath.Join(ConfigDir(), "update-state.json")
}

func UpdateHistoryPath() string {
	return filepath.Join(ConfigDir(), "update-history.json")
}

// Load reads and parses the config file. Returns an error when not enrolled.
func Load() (*Config, error) {
	data, err := os.ReadFile(ConfigPath())
	if err != nil {
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

// Save persists c to disk, creating directories as needed.
func Save(c *Config) error {
	if err := os.MkdirAll(ConfigDir(), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ConfigPath(), data, 0600)
}

func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "uj_local_" + base64.RawURLEncoding.EncodeToString(b), nil
}
