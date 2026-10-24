$ErrorActionPreference = 'Stop'
$url = 'http://127.0.0.1:8765/'
$server = Join-Path $PSScriptRoot 'server.mjs'

try {
    Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing | Out-Null
    Start-Process $url
    exit 0
} catch { }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host 'Node.js tidak ditemukan. Pasang Node.js terlebih dahulu, lalu jalankan ulang.' -ForegroundColor Yellow
    Read-Host 'Tekan Enter untuk menutup'
    exit 1
}

$process = Start-Process -FilePath $node.Source -ArgumentList @('server.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
Set-Content -Path (Join-Path $PSScriptRoot '.server.pid') -Value $process.Id
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 300
    try {
        Invoke-WebRequest -Uri $url -TimeoutSec 1 -UseBasicParsing | Out-Null
        Start-Process $url
        exit 0
    } catch { }
}
Write-Host 'Server belum siap. Periksa apakah port 8765 sedang digunakan.' -ForegroundColor Red
Read-Host 'Tekan Enter untuk menutup'
