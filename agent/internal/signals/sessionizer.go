package signals

import (
	"crypto/sha1"
	"encoding/hex"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
)

const (
	previousContextWindow = 5 * time.Minute
	nextContextWindow     = 10 * time.Minute
	idleThreshold         = 2 * time.Minute
)

type segment struct {
	App       string
	Domain    *string
	Title     string
	StartedAt time.Time
	EndedAt   time.Time
	Tool      string
}

type Sessionizer struct {
	policy   Policy
	current  *segment
	closed   []segment
	emitted  map[string]bool
	provider BrowserContextProvider
}

func NewSessionizer(policy Policy, provider BrowserContextProvider) *Sessionizer {
	if provider == nil {
		provider = NoopBrowserContextProvider{}
	}
	return &Sessionizer{
		policy:   policy,
		emitted:  map[string]bool{},
		provider: provider,
	}
}

func (s *Sessionizer) SetPolicy(policy Policy) {
	s.policy = policy
}

func (s *Sessionizer) Observe(snapshot Snapshot) []client.SignalsSession {
	if snapshot.ObservedAt.IsZero() {
		snapshot.ObservedAt = time.Now().UTC()
	}
	snapshot.ObservedAt = snapshot.ObservedAt.UTC()
	if snapshot.Domain == nil {
		snapshot.Domain = s.provider.Domain(snapshot.App, snapshot.ObservedAt)
	}
	if snapshot.Domain != nil {
		normalized := normalizeDomain(*snapshot.Domain)
		snapshot.Domain = &normalized
	}

	if snapshot.Idle {
		if s.current != nil && snapshot.ObservedAt.Sub(s.current.StartedAt) >= idleThreshold {
			s.closeCurrent(snapshot.ObservedAt)
		}
		return s.emitReady(snapshot.ObservedAt)
	}

	if s.current == nil {
		s.current = s.segmentFromSnapshot(snapshot)
		return s.emitReady(snapshot.ObservedAt)
	}
	if s.current.App != snapshot.App || stringPtrValue(s.current.Domain) != stringPtrValue(snapshot.Domain) {
		s.closeCurrent(snapshot.ObservedAt)
		s.current = s.segmentFromSnapshot(snapshot)
	}
	return s.emitReady(snapshot.ObservedAt)
}

func (s *Sessionizer) Flush(now time.Time) []client.SignalsSession {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if s.current != nil {
		s.closeCurrent(now.UTC())
	}
	return s.emitReady(now.UTC().Add(nextContextWindow))
}

func (s *Sessionizer) segmentFromSnapshot(snapshot Snapshot) *segment {
	tool := aiTool(snapshot.App, snapshot.Domain, snapshot.Title)
	return &segment{
		App:       strings.TrimSpace(snapshot.App),
		Domain:    snapshot.Domain,
		Title:     snapshot.Title,
		StartedAt: snapshot.ObservedAt,
		EndedAt:   snapshot.ObservedAt,
		Tool:      tool,
	}
}

func (s *Sessionizer) closeCurrent(endedAt time.Time) {
	if s.current == nil {
		return
	}
	current := *s.current
	current.EndedAt = endedAt
	if current.EndedAt.After(current.StartedAt) && !s.excluded(current) {
		s.closed = append(s.closed, current)
		if len(s.closed) > 200 {
			s.closed = s.closed[len(s.closed)-200:]
		}
	}
	s.current = nil
}

func (s *Sessionizer) emitReady(now time.Time) []client.SignalsSession {
	var out []client.SignalsSession
	for i, seg := range s.closed {
		if seg.Tool == "" || s.emitted[segmentID(seg)] {
			continue
		}
		if i+1 >= len(s.closed) && now.Sub(seg.EndedAt) < nextContextWindow {
			continue
		}
		before := s.previousSegment(i)
		after := s.nextSegment(i)
		session := s.buildSession(before, seg, after)
		if session.LocalID == "" {
			continue
		}
		s.emitted[session.LocalID] = true
		out = append(out, session)
	}
	return out
}

func (s *Sessionizer) previousSegment(index int) segment {
	for i := index - 1; i >= 0; i-- {
		candidate := s.closed[i]
		if candidate.EndedAt.Before(s.closed[index].StartedAt.Add(-previousContextWindow)) {
			return segment{}
		}
		if candidate.Tool == "" {
			return candidate
		}
	}
	return segment{}
}

func (s *Sessionizer) nextSegment(index int) segment {
	ai := s.closed[index]
	for i := index + 1; i < len(s.closed); i++ {
		candidate := s.closed[i]
		if candidate.StartedAt.After(ai.EndedAt.Add(nextContextWindow)) {
			return segment{}
		}
		if candidate.Tool == "" {
			return candidate
		}
	}
	return segment{}
}

func (s *Sessionizer) buildSession(before, ai, after segment) client.SignalsSession {
	localID := segmentID(ai)
	steps := []client.SignalsStep{}
	for _, seg := range []segment{before, ai, after} {
		if seg.App == "" {
			continue
		}
		steps = append(steps, client.SignalsStep{
			App:       seg.App,
			Domain:    seg.Domain,
			StartedAt: seg.StartedAt.Format(time.RFC3339),
			EndedAt:   seg.EndedAt.Format(time.RFC3339),
		})
	}
	confidence := 0.55
	if ai.Domain != nil {
		confidence = 0.85
	}
	return client.SignalsSession{
		LocalID:         localID,
		StartedAt:       ai.StartedAt.Format(time.RFC3339),
		EndedAt:         ai.EndedAt.Format(time.RFC3339),
		DurationSeconds: int(ai.EndedAt.Sub(ai.StartedAt).Seconds()),
		AITool:          ai.Tool,
		AppBefore:       before.App,
		DomainBefore:    before.Domain,
		AppAfter:        after.App,
		DomainAfter:     after.Domain,
		FlowSignature:   flowSignature(before, ai, after),
		Confidence:      confidence,
		CollectionMode:  CollectionModeAppDomain,
		Steps:           steps,
		Metadata:        map[string]any{"collector": "desktop_agent"},
	}
}

func (s *Sessionizer) excluded(seg segment) bool {
	app := strings.ToLower(strings.TrimSpace(seg.App))
	for _, excluded := range s.policy.ExcludedApps {
		if app == strings.ToLower(strings.TrimSpace(excluded)) {
			return true
		}
	}
	if seg.Domain == nil {
		return false
	}
	domain := strings.ToLower(strings.TrimSpace(*seg.Domain))
	for _, excluded := range s.policy.ExcludedDomains {
		excluded = strings.ToLower(strings.TrimSpace(excluded))
		if domain == excluded || strings.HasSuffix(domain, "."+excluded) {
			return true
		}
	}
	return false
}

func segmentID(seg segment) string {
	if seg.App == "" || seg.StartedAt.IsZero() {
		return ""
	}
	sum := sha1.Sum([]byte(seg.App + "|" + stringPtrValue(seg.Domain) + "|" + seg.StartedAt.Format(time.RFC3339Nano) + "|" + seg.Tool))
	return "sig_" + hex.EncodeToString(sum[:])[:24]
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func normalizeDomain(domain string) string {
	domain = strings.TrimSpace(strings.ToLower(domain))
	domain = strings.TrimSuffix(domain, ".")
	return domain
}
