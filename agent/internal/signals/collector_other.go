//go:build !darwin && !windows

package signals

import "errors"

type platformCollector struct{}

func NewCollector() Collector {
	return platformCollector{}
}

func (platformCollector) Snapshot() (Snapshot, error) {
	return Snapshot{}, errors.New("signals foreground collection is unsupported on this OS")
}
