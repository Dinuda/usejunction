package signals

import "time"

const CollectionModeAppDomain = "app_domain"

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

type NoopBrowserContextProvider struct{}

func (NoopBrowserContextProvider) Domain(string, time.Time) *string {
	return nil
}
