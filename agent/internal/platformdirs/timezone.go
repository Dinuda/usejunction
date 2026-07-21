package platformdirs

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// LocalIANATimeZone best-effort resolves the machine IANA timezone
// (e.g. "America/New_York"). Returns empty string when unknown.
func LocalIANATimeZone() string {
	if tz := strings.TrimSpace(os.Getenv("TZ")); tz != "" && tz != ":" && !strings.EqualFold(tz, "localtime") {
		if strings.Contains(tz, "/") || strings.EqualFold(tz, "UTC") {
			return tz
		}
	}

	if runtime.GOOS == "windows" {
		return ""
	}

	link, err := os.Readlink("/etc/localtime")
	if err != nil {
		return ""
	}
	link = filepath.ToSlash(link)
	const marker = "/zoneinfo/"
	idx := strings.Index(link, marker)
	if idx < 0 {
		return ""
	}
	zone := strings.TrimSpace(link[idx+len(marker):])
	if zone == "" || !strings.Contains(zone, "/") {
		if strings.EqualFold(zone, "UTC") || strings.EqualFold(zone, "GMT") {
			return "UTC"
		}
		return ""
	}
	return zone
}
