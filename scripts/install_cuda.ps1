$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$python = Join-Path $repoRoot "venv\\Scripts\\python.exe"
if (!(Test-Path $python)) {
    $python = "python"
}

& $python -m pip install --upgrade pip
& $python -m pip install -e ".[ui]"
& $python -m pip install --index-url https://download.pytorch.org/whl/cu121 torch==2.8.0 torchaudio==2.8.0 torchvision==0.23.0
