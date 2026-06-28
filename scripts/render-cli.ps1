$ErrorActionPreference = "Stop"

function Get-ProjectRoot {
  return Split-Path -Parent $PSScriptRoot
}

function Get-EnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $processValue = [Environment]::GetEnvironmentVariable($Name, "Process")
  if (-not [string]::IsNullOrWhiteSpace($processValue)) {
    return $processValue.Trim()
  }

  $userValue = [Environment]::GetEnvironmentVariable($Name, "User")
  if (-not [string]::IsNullOrWhiteSpace($userValue)) {
    return $userValue.Trim()
  }

  $projectRoot = Get-ProjectRoot
  $envPath = Join-Path $projectRoot ".env"

  if (-not (Test-Path $envPath)) {
    throw "No se encontró el archivo .env en la raíz del proyecto."
  }

  $line = Get-Content $envPath | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  return ($line -split "=", 2)[1].Trim()
}

function Get-RenderToken {
  $line = Get-EnvValue -Name "RENDER_API_KEY"
  if (-not $line) {
    $line = Get-EnvValue -Name "RENDER_MCP_BEARER_TOKEN"
  }

  if (-not $line) {
    throw "Falta RENDER_API_KEY o RENDER_MCP_BEARER_TOKEN en el entorno o en .env."
  }

  return $line
}

function Initialize-RenderConfig {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RenderExecutable
  )

  $projectRoot = Get-ProjectRoot
  $configDir = Join-Path $projectRoot ".render"
  $configPath = Join-Path $configDir "cli.yaml"

  if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
  }

  [Environment]::SetEnvironmentVariable("RENDER_CLI_CONFIG_PATH", $configPath, "Process")

  $workspace = Get-EnvValue -Name "RENDER_WORKSPACE_ID"
  if (-not $workspace) {
    $workspace = Get-EnvValue -Name "RENDER_WORKSPACE_NAME"
  }

  if (-not $workspace) {
    return
  }

  $currentWorkspace = ""
  try {
    $currentWorkspace = (& $RenderExecutable workspace current --output text 2>$null | Out-String).Trim()
  } catch {
    $currentWorkspace = ""
  }

  if ($currentWorkspace -notmatch [Regex]::Escape($workspace)) {
    & $RenderExecutable workspace set $workspace --confirm --output text | Out-Null
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
}

function Invoke-Render {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RenderArgs
  )

  $render = Get-Command render -ErrorAction SilentlyContinue
  if (-not $render) {
    throw "Render CLI no está instalado en Windows. Instálalo desde https://github.com/render-oss/cli/releases/latest"
  }

  $token = Get-RenderToken
  $previous = [Environment]::GetEnvironmentVariable("RENDER_API_KEY", "Process")

  try {
    [Environment]::SetEnvironmentVariable("RENDER_API_KEY", $token, "Process")
    Initialize-RenderConfig -RenderExecutable $render.Source
    & $render.Source @RenderArgs
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } finally {
    [Environment]::SetEnvironmentVariable("RENDER_API_KEY", $previous, "Process")
    [Environment]::SetEnvironmentVariable("RENDER_CLI_CONFIG_PATH", $null, "Process")
  }
}

if ($args.Count -eq 0) {
  Write-Host "Uso: render-cli.ps1 <comando render>"
  exit 1
}

Invoke-Render @args
