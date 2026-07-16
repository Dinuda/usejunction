package signals

import (
	"testing"
	"time"
)

func strptr(value string) *string {
	return &value
}

func TestSessionizerBuildsAIAdjacentSession(t *testing.T) {
	start := time.Date(2026, 7, 15, 10, 0, 0, 0, time.UTC)
	s := NewSessionizer(Policy{CollectionMode: CollectionModeAppDomain}, NoopBrowserContextProvider{})

	s.Observe(Snapshot{ObservedAt: start, App: "Chrome", Domain: strptr("hubspot.com")})
	s.Observe(Snapshot{ObservedAt: start.Add(3 * time.Minute), App: "Chrome", Domain: strptr("chatgpt.com")})
	s.Observe(Snapshot{ObservedAt: start.Add(9 * time.Minute), App: "Microsoft Teams"})
	out := s.Observe(Snapshot{ObservedAt: start.Add(12 * time.Minute), App: "Finder"})

	if len(out) != 1 {
		t.Fatalf("expected one session, got %d", len(out))
	}
	got := out[0]
	if got.AITool != "chatgpt" {
		t.Fatalf("expected chatgpt tool, got %q", got.AITool)
	}
	if got.AppBefore != "Chrome" || got.DomainBefore == nil || *got.DomainBefore != "hubspot.com" {
		t.Fatalf("unexpected before context: app=%q domain=%v", got.AppBefore, got.DomainBefore)
	}
	if got.AppAfter != "Microsoft Teams" {
		t.Fatalf("unexpected after context: %q", got.AppAfter)
	}
	if got.DurationSeconds != 360 {
		t.Fatalf("expected 360 seconds, got %d", got.DurationSeconds)
	}
}

func TestSessionizerDropsExcludedDomains(t *testing.T) {
	start := time.Date(2026, 7, 15, 10, 0, 0, 0, time.UTC)
	s := NewSessionizer(Policy{
		CollectionMode:  CollectionModeAppDomain,
		ExcludedDomains: []string{"chatgpt.com"},
	}, NoopBrowserContextProvider{})

	s.Observe(Snapshot{ObservedAt: start, App: "Chrome", Domain: strptr("hubspot.com")})
	s.Observe(Snapshot{ObservedAt: start.Add(time.Minute), App: "Chrome", Domain: strptr("chatgpt.com")})
	s.Observe(Snapshot{ObservedAt: start.Add(2 * time.Minute), App: "Slack"})
	out := s.Flush(start.Add(20 * time.Minute))

	if len(out) != 0 {
		t.Fatalf("expected excluded session to be dropped, got %d", len(out))
	}
}

func TestSessionizerDoesNotDuplicateSessions(t *testing.T) {
	start := time.Date(2026, 7, 15, 10, 0, 0, 0, time.UTC)
	s := NewSessionizer(Policy{CollectionMode: CollectionModeAppDomain}, NoopBrowserContextProvider{})

	s.Observe(Snapshot{ObservedAt: start, App: "Chrome", Domain: strptr("chatgpt.com")})
	s.Observe(Snapshot{ObservedAt: start.Add(time.Minute), App: "Slack"})
	first := s.Flush(start.Add(20 * time.Minute))
	second := s.Flush(start.Add(21 * time.Minute))

	if len(first) != 1 {
		t.Fatalf("expected first flush to emit one session, got %d", len(first))
	}
	if len(second) != 0 {
		t.Fatalf("expected second flush to emit no duplicates, got %d", len(second))
	}
}
