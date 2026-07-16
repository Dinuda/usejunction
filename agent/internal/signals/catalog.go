package signals

import "strings"

var aiDomainTools = map[string]string{
	"chatgpt.com":           "chatgpt",
	"chat.openai.com":       "chatgpt",
	"claude.ai":             "claude",
	"gemini.google.com":     "gemini",
	"perplexity.ai":         "perplexity",
	"copilot.microsoft.com": "copilot",
}

var aiTextTools = []struct {
	Needle string
	Tool   string
}{
	{"chatgpt", "chatgpt"},
	{"openai", "chatgpt"},
	{"claude", "claude"},
	{"gemini", "gemini"},
	{"perplexity", "perplexity"},
	{"copilot", "copilot"},
	{"cursor", "cursor"},
	{"codex", "codex"},
}

func aiTool(app string, domain *string, title string) string {
	if domain != nil {
		if tool := aiDomainTools[strings.ToLower(strings.TrimSpace(*domain))]; tool != "" {
			return tool
		}
	}
	text := strings.ToLower(app + " " + title)
	for _, item := range aiTextTools {
		if strings.Contains(text, item.Needle) {
			return item.Tool
		}
	}
	return ""
}

func category(app string, domain *string) string {
	text := strings.ToLower(app)
	if domain != nil {
		text += " " + strings.ToLower(*domain)
	}
	switch {
	case strings.Contains(text, "hubspot"), strings.Contains(text, "salesforce"):
		return "crm"
	case strings.Contains(text, "slack"), strings.Contains(text, "teams"):
		return "chat"
	case strings.Contains(text, "gmail"), strings.Contains(text, "outlook"), strings.Contains(text, "mail"):
		return "email"
	case strings.Contains(text, "docs.google"), strings.Contains(text, "word"), strings.Contains(text, "notion"):
		return "docs"
	case strings.Contains(text, "github"), strings.Contains(text, "gitlab"), strings.Contains(text, "linear"), strings.Contains(text, "jira"):
		return "engineering"
	case strings.Contains(text, "chrome"), strings.Contains(text, "edge"), strings.Contains(text, "safari"), strings.Contains(text, "firefox"):
		return "browser"
	default:
		return "app"
	}
}

func flowSignature(before segment, ai segment, after segment) string {
	beforeCategory := category(before.App, before.Domain)
	afterCategory := category(after.App, after.Domain)
	if before.App == "" {
		beforeCategory = "unknown"
	}
	if after.App == "" {
		afterCategory = "unknown"
	}
	return beforeCategory + "_to_" + ai.Tool + "_to_" + afterCategory
}
