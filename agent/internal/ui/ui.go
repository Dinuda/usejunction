// Package ui provides branded terminal presentation for the UseJunction CLI.
// When stdout is not a TTY, or NO_COLOR / --no-color is set, helpers fall back
// to plain text with no ANSI and no animation.
package ui

import (
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/lipgloss"
	"github.com/mattn/go-isatty"
	"github.com/usejunction/agent/internal/types"
)

// Brand colors from apps/admin/app/globals.css.
const (
	colorTeal   = "#08758a"
	colorYellow = "#e5ec67"
	colorOrange = "#c0682c"
	colorOlive  = "#202419"
	colorMuted  = "#6b7260"
	colorOk     = "#98ac26"
)

var (
	forceNoColor bool
	out          io.Writer = os.Stdout
)

// SetNoColor disables color and animation (wired from --no-color).
func SetNoColor(v bool) {
	forceNoColor = v
}

// SetWriter overrides the output writer (tests).
func SetWriter(w io.Writer) {
	if w == nil {
		out = os.Stdout
		return
	}
	out = w
}

// Enabled reports whether styled/animated output should be used.
func Enabled() bool {
	if forceNoColor {
		return false
	}
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	f, ok := out.(*os.File)
	if !ok {
		return false
	}
	return isatty.IsTerminal(f.Fd()) || isatty.IsCygwinTerminal(f.Fd())
}

func styleTeal() lipgloss.Style {
	return lipgloss.NewStyle().Foreground(lipgloss.Color(colorTeal)).Bold(true)
}

func styleYellow() lipgloss.Style {
	return lipgloss.NewStyle().Foreground(lipgloss.Color(colorYellow)).Bold(true)
}

func styleMuted() lipgloss.Style {
	return lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{
		Light: colorMuted,
		Dark:  "#9aa18c",
	})
}

func styleOk() lipgloss.Style {
	return lipgloss.NewStyle().Foreground(lipgloss.Color(colorOk)).Bold(true)
}

func styleWarn() lipgloss.Style {
	return lipgloss.NewStyle().Foreground(lipgloss.Color(colorOrange)).Bold(true)
}

func styleFail() lipgloss.Style {
	return lipgloss.NewStyle().Foreground(lipgloss.Color(colorOrange)).Bold(true)
}

func styleBody() lipgloss.Style {
	// Olive reads as near-black on dark terminals; adapt for dark/light.
	return lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{
		Light: colorOlive,
		Dark:  "#e6e8df",
	})
}

// Banner prints the UseJunction wordmark.
func Banner() {
	if !Enabled() {
		fmt.Fprintln(out, "UseJunction")
		fmt.Fprintln(out)
		return
	}
	mark := styleYellow().Render("◆")
	name := styleTeal().Render("UseJunction")
	fmt.Fprintf(out, "\n  %s  %s\n\n", mark, name)
}

// Step is an in-flight progress step with an optional spinner.
type Step struct {
	label  string
	stop   chan struct{}
	done   chan struct{}
	mu     sync.Mutex
	active bool
}

// StepStart begins a progress step. Call Done or Fail when finished.
func StepStart(label string) *Step {
	s := &Step{label: label}
	if !Enabled() {
		fmt.Fprintf(out, "%s...\n", label)
		return s
	}
	s.stop = make(chan struct{})
	s.done = make(chan struct{})
	s.active = true
	go s.spin()
	return s
}

func (s *Step) spin() {
	defer close(s.done)
	frames := spinner.MiniDot.Frames
	fps := spinner.MiniDot.FPS
	if fps <= 0 {
		fps = time.Second / 12
	}
	i := 0
	spinStyle := styleTeal()
	labelStyle := styleBody()
	ticker := time.NewTicker(fps)
	defer ticker.Stop()
	for {
		frame := spinStyle.Render(strings.TrimSpace(frames[i%len(frames)]))
		fmt.Fprintf(out, "\r  %s  %s", frame, labelStyle.Render(s.label))
		i++
		select {
		case <-s.stop:
			return
		case <-ticker.C:
		}
	}
}

