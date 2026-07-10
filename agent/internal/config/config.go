package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

const Version = "0.1.0"

// Config holds the persisted enrollment state.
type Config struct {
	ControlPlaneURL string `json:"controlPlaneUrl"`
	DeviceToken     string `json:"deviceToken"`
	DeviceID        string `json:"deviceId"`
	UserID          string `json:"userId"`
	OrgID           string `json:"orgId"`
	GatewayURL      string `json:"gatewayUrl"`
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

// CacheDir returns the cost-cache directory.
func CacheDir() string {
	return filepath.Join(ConfigDir(), "cache", "cost-usage")
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
