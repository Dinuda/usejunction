//go:build !windows

package updater

import "os"

func replaceExecutable(executable, staged string) (bool, error) {
	previous := executable + ".previous"
	_ = os.Remove(previous)
	if err := os.Rename(executable, previous); err != nil {
		return false, err
	}
	if err := os.Rename(staged, executable); err != nil {
		_ = os.Rename(previous, executable)
		return false, err
	}
	return false, nil
}

func rollbackExecutable(executable, previous string) (bool, error) {
	tmp := executable + ".rollback-swap"
	_ = os.Remove(tmp)
	if err := os.Rename(executable, tmp); err != nil {
		return false, err
	}
	if err := os.Rename(previous, executable); err != nil {
		_ = os.Rename(tmp, executable)
		return false, err
	}
	if err := os.Rename(tmp, previous); err != nil {
		_ = os.Rename(executable, previous)
		_ = os.Rename(tmp, executable)
		return false, err
	}
	return false, nil
}
