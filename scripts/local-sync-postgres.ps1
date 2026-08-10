[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('init', 'start', 'validate', 'protocol', 'reset', 'stop')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $projectRoot 'fixtures/local-sync-postgres'
$composeFile = Join-Path $fixtureRoot 'compose.yaml'
$envFile = Join-Path $fixtureRoot '.env'

function Ensure-LocalCredentials {
  if (Test-Path -LiteralPath $envFile) {
    return
  }

  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  $password = [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
  @(
    'POSTGRES_DB=cyberbistro_sync_fixture'
    'POSTGRES_USER=sync_fixture'
    "POSTGRES_PASSWORD=$password"
  ) | Set-Content -LiteralPath $envFile -Encoding ascii
}

function Invoke-FixtureCompose([string[]]$ComposeArguments) {
  & docker compose --project-name cyberbistro-sync-fixture --env-file $envFile -f $composeFile @ComposeArguments
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose failed with exit code $LASTEXITCODE."
  }
}

Ensure-LocalCredentials

switch ($Action) {
  'init' {
    Invoke-FixtureCompose @('config', '--quiet')
    Write-Host "Fixture configuration is valid. Credentials are local-only at $envFile."
  }
  'start' {
    & docker info --format '{{.ServerVersion}}' | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'Docker Engine is unavailable. Start Docker Desktop and retry.'
    }
    Invoke-FixtureCompose @('up', '--detach', '--wait', '--wait-timeout', '60')
  }
  'validate' {
    Invoke-FixtureCompose @('exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'sync_fixture', '-d', 'cyberbistro_sync_fixture', '-f', '/fixture/validate.sql')
  }
  'protocol' {
    Invoke-FixtureCompose @('exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'sync_fixture', '-d', 'cyberbistro_sync_fixture', '-f', '/fixture/validate-protocol.sql')
  }
  'reset' {
    Invoke-FixtureCompose @('down', '--volumes', '--remove-orphans')
    Write-Host 'Fixture volume removed. Run start to create a new synthetic database.'
  }
  'stop' {
    Invoke-FixtureCompose @('down', '--remove-orphans')
    Write-Host 'Fixture stopped. Its named volume was retained.'
  }
}
