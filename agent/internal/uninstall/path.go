package uninstall

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const pathMarker = "# UseJunction CLI"

func removeCliFromPath() {
	if runtime.GOOS == "windows" {
		return
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	for _, rc := range shellRcCandidates(home) {
		changed, err := removePathBlock(rc)
		if err == nil && changed {
			fmt.Printf("Removed UseJunction CLI from %s\n", rc)
		}
	}
}

func shellRcCandidates(home string) []string {
	return []string{
		filepath.Join(home, ".zshrc"),
		filepath.Join(home, ".bashrc"),
		filepath.Join(home, ".bash_profile"),
		filepath.Join(home, ".config", "fish", "config.fish"),
	}
}

func removePathBlock(path string) (bool, error) {
	info, err := os.Stat(path)
	if err != nil {
		return false, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}
	lines := strings.Split(string(data), "\n")
	var out []string
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if strings.Contains(line, pathMarker) {
			if i+1 < len(lines) && isUseJunctionPathLine(lines[i+1]) {
				i++
			}
			continue
		}
		if isUseJunctionPathLine(line) {
			continue
		}
		out = append(out, line)
	}
	updated := strings.TrimRight(strings.Join(out, "\n"), "\n")
	if updated == strings.TrimRight(string(data), "\n") {
		return false, nil
	}
	if updated != "" {
		updated += "\n"
	}
	return true, os.WriteFile(path, []byte(updated), info.Mode().Perm())
}

func isUseJunctionPathLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	return strings.Contains(trimmed, ".usejunction/bin") &&
		(strings.Contains(trimmed, "PATH") || strings.Contains(trimmed, "fish_add_path"))
}
