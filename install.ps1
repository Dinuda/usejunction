[CmdletBinding()]
param(
  [string]$Token = "",
  [string]$Connect = "",
  [string]$Url = "",
  [switch]$Upgrade
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$TaskName = "UseJunction Agent"
$Version = "0.1.0"
if ([string]::IsNullOrWhiteSpace($Url)) {
  $Url = if ($env:USEJUNCTION_URL) { $env:USEJUNCTION_URL } else { "http://localhost:3001" }
}
$Url = $Url.TrimEnd("/")
$RootDir = Join-Path $HOME ".usejunction"
$InstallDir = Join-Path $RootDir "bin"
$Binary = Join-Path $InstallDir "usejunction.exe"
$ConfigPath = Join-Path $RootDir "config.json"
$RunnerPath = Join-Path $RootDir "run-agent.ps1"
$LogPath = Join-Path $RootDir "agent.log"

function Show-Usage {
  throw "Usage: install.ps1 [-Token <token> | -Connect <token> | -Upgrade] [-Url <control-plane>]"
}

if (-not $Upgrade -and [string]::IsNullOrWhiteSpace($Token) -and [string]::IsNullOrWhiteSpace($Connect)) {
  Show-Usage
}
if ($Upgrade -and -not (Test-Path $ConfigPath)) {
  throw "No existing UseJunction enrollment found at $ConfigPath"
}

function Get-AgentArchitecture {
  $value = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  switch ($value.ToUpperInvariant()) {
    "AMD64" { return "amd64" }
    "ARM64" { return "arm64" }
    default { throw "Unsupported Windows architecture: $value. UseJunction supports x64 and ARM64." }
  }
}

function Get-LatestVersion {
  try {
    $release = Invoke-RestMethod -UseBasicParsing -Uri "$Url/api/agent-releases/latest" -TimeoutSec 20
    $candidate = if ($release.manifest.version) { $release.manifest.version } else { $release.version }
    if ($candidate -and $candidate -match '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$') {
      return [string]$candidate
    }
  } catch {
    if ($Upgrade) { throw "No active agent release is available from $Url." }
  }
  if ($Upgrade) { throw "No active agent release is available from $Url." }
  return $Version
}

function Compare-SemVer([string]$Left, [string]$Right) {
  $leftCore = $Left.Split('-')[0].Split('.')
  $rightCore = $Right.Split('-')[0].Split('.')
  for ($i = 0; $i -lt 3; $i++) {
    $a = [int]$leftCore[$i]
    $b = [int]$rightCore[$i]
    if ($a -gt $b) { return 1 }
    if ($a -lt $b) { return -1 }
  }
  $leftPre = if ($Left.Contains('-')) { $Left.Substring($Left.IndexOf('-') + 1) } else { "" }
  $rightPre = if ($Right.Contains('-')) { $Right.Substring($Right.IndexOf('-') + 1) } else { "" }
  if ($leftPre -eq $rightPre) { return 0 }
  if (-not $leftPre) { return 1 }
  if (-not $rightPre) { return -1 }
  return [string]::CompareOrdinal($leftPre, $rightPre)
}

function Download-Agent([string]$Base, [string]$Name, [string]$Destination, [string]$TempDir) {
  $checksumPath = Join-Path $TempDir ("checksums-" + [Guid]::NewGuid().ToString("N") + ".txt")
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Name" -OutFile $Destination -TimeoutSec 120
  Invoke-WebRequest -UseBasicParsing -Uri "$Base/checksums.txt" -OutFile $checksumPath -TimeoutSec 30
  $escaped = [Regex]::Escape($Name)
  $line = Get-Content $checksumPath | Where-Object { $_ -match "^([a-fA-F0-9]{64})\s+$escaped$" } | Select-Object -First 1
  if (-not $line) { throw "Checksum for $Name was not found." }
  $expected = ([Regex]::Match($line, '^([a-fA-F0-9]{64})')).Groups[1].Value.ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 -Path $Destination).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "Agent checksum verification failed." }
}

function Stop-AgentTask {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 750
  }
}

function Install-AgentBinary([string]$Source) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  $staged = "$Binary.new"
  $previous = "$Binary.previous"
  Copy-Item -Force $Source $staged
  if (Test-Path $previous) { Remove-Item -Force $previous }
  if (Test-Path $Binary) { Move-Item -Force $Binary $previous }
  try {
    Move-Item -Force $staged $Binary
  } catch {
    if ((Test-Path $previous) -and -not (Test-Path $Binary)) { Move-Item -Force $previous $Binary }
    throw
  }
}

