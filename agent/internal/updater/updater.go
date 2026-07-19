package updater

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/usejunction/agent/internal/client"
	"github.com/usejunction/agent/internal/config"
)

const MaxArtifactBytes int64 = 100 * 1024 * 1024

var ErrBlockedVersion = errors.New("update version is blocked after rollback")

// TrustedUpdateSigningKeys is a comma-separated list of keyId:base64urlPublicKey
// entries. Production builds should inject it with -ldflags.
var TrustedUpdateSigningKeys = ""

type Reporter interface {
	ReportAgentUpdate(client.AgentUpdateEvent) error
}

type ApplyOptions struct {
	Directive       client.AgentUpdateDirective
	CurrentVersion  string
	ControlPlaneURL string
	ExecutablePath  string
	HTTPClient      *http.Client
	Reporter        Reporter
	Force           bool
}

type pendingState struct {
	Action           string `json:"action"`
	AttemptID        string `json:"attemptId"`
	ReleaseVersion   string `json:"releaseVersion"`
	InstalledVersion string `json:"installedVersion"`
	PreviousVersion  string `json:"previousVersion"`
}

type historyState struct {
	AttemptID        string `json:"attemptId"`
	ReleaseVersion   string `json:"releaseVersion"`
	InstalledVersion string `json:"installedVersion"`
	PreviousVersion  string `json:"previousVersion"`
}

func CompareVersions(left, right string) (int, bool) {
	type version struct {
		core       [3]int
		prerelease []string
	}
	parse := func(value string) (version, bool) {
		var out version
		value = strings.TrimPrefix(strings.TrimSpace(value), "v")
		pieces := strings.SplitN(value, "-", 2)
		parts := strings.Split(pieces[0], ".")
		if len(parts) != 3 {
			return out, false
		}
		for index, part := range parts {
			if part == "" || (len(part) > 1 && strings.HasPrefix(part, "0")) || strings.HasPrefix(part, "+") || strings.HasPrefix(part, "-") {
				return out, false
			}
			n, err := strconv.Atoi(part)
			if err != nil || n < 0 {
				return out, false
			}
			out.core[index] = n
		}
		if len(pieces) == 2 {
			if pieces[1] == "" {
				return out, false
			}
			out.prerelease = strings.Split(pieces[1], ".")
			for _, identifier := range out.prerelease {
				if identifier == "" || (len(identifier) > 1 && identifier[0] == '0' && isNumeric(identifier)) {
					return out, false
				}
				for _, char := range identifier {
					if !(char >= '0' && char <= '9') && !(char >= 'A' && char <= 'Z') && !(char >= 'a' && char <= 'z') && char != '-' {
						return out, false
					}
				}
			}
		}
		return out, true
	}
	a, okA := parse(left)
	b, okB := parse(right)
	if !okA || !okB {
		return 0, false
	}
	for index := 0; index < 3; index++ {
		if a.core[index] > b.core[index] {
			return 1, true
		}
		if a.core[index] < b.core[index] {
			return -1, true
		}
	}
	if len(a.prerelease) == 0 || len(b.prerelease) == 0 {
		if len(a.prerelease) == len(b.prerelease) {
			return 0, true
		}
		if len(a.prerelease) == 0 {
			return 1, true
		}
		return -1, true
	}
	for index := 0; index < len(a.prerelease) || index < len(b.prerelease); index++ {
		if index >= len(a.prerelease) {
			return -1, true
		}
		if index >= len(b.prerelease) {
			return 1, true
		}
		leftPart, rightPart := a.prerelease[index], b.prerelease[index]
		if leftPart == rightPart {
			continue
		}
		leftNumber, leftErr := strconv.Atoi(leftPart)
		rightNumber, rightErr := strconv.Atoi(rightPart)
		if leftErr == nil && rightErr == nil {
			if leftNumber > rightNumber {
				return 1, true
			}
			return -1, true
		}
		if leftErr == nil {
			return -1, true
		}
		if rightErr == nil {
			return 1, true
		}
		if leftPart > rightPart {
			return 1, true
		}
		return -1, true
	}
	return 0, true
}

