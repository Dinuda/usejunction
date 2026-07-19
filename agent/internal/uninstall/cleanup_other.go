//go:build !windows

package uninstall

func schedulePlatformCleanup() (bool, error) {
	return false, nil
}
