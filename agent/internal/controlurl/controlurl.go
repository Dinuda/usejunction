package controlurl

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

func Validate(raw string) error {
	parsed, err := url.ParseRequestURI(strings.TrimSpace(raw))
	if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return fmt.Errorf("URL must be an absolute http(s) URL")
	}
	if parsed.Scheme == "https" {
		return nil
	}
	if IsLoopbackHost(parsed.Hostname()) {
		return nil
	}
	return fmt.Errorf("URL must use HTTPS unless it is loopback")
}

func IsLoopbackHost(host string) bool {
	if host == "localhost" {
		return true
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback()
	}
	return false
}
