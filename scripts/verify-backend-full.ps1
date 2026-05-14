# Backend smoke test (same checks as verify-backend-full.sh).
# Windows / PowerShell 5+
#
#   $env:BASE_URL="http://127.0.0.1:8888"
#   $env:DOMAIN_ID="system"
#   $env:MY_UID="27"
#   $env:COOKIE_HEADER="Cookie: ..."
#   powershell -ExecutionPolicy Bypass -File hydro-api/scripts/verify-backend-full.ps1
#
$ErrorActionPreference = "Continue"
if ($env:BASE_URL) {
    $base = $env:BASE_URL.TrimEnd("/")
}
else {
    $base = "http://127.0.0.1:8888"
}
if ($env:DOMAIN_ID) {
    $domainId = $env:DOMAIN_ID
}
else {
    $domainId = "system"
}
$myUid = $env:MY_UID
$cookieRaw = $env:COOKIE_HEADER

$script:pass = 0
$script:fail = 0
$script:warn = 0

function Headers-Common {
    $h = @{ Accept = "application/json" }
    if ($cookieRaw) {
        $pair = $cookieRaw -split ":", 2
        if ($pair.Length -eq 2) { $h[$pair[0].Trim()] = $pair[1].Trim() }
    }
    $h
}

function Looks-LoginRedirect([object]$obj) {
    if (-not $obj) { return $false }
    try {
        if ($obj.PSObject.Properties["url"]) {
            $u = [string]$obj.url
            if ($u -match "/login") { return $true }
        }
    }
    catch { }
    return $false
}

