//go:build windows

package uninstall

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"syscall"

	"golang.org/x/sys/windows"

	"github.com/usejunction/agent/internal/config"
)

func schedulePlatformCleanup() (bool, error) {
	file, err := os.CreateTemp("", "usejunction-uninstall-*.ps1")
	if err != nil {
		return false, err
	}
	scriptPath := file.Name()
	script := `param([int]$ParentPid, [string]$RootDir, [string]$TaskName)
$ErrorActionPreference = "SilentlyContinue"
for ($i = 0; $i -lt 120; $i++) {
  if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
Stop-ScheduledTask -TaskName $TaskName
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Start-Sleep -Milliseconds 500
Remove-Item -Recurse -Force $RootDir
Remove-Item -Force $MyInvocation.MyCommand.Path
`
	if _, err := file.WriteString(script); err != nil {
		_ = file.Close()
		_ = os.Remove(scriptPath)
		return false, err
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(scriptPath)
		return false, err
	}
	cmd := exec.Command("powershell.exe",
		"-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath,
		"-ParentPid", strconv.Itoa(os.Getpid()), "-RootDir", config.ConfigDir(), "-TaskName", "UseJunction Agent",
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NEW_PROCESS_GROUP | windows.DETACHED_PROCESS,
	}
	if err := cmd.Start(); err != nil {
		_ = os.Remove(scriptPath)
		return false, fmt.Errorf("start Windows uninstall handoff: %w", err)
	}
	_ = cmd.Process.Release()
	return true, nil
}
