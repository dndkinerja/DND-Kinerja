$pidFile = Join-Path $PSScriptRoot '.server.pid'
if (Test-Path $pidFile) {
    $serverPid = [int](Get-Content $pidFile -Raw)
    Stop-Process -Id $serverPid -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
    Write-Host 'Server DND Kinerja dihentikan.'
} else {
    Write-Host 'Tidak ditemukan server DND Kinerja yang berjalan.'
}
Read-Host 'Tekan Enter untuk menutup'
