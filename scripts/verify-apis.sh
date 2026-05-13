#!/usr/bin/env bash
#
# Hydro JSON 插件自检（服务器上运行）。
#   BASE_URL=http://127.0.0.1:8888 MY_UID=27 ./hydro-api/scripts/verify-apis.sh
# 带会话：
#   COOKIE_HEADER='Cookie: sid=YOUR_SID' BASE_URL=https://oj.example.com ./hydro-api/scripts/verify-apis.sh

set -euo pipefail
BASE_URL="${BASE_URL:-http://127.0.0.1:8888}"
MY_UID="${MY_UID:-}"

HDR=()
if [[ -n "${COOKIE_HEADER:-}" ]]; then
  HDR=(-H "$COOKIE_HEADER")
fi

jq_ok() {
  command -v jq >/dev/null 2>&1
}

chk_json() {
  local name="$1"
  local url="$2"
  printf '\n━━ %s ━━\n' "$name"
  local body
  body=$(curl -sS "${HDR[@]}" -H 'Accept: application/json' "$url") || exit 3
  if jq_ok; then echo "$body" | jq '.'; else echo "$body"; fi
}

echo "BASE_URL=$BASE_URL"
[[ -n "$MY_UID" ]] && echo "MY_UID=$MY_UID"

chk_json user_me "$BASE_URL/api/user/me"
chk_json problems "$BASE_URL/api/problem?page=1&limit=2"
chk_json contests "$BASE_URL/api/contest?page=1&limit=2"
chk_json sync_health "$BASE_URL/api/sync/health"

if [[ -n "$MY_UID" ]]; then
  chk_json record_official "${BASE_URL}/api/record?page=1&limit=5&uid=${MY_UID}&excludePretest=1"
  chk_json record_with_pretest "${BASE_URL}/api/record?page=1&limit=3&uid=${MY_UID}&excludePretest=0"
fi

chk_json domain_users_sample \
  "$BASE_URL/api/domainUsers?domainId=system&page=1&limit=2&sortField=rp&sortOrder=desc"

if [[ -z "$MY_UID" ]]; then
  echo ''
  echo "提示：未设置 MY_UID，已跳过 /api/record。执行：MY_UID=你的UID $0"
fi

chk_json sync_bootstrap "$BASE_URL/api/sync/bootstrap"

echo ''
echo 'sync/bootstrap：未登录应 401/login_required；已登录 Cookie 应含 userDataVersion。'
echo Done.
