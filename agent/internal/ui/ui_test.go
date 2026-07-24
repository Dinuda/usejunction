package ui

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

func TestEnabledMatrix(t *testing.T) {
	origNoColor := forceNoColor
	origOut := out
	origEnv := os.Getenv("NO_COLOR")
	t.Cleanup(func() {
		forceNoColor = origNoColor
		out = origOut
		if origEnv == "" {
			_ = os.Unsetenv("NO_COLOR")
		} else {
			_ = os.Setenv("NO_COLOR", origEnv)
		}
	})

	t.Run("forceNoColor", func(t *testing.T) {
		_ = os.Unsetenv("NO_COLOR")
		SetNoColor(true)
		SetWriter(os.Stdout)
		if Enabled() {
			t.Fatal("expected disabled when --no-color")
		}
	})

	t.Run("NO_COLOR env", func(t *testing.T) {
		SetNoColor(false)
		_ = os.Setenv("NO_COLOR", "1")
		SetWriter(os.Stdout)
		if Enabled() {
			t.Fatal("expected disabled when NO_COLOR=1")
		}
	})

	t.Run("non-tty writer", func(t *testing.T) {
		SetNoColor(false)
		_ = os.Unsetenv("NO_COLOR")
		var buf bytes.Buffer
		SetWriter(&buf)
		if Enabled() {
			t.Fatal("expected disabled for non-file writer")
		}
	})
}

func TestPlainFallbacks(t *testing.T) {
	origNoColor := forceNoColor
	origOut := out
	t.Cleanup(func() {
		forceNoColor = origNoColor
		out = origOut
	})

	var buf bytes.Buffer
	SetNoColor(true)
	SetWriter(&buf)

	Banner()
	step := StepStart("Enrolling device")
	step.Done("ok")
	ToolLine("cursor", true)
	SuccessBox("http://localhost:3001", "/tmp/.usejunction/bin/usejunction")

	got := buf.String()
	for _, want := range []string{
		"UseJunction",
		"Enrolling device",
		"• cursor [ready]",
		"UseJunction installed. Admin panel: http://localhost:3001",
		"CLI: /tmp/.usejunction/bin/usejunction",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("plain output missing %q\n%s", want, got)
		}
	}
	if strings.Contains(got, "\x1b[") {
		t.Fatalf("plain output contained ANSI escapes:\n%s", got)
	}
}
