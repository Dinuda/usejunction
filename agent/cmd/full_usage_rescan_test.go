package cmd

import "testing"

func TestShouldForceFullUsageRescan(t *testing.T) {
	cases := []struct {
		name       string
		refresh    bool
		sealedDay  string
		lastFull   string
		wantForce  bool
	}{
		{name: "sync refresh", refresh: true, sealedDay: "2026-07-21", lastFull: "2026-07-21", wantForce: true},
		{name: "new sealed day", refresh: false, sealedDay: "2026-07-21", lastFull: "2026-07-20", wantForce: true},
		{name: "same day", refresh: false, sealedDay: "2026-07-21", lastFull: "2026-07-21", wantForce: false},
		{name: "no seal", refresh: false, sealedDay: "", lastFull: "", wantForce: false},
		{name: "first seal", refresh: false, sealedDay: "2026-07-21", lastFull: "", wantForce: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := shouldForceFullUsageRescan(tc.refresh, tc.sealedDay, tc.lastFull)
			if got != tc.wantForce {
				t.Fatalf("got %v want %v", got, tc.wantForce)
			}
		})
	}
}
