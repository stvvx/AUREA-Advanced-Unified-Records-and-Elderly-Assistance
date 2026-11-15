param([switch]$SetupOnly)
$ErrorActionPreference = 'Stop'
$venvDir = Join-Path $PSScriptRoot '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$requirements = Join-Path $PSScriptRoot 'requirements.txt'

function Get-PythonBase([string]$Executable, [string[]]$Prefix = @()) {
    # Windows PowerShell turns native stderr into errors; a failed probe is expected.
    $ErrorActionPreference = 'Continue'
    $output = & $Executable @Prefix -c 'import sys; print(sys._base_executable)' 2>$null
    if ($LASTEXITCODE -eq 0) { return $output }
}

# A copied environment can exist but point at another computer.
$healthy = $false
if (Test-Path -LiteralPath $venvPython) {
    $healthy = [bool](Get-PythonBase $venvPython)
}
if (-not $healthy) {
    $basePython = $null
    $candidates = @(Get-Command python.exe -All -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
    foreach ($candidate in $candidates) {
        if ($candidate.StartsWith($venvDir, [StringComparison]::OrdinalIgnoreCase)) { continue }
        $resolved = Get-PythonBase $candidate
        if ($resolved -and (Test-Path -LiteralPath $resolved)) {
            $basePython = $resolved
            break
        }
    }
    if (-not $basePython -and (Get-Command py.exe -ErrorAction SilentlyContinue)) {
        $resolved = Get-PythonBase 'py.exe' @('-3')
        if ($resolved -and (Test-Path -LiteralPath $resolved)) { $basePython = $resolved }
    }
    if (-not $basePython) { throw 'Install Python 3.12 or newer with PATH enabled, then run this script again.' }
    if (Test-Path -LiteralPath $venvDir) {
        # Both paths are direct children of this script's backend directory.
        $backup = Join-Path $PSScriptRoot ('.venv-backup-' + [guid]::NewGuid().ToString('N'))
        Move-Item -LiteralPath $venvDir -Destination $backup
        Write-Host "Preserved the broken environment at $backup"
    }
    & $basePython -m venv $venvDir
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the local Python environment.' }
}
$stamp = Join-Path $venvDir '.requirements.sha256'
$hash = (Get-FileHash -LiteralPath $requirements -Algorithm SHA256).Hash
if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $hash) {
    & $venvPython -m pip install -r $requirements
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Resolve the pip error above and run this script again.' }
    Set-Content -LiteralPath $stamp -Value $hash
}
if ($SetupOnly) { Write-Host 'Backend environment is ready.'; return }
Push-Location $PSScriptRoot
try {
    & $venvPython app.py
    if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE." }
} finally { Pop-Location }
