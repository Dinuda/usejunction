package config

// ResetRuntimeForTest clears in-process profile overrides between tests.
func ResetRuntimeForTest() {
	configuredHome = ""
}
