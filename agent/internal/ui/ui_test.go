package ui

import (
	"bytes"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
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
		"UseJunction installed.",
		"Admin:  http://localhost:3001",
		"CLI:    /tmp/.usejunction/bin/usejunction",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("plain output missing %q\n%s", want, got)
		}
	}
	if strings.Contains(got, "\x1b[") {
		t.Fatalf("plain output contained ANSI escapes:\n%s", got)
	}
}

func TestStepUpdatePlainMode(t *testing.T) {
	origNoColor := forceNoColor
	origOut := out
	t.Cleanup(func() {
		forceNoColor = origNoColor
		out = origOut
	})

	var buf bytes.Buffer
	SetNoColor(true)
	SetWriter(&buf)

	step := StepStart("Uploading initial usage")
	step.Update("Scanning cursor")
	step.Update("Scanning cursor") // duplicate should not repeat
	step.Update("Syncing usage (934 rows)")
	step.Done("6 tools · 934 usage rows")

	got := buf.String()
	for _, want := range []string{
		"Uploading initial usage...",
		"· Scanning cursor",
		"· Syncing usage (934 rows)",
		"Uploading initial usage: 6 tools · 934 usage rows",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("plain progress missing %q\n%s", want, got)
		}
	}
	if strings.Count(got, "Scanning cursor") != 1 {
		t.Fatalf("duplicate progress lines should be suppressed:\n%s", got)
	}
}

func TestScanPanelPlainMode(t *testing.T) {
	origNoColor := forceNoColor
	origOut := out
	t.Cleanup(func() {
		forceNoColor = origNoColor
		out = origOut
	})

	var buf bytes.Buffer
	SetNoColor(true)
	SetWriter(&buf)

	panel := ScanPanelStart("Uploading initial usage", []string{"cursor", "claude", "codex"})
	panel.ToolStart("cursor")
	panel.ToolFinish("cursor", false)
	panel.ToolStart("claude")
	panel.ToolFinish("claude", true)
	panel.Update("Syncing usage (12 rows)")
	panel.Update("Syncing usage (12 rows)")
	panel.Done("3 tools · 12 usage rows")

	got := buf.String()
	for _, want := range []string{
		"Uploading initial usage...",
		"○ cursor",
		"○ claude",
		"○ codex",
		"⠋ cursor",
		"✓ cursor",
		"⠋ claude",
		"– claude (skipped)",
		"· Syncing usage (12 rows)",
		"Uploading initial usage: 3 tools · 12 usage rows",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("plain scan panel missing %q\n%s", want, got)
		}
	}
	if strings.Count(got, "· Syncing usage (12 rows)") != 1 {
		t.Fatalf("duplicate detail lines should be suppressed:\n%s", got)
	}
}

func TestStepDoneDoesNotDeadlockWithSpinner(t *testing.T) {
	origOut := out
	t.Cleanup(func() { out = origOut })

	var buf bytes.Buffer
	SetWriter(&buf)

	s := &Step{
		label:  "Uploading initial usage",
		stop:   make(chan struct{}),
		done:   make(chan struct{}),
		active: true,
	}
	go s.spin()

	finished := make(chan struct{})
	go func() {
		for i := 0; i < 100; i++ {
			s.Update(fmt.Sprintf("progress %d", i))
			time.Sleep(time.Millisecond)
		}
	}()

	go func() {
		time.Sleep(5 * time.Millisecond)
		s.Done("6 tools · 926 usage rows")
		close(finished)
	}()

	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("Done() deadlocked with spinner goroutine")
	}
}

func TestScanPanelDoneDoesNotDeadlock(t *testing.T) {
	origOut := out
	t.Cleanup(func() { out = origOut })

	var buf bytes.Buffer
	SetWriter(&buf)

	p := &ScanPanel{
		label:     "Uploading initial usage",
		toolOrder: []string{"cursor", "claude"},
		status: map[string]ToolScanStatus{
			"cursor": ToolPending,
			"claude": ToolPending,
		},
		stop:   make(chan struct{}),
		done:   make(chan struct{}),
		active: true,
	}
	go p.spin()

	finished := make(chan struct{})
	go func() {
		p.ToolStart("cursor")
		p.ToolFinish("cursor", false)
		p.ToolStart("claude")
		p.Update("Syncing usage")
		time.Sleep(5 * time.Millisecond)
		p.Done("2 tools")
		close(finished)
	}()

	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("ScanPanel.Done() deadlocked with spinner goroutine")
	}
}
