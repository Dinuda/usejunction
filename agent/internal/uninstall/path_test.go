package uninstall

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRemovePathBlock(t *testing.T) {
	dir := t.TempDir()
	rc := filepath.Join(dir, ".zshrc")
	initial := "export EDITOR=vim\n\n# UseJunction CLI\nexport PATH=\"$HOME/.usejunction/bin:$PATH\"\n"
	if err := os.WriteFile(rc, []byte(initial), 0o644); err != nil {
		t.Fatal(err)
	}

	changed, err := removePathBlock(rc)
	if err != nil {
		t.Fatalf("removePathBlock: %v", err)
	}
	if !changed {
		t.Fatal("expected path block to be removed")
	}

	got, err := os.ReadFile(rc)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "export EDITOR=vim\n" {
		t.Fatalf("unexpected rc contents:\n%s", got)
	}

	changed, err = removePathBlock(rc)
	if err != nil {
		t.Fatalf("second removePathBlock: %v", err)
	}
	if changed {
		t.Fatal("expected no changes on second pass")
	}
}

func TestRemovePathBlockFish(t *testing.T) {
	dir := t.TempDir()
	rc := filepath.Join(dir, "config.fish")
	initial := "# UseJunction CLI\nfish_add_path ~/.usejunction/bin\n"
	if err := os.WriteFile(rc, []byte(initial), 0o644); err != nil {
		t.Fatal(err)
	}

	changed, err := removePathBlock(rc)
	if err != nil {
		t.Fatalf("removePathBlock: %v", err)
	}
	if !changed {
		t.Fatal("expected fish path block to be removed")
	}
	if data, err := os.ReadFile(rc); err != nil || len(data) != 0 {
		t.Fatalf("expected empty rc, got %q", data)
	}
}