function Add-AgentToPath {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @($userPath -split ';' | Where-Object { $_ })
  if (-not ($parts | Where-Object { $_.TrimEnd('\') -ieq $InstallDir.TrimEnd('\') })) {
    $next = if ($userPath) { "$userPath;$InstallDir" } else { $InstallDir }
    [Environment]::SetEnvironmentVariable("Path", $next, "User")
  }
  if (-not (($env:Path -split ';') | Where-Object { $_.TrimEnd('\') -ieq $InstallDir.TrimEnd('\') })) {
    $env:Path = "$env:Path;$InstallDir"
  }
}

function Register-AgentTask {
  New-Item -ItemType Directory -Force -Path $RootDir | Out-Null
  $escapedBinary = $Binary.Replace("'", "''")
  $escapedLog = $LogPath.Replace("'", "''")
  @"
`$ErrorActionPreference = "Continue"
& '$escapedBinary' daemon *>> '$escapedLog'
exit `$LASTEXITCODE
"@ | Set-Content -Encoding UTF8 -Path $RunnerPath

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerPath`""
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
  $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "UseJunction coding telemetry agent" -Force | Out-Null
}

$Version = Get-LatestVersion
$Architecture = Get-AgentArchitecture
$Artifact = "usejunction-windows-$Architecture.exe"

if ($Upgrade -and (Test-Path $Binary)) {
  $statusText = & $Binary status --format json 2>$null
  try { $current = ($statusText | ConvertFrom-Json).agentVersion } catch { $current = "" }
  if (-not $current) { throw "Could not determine the installed agent version; refusing an unverified upgrade." }
  $order = Compare-SemVer $Version $current
  if ($order -lt 0) { throw "Refusing to downgrade UseJunction from v$current to v$Version." }
  if ($order -eq 0) { Write-Host "UseJunction agent v$current is already installed."; exit 0 }
}

$TempDir = Join-Path ([IO.Path]::GetTempPath()) ("usejunction-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
try {
  $downloadPath = Join-Path $TempDir $Artifact
  $bases = @()
  if ($env:USEJUNCTION_DOWNLOAD_BASE) { $bases += $env:USEJUNCTION_DOWNLOAD_BASE.TrimEnd('/') }
  $bases += "$Url/releases/download/v$Version"
  $bases += "https://github.com/usejunction/usejunction/releases/download/agent-v$Version"
  $downloaded = $false
  foreach ($base in $bases) {
    try {
      Write-Host "Downloading UseJunction agent $Version for windows/$Architecture from $base..."
      Download-Agent $base $Artifact $downloadPath $TempDir
      $downloaded = $true
      break
    } catch {
      Write-Warning "Download from $base failed: $($_.Exception.Message)"
    }
  }
  if (-not $downloaded) { throw "Could not download a verified UseJunction Windows agent." }

  Stop-AgentTask
  Install-AgentBinary $downloadPath
  Add-AgentToPath
} finally {
  Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}

if ($Upgrade) {
  Register-AgentTask
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2
  & $Binary status
  Write-Host "UseJunction agent upgraded to v$Version."
  exit 0
}

if ($Connect) {
  $joinUrl = "$Url/connect-invite/$Connect"
  Write-Host "Opening browser to authenticate..."
  Write-Host "  $joinUrl"
  Start-Process $joinUrl
  Write-Host "Waiting for you to sign in (up to 10 minutes)..."
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    try {
      $invite = Invoke-RestMethod -UseBasicParsing -Uri "$Url/api/connect-invite/$Connect/status" -TimeoutSec 15
      if ($invite.status -eq "ready" -and $invite.enrollmentToken) {
        $Token = [string]$invite.enrollmentToken
        Write-Host "Authenticated. Enrolling device..."
        break
      }
      if ($invite.status -in @("expired", "used")) { throw "Connect invite $($invite.status). Ask your admin for a new command." }
    } catch {
      if ($_.Exception.Message -match '^Connect invite') { throw }
    }
    Start-Sleep -Seconds 5
  }
  if (-not $Token) { throw "Timed out waiting for browser authentication." }
}

Write-Host "Enrolling device..."
& $Binary enroll --token $Token --url $Url --setup
if ($LASTEXITCODE -ne 0) { throw "Device enrollment failed." }
Write-Host "Detecting tools..."
& $Binary doctor
if ($LASTEXITCODE -ne 0) { Write-Warning "Tool detection completed with warnings." }

Register-AgentTask
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
& $Binary status
Write-Host ""
Write-Host "UseJunction installed. Admin panel: $Url"
Write-Host "The agent will also start automatically when you sign in to Windows."
