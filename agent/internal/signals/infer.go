package signals

import "strings"

func inferDomain(app, title string) *string {
	text := strings.ToLower(app + " " + title)
	for domain := range aiDomainTools {
		if strings.Contains(text, domain) {
			value := domain
			return &value
		}
	}
	switch {
	case strings.Contains(text, "chatgpt"):
		value := "chatgpt.com"
		return &value
	case strings.Contains(text, "claude"):
		value := "claude.ai"
		return &value
	case strings.Contains(text, "gemini"):
		value := "gemini.google.com"
		return &value
	case strings.Contains(text, "perplexity"):
		value := "perplexity.ai"
		return &value
	case strings.Contains(text, "copilot"):
		value := "copilot.microsoft.com"
		return &value
	default:
		return nil
	}
}
