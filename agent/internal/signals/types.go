package signals

import "time"

const CollectionModeAppDomain = "app_domain"

// MinClassicSignalsVersion is reserved for Phase 2 journey-quality gating.
// Keep in sync with CLASSIC_SIGNALS_MIN_AGENT_VERSION on the control plane.
const MinClassicSignalsVersion = "0.4.0"

type Policy struct {
	Enabled         bool
	RetentionDays   int
	CollectionMode  string
	ExcludedApps    []string
	ExcludedDomains []string
	UpdatedAt       string
}

type Snapshot struct {
	ObservedAt time.Time
	App        string
	Domain     *string
	Title      string
	Idle       bool
}

type Collector interface {
	Snapshot() (Snapshot, error)
}

type BrowserContextProvider interface {
	Domain(app string, observedAt time.Time) *string
}

// NoopBrowserContextProvider is the Phase-1 stub. Phase 2 ships a native-messaging
// host + browser extension that implements this without changing the session model.
type NoopBrowserContextProvider struct{}

func (NoopBrowserContextProvider) Domain(string, time.Time) *string {
	return nil
}