// Done finishes the step successfully.
func (s *Step) Done(detail string) {
	s.finish(true, detail)
}

// Fail finishes the step with an error style.
func (s *Step) Fail(detail string) {
	s.finish(false, detail)
}

func (s *Step) finish(ok bool, detail string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.stop != nil && s.active {
		close(s.stop)
		<-s.done
		s.active = false
		// Clear the spinner line.
		fmt.Fprintf(out, "\r\033[2K")
	}
	if !Enabled() {
		if detail != "" {
			fmt.Fprintf(out, "%s: %s\n", s.label, detail)
		}
		return
	}
	mark := styleOk().Render("✓")
	if !ok {
		mark = styleFail().Render("✗")
	}
	line := fmt.Sprintf("  %s  %s", mark, styleBody().Render(s.label))
	if detail != "" {
		line += styleMuted().Render("  "+detail)
	}
	fmt.Fprintln(out, line)
}

// QuietLine prints a muted secondary line under a step.
func QuietLine(msg string) {
	if !Enabled() {
		fmt.Fprintln(out, msg)
		return
	}
	fmt.Fprintf(out, "      %s\n", styleMuted().Render(msg))
}

// WarnLine prints an orange warning.
func WarnLine(msg string) {
	if !Enabled() {
		fmt.Fprintf(out, "warning: %s\n", msg)
		return
	}
	fmt.Fprintf(out, "  %s  %s\n", styleWarn().Render("!"), styleBody().Render(msg))
}

// ToolLine prints one detected tool.
func ToolLine(name string, ready bool) {
	tag := ""
	if ready {
		tag = " [ready]"
	}
	if !Enabled() {
		fmt.Fprintf(out, "  • %s%s\n", name, tag)
		return
	}
	mark := styleOk().Render("✓")
	if !ready {
		mark = styleMuted().Render("○")
	}
	line := fmt.Sprintf("  %s  %s", mark, styleBody().Render(name))
	if ready {
		line += styleTeal().Render(tag)
	}
	fmt.Fprintln(out, line)
}

// ToolReveal prints one detected tool with a short delay for staged onboarding reveal.
func ToolReveal(name string, ready bool) {
	ToolLine(name, ready)
	if Enabled() {
		time.Sleep(45 * time.Millisecond)
	}
}

// StatusSummary prints enrollment fields without the tool list.
func StatusSummary(deviceID, orgID, version string, toolCount int) {
	if !Enabled() {
		fmt.Fprintf(out, "Status:       enrolled\n")
		fmt.Fprintf(out, "Device ID:    %s\n", deviceID)
		fmt.Fprintf(out, "Org ID:       %s\n", orgID)
		fmt.Fprintf(out, "Agent:        v%s\n", version)
		fmt.Fprintf(out, "Tools found:  %d\n", toolCount)
		return
	}

	fmt.Fprintln(out)
	header := styleTeal().Render("Status")
	fmt.Fprintf(out, "  %s  %s\n", header, styleOk().Render("enrolled"))
	kv := func(k, v string) {
		fmt.Fprintf(out, "  %s  %s\n", styleMuted().Render(padRight(k, 10)), styleBody().Render(v))
	}
	kv("Device", deviceID)
	kv("Org", orgID)
	kv("Agent", "v"+version)
	kv("Tools", fmt.Sprintf("%d detected", toolCount))
}

// StatusCard prints enrollment summary including detected tools.
func StatusCard(deviceID, orgID, version string, tools []types.ToolStatus) {
	StatusSummary(deviceID, orgID, version, len(tools))
	if !Enabled() {
		for _, t := range tools {
			tag := ""
			if t.Configured {
				tag = " [ready]"
			}
			fmt.Fprintf(out, "  • %s%s\n", t.ToolName, tag)
		}
		return
	}
	fmt.Fprintln(out)
	for _, t := range tools {
		ToolLine(t.ToolName, t.Configured)
	}
}

