//go:build darwin

package workextract

import (
	"os"
	"syscall"
	"time"
)

func fileBirthOrMod(path string, fallback time.Time) time.Time {
	info, err := os.Stat(path)
	if err != nil {
		return fallback
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return fallback
	}
	sec, nsec := stat.Birthtimespec.Sec, stat.Birthtimespec.Nsec
	if sec <= 0 {
		return fallback
	}
	return time.Unix(sec, nsec).UTC()
}
