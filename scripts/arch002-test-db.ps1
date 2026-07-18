param(
  [ValidateSet("start", "reset", "stop", "status")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

$containerName = "entrenaconia-arch002-test-db"
$databaseName = "arch002_test"
$databasePort = 55432
$databaseUrl = "postgresql://postgres@127.0.0.1:$databasePort/$databaseName"
$repoRoot = Split-Path -Parent $PSScriptRoot
$baselinePath = Join-Path $repoRoot "backend\db\baseline\app_schema_baseline.sql"
$preludePath = Join-Path $PSScriptRoot "arch002-test-db\prelude.sql"
$fixturesPath = Join-Path $PSScriptRoot "arch002-test-db\fixtures.sql"

function Invoke-Docker {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker falló: docker $($Arguments -join ' ')"
  }
}

function Test-ContainerExists {
  $name = & docker ps -a --filter "name=^/$containerName$" --format "{{.Names}}"
  return $name -eq $containerName
}

function Test-ContainerRunning {
  $name = & docker ps --filter "name=^/$containerName$" --format "{{.Names}}"
  return $name -eq $containerName
}

function Wait-ForPostgres {
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec $containerName pg_isready -U postgres -d $databaseName *> $null
    if ($LASTEXITCODE -eq 0) {
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "PostgreSQL de ARCH-002 no quedó listo en 30 segundos"
}

function Copy-AndRunSql {
  param([string]$LocalPath, [string]$ContainerPath)

  Invoke-Docker cp $LocalPath "${containerName}:$ContainerPath"
  $psqlArguments = @(
    "exec", $containerName,
    "psql", "-q",
    "-U", "postgres",
    "-d", $databaseName,
    "-v", "ON_ERROR_STOP=1",
    "-f", $ContainerPath
  )
  Invoke-Docker -Arguments $psqlArguments
}

function Start-TestDatabase {
  if (Test-ContainerRunning) {
    Wait-ForPostgres
    return
  }

  if (Test-ContainerExists) {
    Invoke-Docker start $containerName
  } else {
    $runArguments = @(
      "run",
      "-d",
      "--name", $containerName,
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
      "-e", "POSTGRES_DB=$databaseName",
      "-p", "127.0.0.1:${databasePort}:5432",
      "postgres:17"
    )
    Invoke-Docker -Arguments $runArguments
  }

  Wait-ForPostgres
}

function Reset-TestDatabase {
  if (Test-ContainerExists) {
    Invoke-Docker rm -f $containerName
  }

  Start-TestDatabase
  Copy-AndRunSql $preludePath "/tmp/arch002-prelude.sql"
  Copy-AndRunSql $baselinePath "/tmp/app-schema-baseline.sql"
  Copy-AndRunSql $fixturesPath "/tmp/arch002-fixtures.sql"

  $counts = & docker exec $containerName psql -U postgres -d $databaseName -tAc `
    "SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='app') || ':' || (SELECT count(*) FROM app.users WHERE id=900001) || ':' || (SELECT count(*) FROM app.methodology_exercise_sessions WHERE id=900001);"
  if ($LASTEXITCODE -ne 0 -or $counts.Trim() -notmatch '^\d+:1:1$') {
    throw "El arnés no superó la comprobación final: $counts"
  }

  Write-Output "ARCH-002 DB aislada lista ($counts)"
  Write-Output "DATABASE_URL=$databaseUrl"
  Write-Output "NODE_ENV=test"
}

switch ($Action) {
  "start" {
    Start-TestDatabase
    Write-Output "DATABASE_URL=$databaseUrl"
  }
  "reset" {
    Reset-TestDatabase
  }
  "stop" {
    if (Test-ContainerRunning) {
      Invoke-Docker stop $containerName
    }
  }
  "status" {
    if (Test-ContainerRunning) {
      Wait-ForPostgres
      Write-Output "running DATABASE_URL=$databaseUrl"
    } elseif (Test-ContainerExists) {
      Write-Output "stopped"
    } else {
      Write-Output "missing"
    }
  }
}