func isNumeric(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

type signedManifestPayload struct {
	SchemaVersion int                                    `json:"schemaVersion"`
	Version       string                                 `json:"version"`
	PublishedAt   string                                 `json:"publishedAt"`
	Urgency       string                                 `json:"urgency"`
	RolloutHours  int                                    `json:"rolloutHours"`
	Artifacts     map[string]client.AgentReleaseArtifact `json:"artifacts"`
	SigningKeyID  string                                 `json:"signingKeyId"`
}

func trustedSigningKeys() map[string]ed25519.PublicKey {
	out := map[string]ed25519.PublicKey{}
	for _, entry := range strings.Split(TrustedUpdateSigningKeys, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		keyID, encoded, ok := strings.Cut(entry, ":")
		if !ok || strings.TrimSpace(keyID) == "" {
			continue
		}
		raw, err := base64.RawURLEncoding.DecodeString(encoded)
		if err != nil {
			raw, err = base64.StdEncoding.DecodeString(encoded)
		}
		if err == nil && len(raw) == ed25519.PublicKeySize {
			out[strings.TrimSpace(keyID)] = ed25519.PublicKey(raw)
		}
	}
	return out
}

func signedManifestBytes(manifest client.AgentReleaseManifest) ([]byte, error) {
	return json.Marshal(signedManifestPayload{
		SchemaVersion: manifest.SchemaVersion,
		Version:       manifest.Version,
		PublishedAt:   manifest.PublishedAt,
		Urgency:       manifest.Urgency,
		RolloutHours:  manifest.RolloutHours,
		Artifacts:     manifest.Artifacts,
		SigningKeyID:  manifest.SigningKeyID,
	})
}

func verifyDirectiveSignature(directive client.AgentUpdateDirective) error {
	keys := trustedSigningKeys()
	publicKey, ok := keys[directive.Manifest.SigningKeyID]
	if !ok {
		return errors.New("unknown update signing key")
	}
	signature, err := base64.RawURLEncoding.DecodeString(directive.Manifest.Signature)
	if err != nil {
		signature, err = base64.StdEncoding.DecodeString(directive.Manifest.Signature)
	}
	if err != nil || len(signature) != ed25519.SignatureSize {
		return errors.New("invalid update signature encoding")
	}
	payload, err := signedManifestBytes(directive.Manifest)
	if err != nil {
		return err
	}
	if !ed25519.Verify(publicKey, payload, signature) {
		return errors.New("invalid update signature")
	}
	if directive.Manifest.Version != directive.TargetVersion || directive.Manifest.Urgency != directive.Urgency {
		return errors.New("update directive does not match signed manifest")
	}
	artifact, ok := directive.Manifest.Artifacts[directive.ArtifactKey]
	if !ok {
		return errors.New("signed manifest missing directive artifact")
	}
	if artifact.URL != directive.ArtifactURL || strings.ToLower(artifact.SHA256) != strings.ToLower(directive.SHA256) || artifact.Size != directive.Size {
		return errors.New("update artifact does not match signed manifest")
	}
	return nil
}

// Apply downloads and installs an agent update artifact.
//
// Current contract: the artifact is a single executable. Apply atomically
// replaces opts.ExecutablePath (typically os.Executable()) and leaves a
// .previous sibling for rollback. Linux and Darwin both use this path today.
//
// Future Darwin: when a release ships a menu-bar companion, Darwin artifacts
// may become multi-file (.app.zip or Contents archive). Apply should then
// unpack into the enclosing *.app next to os.Executable() when that path is
// under *.app/Contents/MacOS/, with a bundle snapshot for rollback. Linux
// remains single-binary. See docs/agent-releases.md ("Future macOS menu bar companion").
func Apply(ctx context.Context, cfg *config.Config, opts ApplyOptions) (bool, error) {
	directive := opts.Directive
	comparison, valid := CompareVersions(directive.TargetVersion, opts.CurrentVersion)
	if !valid || comparison <= 0 {
		return false, fmt.Errorf("target version %q is not newer than %q", directive.TargetVersion, opts.CurrentVersion)
	}
	if cfg.BlockedUpdateVersion == directive.TargetVersion && !opts.Force {
		return false, ErrBlockedVersion
	}
	if directive.Size <= 0 || directive.Size > MaxArtifactBytes {
		return false, fmt.Errorf("artifact size %d exceeds limit", directive.Size)
	}
	if len(directive.SHA256) != 64 {
		return false, errors.New("invalid artifact checksum")
	}
	if err := verifyDirectiveSignature(directive); err != nil {
		return false, err
	}

	report(opts.Reporter, directive, opts.CurrentVersion, "download_started", "download", "")
	artifactURL, err := resolveArtifactURL(opts.ControlPlaneURL, directive.ArtifactURL)
	if err != nil {
		report(opts.Reporter, directive, opts.CurrentVersion, "install_failed", "download", "invalid_url")
		return false, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, artifactURL, nil)
	if err != nil {
		return false, err
	}
	httpClient := opts.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 2 * time.Minute}
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		report(opts.Reporter, directive, opts.CurrentVersion, "install_failed", "download", "request_failed")
		return false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		report(opts.Reporter, directive, opts.CurrentVersion, "install_failed", "download", "http_status")
		return false, fmt.Errorf("artifact download returned %d", resp.StatusCode)
	}

	executable, err := executablePath(opts.ExecutablePath)
	if err != nil {
		return false, err
	}
	dir := filepath.Dir(executable)
	tmp, err := os.CreateTemp(dir, ".usejunction-update-*")
	if err != nil {
		return false, err
	}
	tmpPath := tmp.Name()
	removeTemp := true
	defer func() {
		if removeTemp {
			_ = os.Remove(tmpPath)
		}
	}()
	hash := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(tmp, hash), io.LimitReader(resp.Body, MaxArtifactBytes+1))
	closeErr := tmp.Close()
	if copyErr != nil || closeErr != nil {
		report(opts.Reporter, directive, opts.CurrentVersion, "install_failed", "download", "write_failed")
		return false, errors.Join(copyErr, closeErr)
	}
	if written > MaxArtifactBytes || written != directive.Size {
		report(opts.Reporter, directive, opts.CurrentVersion, "install_failed", "verify", "size_mismatch")
		return false, fmt.Errorf("artifact size mismatch: got %d want %d", written, directive.Size)
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(actual, directive.SHA256) {
		report(opts.Reporter, directive, opts.CurrentVersion, "install_failed", "verify", "checksum_mismatch")
		return false, errors.New("artifact checksum verification failed")
	}
	report(opts.Reporter, directive, opts.CurrentVersion, "download_completed", "verify", "")

	info, err := os.Stat(executable)
	if err != nil {
		return false, err
	}
	mode := info.Mode().Perm()
	if mode == 0 {
		mode = 0755
	}
	if err := os.Chmod(tmpPath, mode); err != nil {
		return false, err
	}
	report(opts.Reporter, directive, opts.CurrentVersion, "install_started", "replace", "")
	pending := pendingState{
		Action: "install", AttemptID: directive.AttemptID, ReleaseVersion: directive.TargetVersion,
		InstalledVersion: directive.TargetVersion, PreviousVersion: opts.CurrentVersion,
	}
	history := historyState{
		AttemptID: directive.AttemptID, ReleaseVersion: directive.TargetVersion,
		InstalledVersion: directive.TargetVersion, PreviousVersion: opts.CurrentVersion,
	}
	if err := writeJSON(config.UpdateStatePath(), pending); err != nil {
		return false, err
	}
	if err := writeJSON(config.UpdateHistoryPath(), history); err != nil {
		_ = os.Remove(config.UpdateStatePath())
		return false, err
	}

	deferred, err := replaceExecutable(executable, tmpPath)
	if err != nil {
		_ = os.Remove(config.UpdateStatePath())
		_ = os.Remove(config.UpdateHistoryPath())
		report(opts.Reporter, directive, opts.CurrentVersion, "install_failed", "replace", "replace_failed")
		return false, err
	}
	if deferred {
		removeTemp = false
	}
	return true, nil
}

