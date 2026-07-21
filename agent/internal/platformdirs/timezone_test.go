package platformdirs

import "testing"

func TestLocalIANATimeZoneFromEnv(t *testing.T) {
	t.Setenv("TZ", "Asia/Colombo")
	got := LocalIANATimeZone()
	if got != "Asia/Colombo" {
		t.Fatalf("got %q", got)
	}
}
