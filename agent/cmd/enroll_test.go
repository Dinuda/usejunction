package cmd

import (
	"os"
	"testing"
)

func TestWarnEnrollmentTargetLoopbackMismatch(t *testing.T) {
	t.Setenv("USEJUNCTION_URL", "https://usejunction.dev")
	err := warnEnrollmentTarget("http://localhost:3001", enrollOptions{})
	if err == nil {
		t.Fatal("expected mismatch error when USEJUNCTION_URL points at production")
	}
}

func TestWarnEnrollmentTargetLoopbackOnly(t *testing.T) {
	t.Setenv("USEJUNCTION_URL", "")
	err := warnEnrollmentTarget("http://localhost:3001", enrollOptions{Quiet: true})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestWarnEnrollmentTargetProduction(t *testing.T) {
	t.Setenv("USEJUNCTION_URL", "http://localhost:3001")
	err := warnEnrollmentTarget("https://usejunction.dev", enrollOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestWarnEnrollmentTargetRespectsQuiet(t *testing.T) {
	t.Setenv("USEJUNCTION_URL", "")
	_ = os.Unsetenv("USEJUNCTION_URL")
	err := warnEnrollmentTarget("http://127.0.0.1:3001", enrollOptions{Quiet: true})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
