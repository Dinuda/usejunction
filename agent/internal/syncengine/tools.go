package syncengine

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"

	"github.com/usejunction/agent/internal/client"
)

// ToolsContentHash fingerprints the tool inventory payload.
// Must stay byte-compatible with apps/admin/lib/sync/tools-inventory.ts.
func ToolsContentHash(tools []client.ToolReport) string {
	lines := make([]string, 0, len(tools))
	for _, t := range tools {
		name := strings.TrimSpace(t.ToolName)
		if name == "" {
			continue
		}
		detected := "1"
		if !t.Detected {
			detected = "0"
		}
		configured := "0"
		if t.Configured {
			configured = "1"
		}
		lines = append(lines, fmt.Sprintf(
			"%s|%s|%s|%s|%s",
			name,
			detected,
			configured,
			strings.TrimSpace(t.Version),
			strings.TrimSpace(t.ConfigPath),
		))
	}
	sort.Strings(lines)
	payload := strings.Join(lines, "\n")
	sum := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(sum[:])[:32]
}