function Get-BodyJson([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -Headers (Headers-Common) -UseBasicParsing -ErrorAction Stop
        if (-not $r.Content) {
            return $null
        }
        return ($r.Content | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Invoke-PassMark([string]$msg) {
    Write-Host "[PASS] $msg" -ForegroundColor Green
    $script:pass++
}

function Invoke-FailMark([string]$msg, [string]$why) {
    Write-Host "[FAIL] $msg - $why" -ForegroundColor Red
    $script:fail++
}

function Invoke-WarnMark([string]$msg, [string]$why) {
    Write-Host "[WARN] $msg - $why" -ForegroundColor Yellow
    $script:warn++
}

Write-Host ("BASE_URL=" + $base + " DOMAIN_ID=" + $domainId)

Write-Host "`n━━ A1 GET /api/user/me ━━" -ForegroundColor Cyan
$j = Get-BodyJson ($base + "/api/user/me")
if (Looks-LoginRedirect $j) {
    Invoke-FailMark "user/me" "login redirect JSON"
}
elseif ($null -ne $j._id) {
    Invoke-PassMark "user/me has _id"
}
else {
    Invoke-FailMark "user/me" "unexpected body"
}

Write-Host "`n━━ A2 GET /api/sync/health ━━" -ForegroundColor Cyan
$j = Get-BodyJson ($base + "/api/sync/health")
if (Looks-LoginRedirect $j) {
    Invoke-FailMark "sync/health" "route not handled by plugin"
}
elseif ($null -ne $j.ok -and $j.ok -eq $true) {
    Invoke-PassMark "sync/health ok=true"
}
else {
    Invoke-WarnMark "sync/health" "missing ok:true"
}

Write-Host "`n━━ A3 GET /api/domainUsers ━━" -ForegroundColor Cyan
$suffix = [uri]::EscapeDataString($domainId)
$urlDu = '{0}/api/domainUsers?domainId={1}&page=1&limit=3&sortField=rp&sortOrder=desc' -f $base, $suffix
$j = Get-BodyJson $urlDu
if (Looks-LoginRedirect $j) {
    Invoke-FailMark "domainUsers" "login redirect (check Caddy/8890/noCheckPermView)"
}
elseif ($null -ne $j -and ($j.users -is [array])) {
    Invoke-PassMark "domainUsers returns users[]"
}
else {
    Invoke-FailMark "domainUsers" "missing users array"
}

Write-Host "`n━━ A4 POST /api/login ━━" -ForegroundColor Cyan
Write-Host "Skipped. Manual: POST JSON to $base/api/login"
Invoke-WarnMark "login POST" "Some Hydro builds block Guest POST; see README / login-server.js"

Write-Host "`n━━ A5 GET /api/sync/bootstrap ━━" -ForegroundColor Cyan
$j = Get-BodyJson ($base + "/api/sync/bootstrap")
if ([string]::IsNullOrWhiteSpace([string]$cookieRaw)) {
    if ((Looks-LoginRedirect $j) -or ($j -ne $null -and (($j | ConvertTo-Json -Compress) -match "login_required"))) {
        Invoke-PassMark "bootstrap guest: login or login_required expected"
    }
    else {
        Invoke-WarnMark "bootstrap guest" "unrecognized guest response"
        if ($j) { $j | ConvertTo-Json -Depth 4 | Write-Host }
    }
}
elseif ($null -ne $j.userDataVersion) {
    Invoke-PassMark "bootstrap has userDataVersion"
}
elseif (Looks-LoginRedirect $j) {
    Invoke-FailMark "bootstrap" "still login redirect with Cookie"
}
else {
    Invoke-WarnMark "bootstrap" "logged in but no userDataVersion"
}

Write-Host "`n━━ B1 GET /api/problem ━━" -ForegroundColor Cyan
$j = Get-BodyJson ('{0}/api/problem?page=1&limit=2' -f $base)
if (Looks-LoginRedirect $j) {
    Invoke-FailMark "api/problem" "needs session or forbidden"
}
elseif ($null -ne $j -and ($j.problems -is [array])) {
    Invoke-PassMark "api/problem JSON list"
}
else {
    Invoke-WarnMark "api/problem" "not problems[] shape"
}

Write-Host "`n━━ B2 GET /api/contest ━━" -ForegroundColor Cyan
$j = Get-BodyJson ('{0}/api/contest?page=1&limit=2' -f $base)
if (Looks-LoginRedirect $j) {
    Invoke-FailMark "api/contest" "needs session"
}
elseif ($null -ne $j -and ($j.contests -is [array])) {
    Invoke-PassMark "api/contest JSON list"
}
else {
    Invoke-WarnMark "api/contest" "not contests[] shape"
}

Write-Host "`n━━ B3 GET /ranking ━━" -ForegroundColor Cyan
$j = Get-BodyJson ($base + "/ranking?page=1")
if (Looks-LoginRedirect $j) {
    Invoke-FailMark "/ranking JSON" "no session -> SPA ranking empty"
}
elseif ($null -ne $j -and (($j.udocs -is [array]) -or ($j.users -is [array]) -or ($j.list -is [array]))) {
    Invoke-PassMark "ranking has list array"
}
else {
    Invoke-FailMark "/ranking" "missing udocs/users/list"
}

Write-Host "`n━━ B4 GET /p ━━" -ForegroundColor Cyan
$code = 0
try {
    $r = Invoke-WebRequest -Uri ($base + "/p") -Headers @{ Accept = "*/*" } -UseBasicParsing -ErrorAction Stop
    $code = [int]$r.StatusCode
}
catch {
    $resp = try { $_.Exception.Response.StatusCode.value__ } catch { $null }
    if ($resp) { $code = [int]$resp }
}

if ($code -in @(200, 301, 302)) {
    Invoke-PassMark ("/p HTTP " + $code)
}
else {
    Invoke-WarnMark "/p" ("HTTP " + $code)
}

Write-Host "`n━━ B5 GET /api/record ━━" -ForegroundColor Cyan
if ($myUid) {
    $j = Get-BodyJson ('{0}/api/record?page=1&limit=5&uid={1}&excludePretest=1' -f $base, $myUid)
    if (Looks-LoginRedirect $j) {
        Invoke-FailMark "api/record" "needs session"
    }
    elseif ($null -ne $j -and ($j.records -is [array])) {
        Invoke-PassMark "api/record(uid) JSON"
        $seenContest = $false
        foreach ($rec in $j.records) {
            if ($rec.PSObject.Properties.Name -contains "contest") { $seenContest = $true; break }
        }
        if (-not $seenContest) {
            Invoke-WarnMark "api/record" "records lack contest field (pretest filter weak)"
        }
    }
    else {
        Invoke-WarnMark "api/record(uid)" "unexpected JSON"
    }
}
else {
    $j = Get-BodyJson ('{0}/api/record?page=1&limit=2' -f $base)
    if (Looks-LoginRedirect $j) {
        Invoke-WarnMark "/api/record" "guest blocked; rerun with MY_UID and COOKIE_HEADER"
    }
    elseif ($null -ne $j -and ($j.records -is [array])) {
        Invoke-PassMark "api/record OK for anonymous"
    }
    else {
        Invoke-WarnMark "/api/record" "set MY_UID for uid-scoped check"
    }
}

$dEnc = [uri]::EscapeDataString($domainId)
Write-Host "`n━━ C1 GET /d/.../homework ━━" -ForegroundColor Cyan
$tUrl = '{0}/d/{1}/homework?page=1' -f $base, $dEnc
try {
    $r = Invoke-WebRequest -Uri $tUrl -Headers (Headers-Common) -UseBasicParsing -ErrorAction Stop
    $txt = [string]$r.Content
    if (($txt.StartsWith("{")) -or ($txt.TrimStart().StartsWith("["))) {
        Invoke-PassMark "homework looks like JSON"
    }
    elseif ($txt -match '(?i)<!DOCTYPE') {
        Invoke-WarnMark "/homework" "HTML OK for frontend fallback parser"
    }
    else {
        Invoke-WarnMark "/homework" "check Content-Type"
    }
}
catch {
    Invoke-WarnMark "/homework" ("fail: " + $_.Exception.Message)
}

Write-Host "`n━━ C2 GET /training ━━" -ForegroundColor Cyan
try {
    $tr = Invoke-WebRequest -Uri ($base + "/training") -UseBasicParsing -ErrorAction Stop
    if ([int]$tr.StatusCode -in @(200, 302)) {
        Invoke-PassMark "/training"
    }
}
catch {
    Invoke-WarnMark "/training" $_.Exception.Message
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ("Summary PASS=" + $script:pass + " FAIL=" + $script:fail + " WARN=" + $script:warn)
Write-Host "When FAIL=0: run vite dev and recheck DevTools Network with real cookies."

if ($script:fail -gt 0) {
    exit 1
}
