//go:build windows

package platformdirs

import (
	"path/filepath"
	"testing"
)

func TestWindowsEditorDataRootsUseAppData(t *testing.T) {
	appData := filepath.Join(t.TempDir(), "Roaming")
	localData := filepath.Join(t.TempDir(), "Local")
	t.Setenv("APPDATA", appData)
	t.Setenv("LOCALAPPDATA", localData)

	if got, want := CursorUserDir(), filepath.Join(appData, "Cursor", "User"); got != want {
		t.Fatalf("CursorUserDir() = %q, want %q", got, want)
	}
	roots := GlobalStorageRoots()
	if got, want := roots[0], filepath.Join(appData, "Code", "User", "globalStorage"); got != want {
		t.Fatalf("GlobalStorageRoots()[0] = %q, want %q", got, want)
	}
	if got, want := roots[1], filepath.Join(appData, "Code - Insiders", "User", "globalStorage"); got != want {
		t.Fatalf("GlobalStorageRoots()[1] = %q, want %q", got, want)
	}
}
