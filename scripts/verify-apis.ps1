# Hydro JSON 插件自检（Windows PowerShell）
#   $env:BASE_URL="http://127.0.0.1:8888"; $env:MY_UID="27"; .\hydro-api\scripts\verify-apis.ps1
# 带会话：$env:COOKIE_HEADER="Cookie: sid=YOUR_SID"

$ErrorActionPreference = "Stop"
$base = if ($env:BASE_URL) { $env:BASE_URL.TrimEnd('/') } else { "http://127.0.0.1:8888" }
$myUid = $env:MY_UID
$cookie = $env:COOKIE_HEADER

function Get-JsonLabel {
  param([string]$Name, [string]$Url)
  Write-Host ""
  Write-Host "--- $Name ---" -ForegroundColor Cyan
  $headers = @{ Accept = "application/json" }
  if ($cookie) {
    $pair = $cookie -split ":", 2
    if ($pair.Length -eq 2) { $headers[$pair[0].Trim()] = $pair[1].Trim() }
  }
  try {
    $r = Invoke-RestMethod -Uri $Url -Headers $headers -Method Get
    $r | ConvertTo-Json -Depth 8
  } catch {
    Write-Host "Request failed: $_" -ForegroundColor Yellow
  }
}

Write-Host "BASE_URL=$base"
if ($myUid) { Write-Host "MY_UID=$myUid" }

Get-JsonLabel "user_me" "$base/api/user/me"
Get-JsonLabel "problems" "$base/api/problem?page=1&limit=2"
Get-JsonLabel "contests" "$base/api/contest?page=1&limit=2"
Get-JsonLabel "sync_health" "$base/api/sync/health"

if ($myUid) {
  Get-JsonLabel "record_official" "$base/api/record?page=1&limit=5&uid=$myUid&excludePretest=1"
  Get-JsonLabel "record_with_pretest" "$base/api/record?page=1&limit=3&uid=$myUid&excludePretest=0"
} else {
  Write-Host ""
  Write-Host 'Tip: MY_UID unset; skipping /api/record. Example: $env:MY_UID=27 .\verify-apis.ps1'
}

Get-JsonLabel "domain_users_sample" "$base/api/domainUsers?domainId=system&page=1&limit=2&sortField=rp&sortOrder=desc"
Get-JsonLabel "sync_bootstrap" "$base/api/sync/bootstrap"

Write-Host ""
Write-Host "sync/bootstrap: expect login_required when logged out (or 401)."
Write-Host "Done."
