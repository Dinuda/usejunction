// Package platformdirs centralizes per-user application data locations used by
// coding tools. Keeping these paths here avoids treating Windows like Linux's
// XDG layout.
package platformdirs

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func Home() string {
	home, _ := os.UserHomeDir()
	return home
}

// UserConfigRoot returns the platform's roaming application-data root.
func UserConfigRoot() string {
	home := Home()
	switch runtime.GOOS {
	case "windows":
		if root := os.Getenv("APPDATA"); root != "" {
			return root
		}
		return filepath.Join(home, "AppData", "Roaming")
	case "darwin":
		return filepath.Join(home, "Library", "Application Support")
	default:
		if root := os.Getenv("XDG_CONFIG_HOME"); root != "" {
			return root
		}
		return filepath.Join(home, ".config")
	}
}

func LocalDataRoot() string {
	home := Home()
	if runtime.GOOS == "windows" {
		if root := os.Getenv("LOCALAPPDATA"); root != "" {
			return root
		}
		return filepath.Join(home, "AppData", "Local")
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support")
	}
	if root := os.Getenv("XDG_DATA_HOME"); root != "" {
		return root
	}
	return filepath.Join(home, ".local", "share")
}

func EditorUserDir(editor string) string {
	return filepath.Join(UserConfigRoot(), editor, "User")
}

func EditorUserDirs() []string {
	return []string{
		EditorUserDir("Code"),
		EditorUserDir("Code - Insiders"),
		EditorUserDir("Cursor"),
		EditorUserDir("Antigravity"),
		EditorUserDir("Antigravity IDE"),
	}
}

func GlobalStorageRoots() []string {
	roots := make([]string, 0, 3)
	for _, userDir := range EditorUserDirs() {
		roots = append(roots, filepath.Join(userDir, "globalStorage"))
	}
	return roots
}

func WorkspaceStorageRoots() []string {
	roots := make([]string, 0, 3)
	for _, userDir := range EditorUserDirs() {
		roots = append(roots, filepath.Join(userDir, "workspaceStorage"))
	}
	return roots
}

func ExtensionRoots() []string {
	home := Home()
	return []string{
		filepath.Join(home, ".vscode", "extensions"),
		filepath.Join(home, ".vscode-insiders", "extensions"),
		filepath.Join(home, ".cursor", "extensions"),
		filepath.Join(home, ".antigravity", "extensions"),
	}
}

func CursorUserDir() string {
	return EditorUserDir("Cursor")
}

func AntigravityUserDirs() []string {
	return []string{
		EditorUserDir("Antigravity"),
		EditorUserDir("Antigravity IDE"),
	}
}

func AntigravityUserDir() string {
	for _, dir := range AntigravityUserDirs() {
		if st, err := os.Stat(dir); err == nil && st.IsDir() {
			return dir
		}
	}
	return EditorUserDir("Antigravity")
}

// GeminiHome returns the Gemini / Antigravity session root (~/.gemini by default).
func GeminiHome() string {
	if v := strings.TrimSpace(os.Getenv("GEMINI_HOME")); v != "" {
		return v
	}
	return filepath.Join(Home(), ".gemini")
}

// GeminiAntigravityRoots returns on-disk Antigravity conversation store candidates.
// Prefer an explicit ANTIGRAVITY_CLI_ROOT pin when set; otherwise discover the
// common IDE / IDE-legacy / CLI layouts under GeminiHome().
func GeminiAntigravityRoots() []string {
	if v := strings.TrimSpace(os.Getenv("ANTIGRAVITY_CLI_ROOT")); v != "" {
		return []string{v}
	}
	home := GeminiHome()
	return []string{
		filepath.Join(home, "antigravity-ide"),
		filepath.Join(home, "antigravity"),
		filepath.Join(home, "antigravity-cli"),
	}
}

func OpenCodeCandidates() []string {
	home := Home()
	return []string{
		filepath.Join(home, ".local", "share", "opencode"),
		filepath.Join(home, ".config", "opencode"),
		filepath.Join(UserConfigRoot(), "opencode"),
		filepath.Join(LocalDataRoot(), "opencode"),
	}
}
