//go:build windows

package updater

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"golang.org/x/sys/windows"

	"github.com/usejunction/agent/internal/config"
)

const windowsAgentTaskName = "UseJunction Agent"

func replaceExecutable(executable, staged string) (bool, error) {
	if !isRunningExecutable(executable) {
		return directReplace(executable, staged)
	}
	return launchWindowsHandoff("install", executable, staged, executable+".previous")
}

func rollbackExecutable(executable, previous string) (bool, error) {
	if !isRunningExecutable(executable) {
		return directRollback(executable, previous)
	}
	return launchWindowsHandoff("rollback", executable, "", previous)
}

func isRunningExecutable(path string) bool {
	running, err := os.Executable()
	if err != nil {
		return true
	}
	running, _ = filepath.Abs(running)
	path, _ = filepath.Abs(path)
	return strings.EqualFold(filepath.Clean(running), filepath.Clean(path))
}

func directReplace(executable, staged string) (bool, error) {
	previous := executable + ".previous"
	_ = os.Remove(previous)
	if err := os.Rename(executable, previous); err != nil {
		return false, err
	}
	if err := os.Rename(staged, executable); err != nil {
		_ = os.Rename(previous, executable)
		return false, err
	}
	return false, nil
}

func directRollback(executable, previous string) (bool, error) {
	swap := executable + ".rollback-swap"
	_ = os.Remove(swap)
	if err := os.Rename(executable, swap); err != nil {
		return false, err
	}
	if err := os.Rename(previous, executable); err != nil {
		_ = os.Rename(swap, executable)
		return false, err
	}
	if err := os.Rename(swap, previous); err != nil {
		_ = os.Rename(executable, previous)
		_ = os.Rename(swap, executable)
		return false, err
	}
	return false, nil
}

func launchWindowsHandoff(action, executable, staged, previous string) (bool, error) {
	scriptPath := filepath.Join(config.ConfigDir(), "update-handoff.ps1")
	script := `param(
  [int]$ParentPid,
  [string]$Action,
  [string]$Executable,
  [string]$Staged,
  [string]$Previous,
  [string]$TaskName,
  [string]$ResultPath
)
$ErrorActionPreference = "Stop"
$result = @{ ok = $false; action = $Action; error = "" }
try {
  for ($i = 0; $i -lt 120; $i++) {
    if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
  }
  if (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) { throw "Timed out waiting for the agent to exit." }
  if ($Action -eq "install") {
    Remove-Item -Force $Previous -ErrorAction SilentlyContinue
    Move-Item -Force $Executable $Previous
    try { Move-Item -Force $Staged $Executable } catch { Move-Item -Force $Previous $Executable; throw }
  } elseif ($Action -eq "rollback") {
    $swap = "$Executable.rollback-swap"
    Remove-Item -Force $swap -ErrorAction SilentlyContinue
    Move-Item -Force $Executable $swap
    try {
      Move-Item -Force $Previous $Executable
      Move-Item -Force $swap $Previous
    } catch {
      if ((Test-Path $swap) -and -not (Test-Path $Executable)) { Move-Item -Force $swap $Executable }
      throw
    }
  } else { throw "Unknown handoff action: $Action" }
  $result.ok = $true
} catch {
  $result.error = $_.Exception.Message
} finally {
  $result | ConvertTo-Json -Compress | Set-Content -Encoding UTF8 $ResultPath
  for ($i = 0; $i -lt 40; $i++) {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task -or $task.State -ne "Running") { break }
    Start-Sleep -Milliseconds 250
  }
  Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}
`
	if err := os.MkdirAll(config.ConfigDir(), 0700); err != nil {
		return false, err
	}
	if err := os.WriteFile(scriptPath, []byte(script), 0600); err != nil {
		return false, err
	}
	args := []string{
		"-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", scriptPath,
		"-ParentPid", strconv.Itoa(os.Getpid()), "-Action", action, "-Executable", executable,
		"-Staged", staged, "-Previous", previous, "-TaskName", windowsAgentTaskName,
		"-ResultPath", config.UpdateHandoffResultPath(),
	}
	cmd := exec.Command("powershell.exe", args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NEW_PROCESS_GROUP | windows.DETACHED_PROCESS,
	}
	if err := cmd.Start(); err != nil {
		return false, fmt.Errorf("start Windows update handoff: %w", err)
	}
	_ = cmd.Process.Release()
	return true, nil
}