// DoctorTable prints the tool detection table.
func DoctorTable(detected []types.ToolStatus) {
	if !Enabled() {
		fmt.Fprintf(out, "%-14s  %-10s  %-14s  %s\n", "TOOL", "DETECTED", "CONFIGURED", "CONFIG PATH")
		fmt.Fprintf(out, "%-14s  %-10s  %-14s  %s\n", "----", "--------", "----------", "-----------")
		for _, r := range detected {
			configured := "no"
			if r.Configured {
				configured = "yes"
			}
			fmt.Fprintf(out, "%-14s  %-10s  %-14s  %s\n", r.ToolName, "yes", configured, r.ConfigPath)
		}
		fmt.Fprintf(out, "\n%d tool(s) detected.\n", len(detected))
		return
	}

	headerStyle := styleMuted().Bold(true)
	yes := styleOk().Render("yes")
	no := styleMuted().Render("no")

	fmt.Fprintf(out, "  %s  %s  %s  %s\n",
		headerStyle.Render(padRight("TOOL", 14)),
		headerStyle.Render(padRight("DETECTED", 10)),
		headerStyle.Render(padRight("CONFIGURED", 10)),
		headerStyle.Render("CONFIG PATH"),
	)
	for _, r := range detected {
		cfg := no
		if r.Configured {
			cfg = yes
		}
		fmt.Fprintf(out, "  %s  %s  %s  %s\n",
			styleBody().Render(padRight(r.ToolName, 14)),
			yes+"       ",
			padRightVisible(cfg, 10),
			styleMuted().Render(r.ConfigPath),
		)
	}
	fmt.Fprintf(out, "\n  %s\n", styleTeal().Render(fmt.Sprintf("%d tool(s) detected.", len(detected))))
}

// SuccessBox prints the post-install success panel.
func SuccessBox(adminURL, cliPath string) {
	if !Enabled() {
		fmt.Fprintln(out)
		fmt.Fprintf(out, "UseJunction installed. Admin panel: %s\n", adminURL)
		fmt.Fprintf(out, "CLI: %s\n", cliPath)
		fmt.Fprintf(out, "Next: open a new terminal, or run: export PATH=\"%s:$PATH\"\n", dirOf(cliPath))
		fmt.Fprintln(out, "Then: usejunction status")
		fmt.Fprintln(out, "Rollback an update: usejunction update --rollback")
		return
	}

	title := styleYellow().Render("◆") + " " + styleTeal().Render("UseJunction installed")
	body := strings.Join([]string{
		title,
		"",
		styleMuted().Render("Admin") + "   " + styleBody().Render(adminURL),
		styleMuted().Render("CLI") + "     " + styleBody().Render(cliPath),
		"",
		styleBody().Render("Next: open a new terminal, or:"),
		styleMuted().Render("  export PATH=\"" + dirOf(cliPath) + ":$PATH\""),
		styleBody().Render("Then: usejunction status"),
	}, "\n")

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(colorTeal)).
		Padding(0, 2).
		Margin(1, 0, 0, 2).
		Render(body)
	fmt.Fprintln(out, box)
	fmt.Fprintf(out, "  %s\n\n", styleMuted().Render("Rollback an update: usejunction update --rollback"))
}

func padRight(s string, n int) string {
	if len(s) >= n {
		return s
	}
	return s + strings.Repeat(" ", n-len(s))
}

func padRightVisible(styled string, n int) string {
	visible := lipgloss.Width(styled)
	if visible >= n {
		return styled
	}
	return styled + strings.Repeat(" ", n-visible)
}

func dirOf(cliPath string) string {
	i := strings.LastIndexAny(cliPath, "/\\")
	if i < 0 {
		return cliPath
	}
	return cliPath[:i]
}
