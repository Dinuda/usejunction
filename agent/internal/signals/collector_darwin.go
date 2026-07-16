//go:build darwin

package signals

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type platformCollector struct{}

func NewCollector() Collector {
	return platformCollector{}
}

func (platformCollector) Snapshot() (Snapshot, error) {
	app, title, err := activeDarwinWindow()
	if err != nil {
		return Snapshot{}, err
	}
	idle := darwinIdleSeconds() >= idleThreshold.Seconds()
	domain := inferDomain(app, title)
	return Snapshot{
		ObservedAt: time.Now().UTC(),
		App:        app,
		Domain:     domain,
		Title:      title,
		Idle:       idle,
	}, nil
}

func activeDarwinWindow() (string, string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	script := `tell application "System Events"
set frontApp to name of first application process whose frontmost is true
set winTitle to ""
try
  set winTitle to name of front window of first application process whose frontmost is true
end try
return frontApp & "\n" & winTitle
end tell`
	out, err := exec.CommandContext(ctx, "osascript", "-e", script).Output()
	if err != nil {
		return "", "", err
	}
	parts := strings.SplitN(strings.TrimSpace(string(out)), "\n", 2)
	app := strings.TrimSpace(parts[0])
	title := ""
	if len(parts) > 1 {
		title = strings.TrimSpace(parts[1])
	}
	return app, title, nil
}

func darwinIdleSeconds() float64 {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "sh", "-c", `ioreg -c IOHIDSystem | awk '/HIDIdleTime/ { print int($NF/1000000000); exit }'`).Output()
	if err != nil {
		return 0
	}
	seconds, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	return seconds
}