type handoffResult struct {
	OK     bool   `json:"ok"`
	Action string `json:"action"`
	Error  string `json:"error,omitempty"`
}

// ConsumeHandoffResult closes the loop for Windows' deferred executable swap.
// Successful swaps are confirmed by ConfirmPending; failures are reported and
// the stale pending marker is cleared so the restored daemon can keep running.
func ConsumeHandoffResult(cfg *config.Config, reporter Reporter, currentVersion string) error {
	var result handoffResult
	if err := readJSON(config.UpdateHandoffResultPath(), &result); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer os.Remove(config.UpdateHandoffResultPath())
	if result.OK {
		return nil
	}
	var pending pendingState
	if err := readJSON(config.UpdateStatePath(), &pending); err == nil && reporter != nil {
		_ = reporter.ReportAgentUpdate(client.AgentUpdateEvent{
			AttemptID: pending.AttemptID, EventID: newEventID(), ReleaseVersion: pending.ReleaseVersion,
			Event: "install_failed", CurrentVersion: currentVersion, TargetVersion: pending.ReleaseVersion,
			Stage: "replace", ErrorCode: "windows_handoff_failed",
		})
	}
	_ = os.Remove(config.UpdateStatePath())
	if result.Error == "" {
		result.Error = "Windows update handoff failed"
	}
	return errors.New(result.Error)
}

func ConfirmPending(cfg *config.Config, reporter Reporter, currentVersion string) (bool, error) {
	var pending pendingState
	if err := readJSON(config.UpdateStatePath(), &pending); err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	event := "install_confirmed"
	if pending.Action == "rollback" {
		event = "rollback_confirmed"
	}
	if currentVersion != pending.InstalledVersion {
		return false, fmt.Errorf("pending update expected version %s, running %s", pending.InstalledVersion, currentVersion)
	}
	err := reporter.ReportAgentUpdate(client.AgentUpdateEvent{
		AttemptID: pending.AttemptID, EventID: newEventID(), ReleaseVersion: pending.ReleaseVersion,
		Event: event, CurrentVersion: currentVersion, TargetVersion: pending.ReleaseVersion,
	})
	if err != nil {
		return false, err
	}
	if err := os.Remove(config.UpdateStatePath()); err != nil && !os.IsNotExist(err) {
		return false, err
	}
	return true, nil
}

func Rollback(cfg *config.Config, reporter Reporter, executableOverride string) error {
	var history historyState
	if err := readJSON(config.UpdateHistoryPath(), &history); err != nil {
		return fmt.Errorf("no previous update available: %w", err)
	}
	executable, err := executablePath(executableOverride)
	if err != nil {
		return err
	}
	previous := executable + ".previous"
	if _, err := os.Stat(previous); err != nil {
		return fmt.Errorf("previous binary unavailable: %w", err)
	}
	_ = reporter.ReportAgentUpdate(client.AgentUpdateEvent{
		AttemptID: history.AttemptID, EventID: newEventID(), ReleaseVersion: history.ReleaseVersion,
		Event: "rollback_started", CurrentVersion: history.InstalledVersion, TargetVersion: history.ReleaseVersion,
	})
	pending := pendingState{
		Action: "rollback", AttemptID: history.AttemptID, ReleaseVersion: history.ReleaseVersion,
		InstalledVersion: history.PreviousVersion, PreviousVersion: history.InstalledVersion,
	}
	if err := writeJSON(config.UpdateStatePath(), pending); err != nil {
		return err
	}
	deferred, err := rollbackExecutable(executable, previous)
	if err != nil {
		_ = os.Remove(config.UpdateStatePath())
		return err
	}
	previousBlockedVersion := cfg.BlockedUpdateVersion
	cfg.BlockedUpdateVersion = history.InstalledVersion
	if err := config.Save(cfg); err != nil {
		if deferred {
			_ = os.Remove(config.UpdateStatePath())
			return err
		}
		restore := executable + ".rollback-restore"
		_ = os.Remove(restore)
		if renameErr := os.Rename(executable, restore); renameErr == nil {
			if renameErr = os.Rename(previous, executable); renameErr == nil {
				_ = os.Rename(restore, previous)
			} else {
				_ = os.Rename(restore, executable)
			}
		}
		cfg.BlockedUpdateVersion = previousBlockedVersion
		_ = os.Remove(config.UpdateStatePath())
		return err
	}
	return writeJSON(config.UpdateHistoryPath(), historyState{
		AttemptID: history.AttemptID, ReleaseVersion: history.ReleaseVersion,
		InstalledVersion: history.PreviousVersion, PreviousVersion: history.InstalledVersion,
	})
}

func resolveArtifactURL(base, artifact string) (string, error) {
	baseURL, err := url.Parse(strings.TrimRight(base, "/") + "/")
	if err != nil {
		return "", err
	}
	artifactURL, err := url.Parse(artifact)
	if err != nil {
		return "", err
	}
	resolved := baseURL.ResolveReference(artifactURL)
	if resolved.Scheme != "http" && resolved.Scheme != "https" {
		return "", errors.New("artifact URL must use HTTP or HTTPS")
	}
	if resolved.Scheme == "http" && resolved.Hostname() != "localhost" && resolved.Hostname() != "127.0.0.1" && resolved.Hostname() != "::1" {
		return "", errors.New("artifact URL must use HTTPS outside localhost")
	}
	return resolved.String(), nil
}

func executablePath(override string) (string, error) {
	path := override
	var err error
	if path == "" {
		path, err = os.Executable()
		if err != nil {
			return "", err
		}
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err == nil {
		path = resolved
	}
	return filepath.Abs(path)
}

func report(reporter Reporter, directive client.AgentUpdateDirective, currentVersion, event, stage, errorCode string) {
	if reporter == nil {
		return
	}
	_ = reporter.ReportAgentUpdate(client.AgentUpdateEvent{
		AttemptID: directive.AttemptID, EventID: newEventID(), ReleaseVersion: directive.TargetVersion,
		Event: event, CurrentVersion: currentVersion, TargetVersion: directive.TargetVersion,
		Stage: stage, ErrorCode: errorCode,
	})
}

func newEventID() string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("event-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes[:])
}

func writeJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func readJSON(path string, out any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, out)
}
