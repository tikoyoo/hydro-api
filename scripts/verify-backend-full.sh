#!/usr/bin/env bash
#
# 后端完整自检：hydro-api 插件（Cordis apply 注册的 5 条路由）
# + 前端 spa 依赖的 Hydro JSON/HTML 路径。
#
# 服务器本机：
#   BASE_URL=http://127.0.0.1:8888 ./hydro-api/scripts/verify-backend-full.sh
# 公网（注意 Cookie/SameSite；无 Cookie 可能大量「跳转登录 JSON」）：
#   BASE_URL=https://your.domain ./hydro-api/scripts/verify-backend-full.sh
#
# 已登录时再测 bootstrap / homework / record：
#   COOKIE_HEADER='Cookie: sid=...' DOMAIN_ID=system MY_UID=27 ./hydro-api/scripts/verify-backend-full.sh
#
set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8888}"
DOMAIN_ID="${DOMAIN_ID:-system}"
MY_UID="${MY_UID:-}"

HDR_JSON=(-H 'Accept: application/json')
HDR=("${HDR_JSON[@]}")
if [[ -n "${COOKIE_HEADER:-}" ]]; then
  HDR+=(-H "${COOKIE_HEADER}")
fi

pass=0
fail=0
warn=0

json_from_curl() {
  curl -sS --compressed "${HDR[@]}" "$1" 2>/dev/null || printf ''
}

looks_login_json() {
  local body="$1"
  printf '%s' "$body" | python3 -c "
import json,sys
try:
    o=json.load(sys.stdin)
    u=o.get('url')
    sys.exit(0 if isinstance(u,str) and '/login' in u.lower() else 1)
except Exception:
    sys.exit(1)
" 2>/dev/null && return 0
  grep -qiE '\"url\"[[:space:]]*:[[:space:]]*\".*login' <<<"$body"
}

check_name() {
  printf '\n━━ %s ━━\n' "$1"
}

ok() { printf '[PASS] %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '[FAIL] %s — %s\n' "$1" "$2"; fail=$((fail+1)); }
note() { printf '[WARN] %s — %s\n' "$1" "$2"; warn=$((warn+1)); }

trim_slash="${BASE_URL%/}"

# ── Tier A：hydro-api 插件 MUST 注册（Cordis，`src/index.ts`） ──

check_name "A1 GET /api/user/me"
body=$(json_from_curl "${trim_slash}/api/user/me") || body=""
if looks_login_json "$body"; then
  bad "user/me" "返回登录跳转 JSON（插件可能被绕过）"
elif echo "$body" | python3 -c "import json,sys; o=json.load(sys.stdin); sys.exit(0 if '_id' in o else 1)" 2>/dev/null; then
  ok "user/me 含 _id"
else
  bad "user/me" "非期望 JSON（需含 _id 或 Guest）"
fi

check_name "A2 GET /api/sync/health"
body=$(json_from_curl "${trim_slash}/api/sync/health")
if looks_login_json "$body"; then
  bad "sync/health" "返回登录跳转（插件未接管）"
elif echo "$body" | python3 -c "import json,sys; o=json.load(sys.stdin); sys.exit(0 if o.get('ok')==True else 1)" 2>/dev/null; then
  ok "sync/health ok=true"
else
  note "sync/health" "无 ok:true（仍可接受若你换过实现）；体: $(echo "$body" | head -c 200)"
fi

check_name "A3 GET /api/domainUsers（免登录须有 users 字段）"
q="domainId=${DOMAIN_ID}&page=1&limit=3&sortField=rp&sortOrder=desc"
body=$(json_from_curl "${trim_slash}/api/domainUsers?${q}")
if looks_login_json "$body"; then
  bad "domainUsers" "返回登录跳转 — 与同域网关/Caddy 或插件未装载有关（见 SPA-MODULE-API-MAP §6）"
elif echo "$body" | python3 -c "import json,sys; o=json.load(sys.stdin); sys.exit(0 if isinstance(o.get('users'),list) else 1)" 2>/dev/null; then
  ok "domainUsers 返回 users[]"
else
  bad "domainUsers" "缺少 users 数组"
fi

check_name "A4 POST /api/login（仅探测：勿在生产终端贴密码）"
echo "跳过：避免误 stdin。若需验证请手动:"
echo "  curl -sS -X POST '${trim_slash}/api/login' -H Content-Type:application/json -d '{\"uname\":\"...\",\"password\":\"...\",\"rememberme\":true}'"
note "login（JSON）" "见 project-analysis-log §26 — 部分 Hydro 宿主对 Guest POST 有限制时可改用 login-server.js"

check_name "A5 GET /api/sync/bootstrap（未登录应 login / 401 语义）"
body=$(json_from_curl "${trim_slash}/api/sync/bootstrap")
if [[ -z "${COOKIE_HEADER:-}" ]]; then
  if looks_login_json "$body"; then
    ok "bootstrap 未带 Cookie → 跳转登录 JSON（预期）"
  elif echo "$body" | grep -qiE 'login_required|401|Unauthorized'; then
    ok "bootstrap 未登录错误语义"
  else
    note "bootstrap" "未登录但未识别为跳转；体: $(echo "$body" | head -c 200)"
  fi
else
  if echo "$body" | python3 -c "import json,sys; o=json.load(sys.stdin); sys.exit(0 if 'userDataVersion' in o else 1)" 2>/dev/null; then
    ok "bootstrap 含 userDataVersion"
  elif looks_login_json "$body"; then
    bad "bootstrap" "已设 Cookie 仍跳转登录 → Cookie 无效或路径未到插件"
  else
    note "bootstrap" "已登录但未见 userDataVersion；体: $(echo "$body" | head -c 300)"
  fi
fi

# ── Tier B：前端强依赖 Hydro 原生或其它实现（`/api/problem` 等可由 Hydro 自带） ──

check_name "B1 GET /api/problem?page=1&limit=2"
body=$(json_from_curl "${trim_slash}/api/problem?page=1&limit=2")
if looks_login_json "$body"; then
  bad "api/problem" "需登录或插件/权限 — 题库列表 SPA 拿不到"
elif echo "$body" | python3 -c "import json,sys; o=json.load(sys.stdin); sys.exit(0 if isinstance(o.get('problems'),list) else 1)" 2>/dev/null; then
  ok "problem 列表 JSON"
else
  note "problem" "结构非 {problems:[]}；前几字: $(echo "$body" | head -c 180)"
fi

check_name "B2 GET /api/contest?page=1&limit=2"
body=$(json_from_curl "${trim_slash}/api/contest?page=1&limit=2")
if looks_login_json "$body"; then
  bad "api/contest" "需登录 — 仪表盘/赛场列表 SPA 拿不到"
elif echo "$body" | python3 -c "import json,sys; o=json.load(sys.stdin); sys.exit(0 if isinstance(o.get('contests'),list) else 1)" 2>/dev/null; then
  ok "contest 列表 JSON"
else
  note "contest" "结构非 {contests:[]}；前几字: $(echo "$body" | head -c 180)"
fi

check_name "B3 GET /ranking?page=1（Accept: application/json）"
body=$(json_from_curl "${trim_slash}/ranking?page=1")
if looks_login_json "$body"; then
  bad "/ranking JSON" "未会话 — 排名全为空；改用 hosts 子域+Vite Cookie 或服务端同源"
elif echo "$body" | python3 -c "
import json,sys
o=json.load(sys.stdin)
keys=('udocs','users','list')
sys.exit(0 if any(isinstance(o.get(k),list) for k in keys) else 1)
" 2>/dev/null; then
  ok "ranking 含榜单数组"
else
  bad "/ranking" "无 udocs/users/list — 或非 JSON/HTML"
fi

check_name "B4 GET /p HTTP 可达（会话页）"
code=$(curl -sS "${HDR[@]}" -o /dev/null -w '%{http_code}' "${trim_slash}/p" || true)
if [[ "$code" =~ ^(200|302|301)$ ]]; then
  ok "/p HTTP $code"
else
  note "/p" "HTTP $code"
fi

if [[ -n "$MY_UID" ]]; then
  check_name "B5 GET /api/record uid=${MY_UID} excludePretest=1（需可读记录）"
  body=$(json_from_curl "${trim_slash}/api/record?page=1&limit=5&uid=${MY_UID}&excludePretest=1")
  if looks_login_json "$body"; then
    bad "api/record" "需会话 — Dashboard/作业进度依赖"
  elif echo "$body" | python3 -c "import json,sys; o=json.load(sys.stdin); sys.exit(0 if isinstance(o.get('records'),list) else 1)" 2>/dev/null; then
    ok "record 返回 records[]"
    if ! echo "$body" | grep -q '"contest"'; then
      note "/api/record" "记录项缺 contest 字段时前端较难剔 pretest（见 snippets）"
    fi
  else
    note "record" "非预期 JSON"
  fi
else
  check_name "B5 GET /api/record（未设 MY_UID 跳过 uid 语义）"
  body=$(json_from_curl "${trim_slash}/api/record?page=1&limit=2")
  if looks_login_json "$body"; then
    note "/api/record" "匿名不可读（部分站点正常）；Dashboard 评测条需 MY_UID + COOKIE"
  elif echo "$body" | python3 -c "import json,sys; o=json.load(sys.stdin); sys.exit(0 if isinstance(o.get('records'),list) else 1)" 2>/dev/null; then
    ok "record 匿名仍返回列表"
  else
    note "/api/record" "MY_UID='数字' 可脚本内测 uid 语义"
  fi
fi

# ── Tier C：作业/训练入口（常为 Hydro 原生；需会话与域） ──

enc_dom="$(DOMAIN_ID="$DOMAIN_ID" python3 -c 'import os,urllib.parse as u; print(u.quote(os.environ["DOMAIN_ID"], safe=""))' 2>/dev/null || printf '%s' "${DOMAIN_ID}")"
check_name "C1 GET /d/${DOMAIN_ID}/homework?page=1"
code=$(curl -sS "${HDR[@]}" \
  -H 'Accept: application/json' \
  -o /tmp/hydro_hw_body.txt -w '%{http_code}' \
  "${trim_slash}/d/${enc_dom}/homework?page=1" || echo "000")

if [[ "$code" == "200" ]]; then
  if grep -qi '<!DOCTYPE html' /tmp/hydro_hw_body.txt 2>/dev/null; then
    note "/d/.../homework" "返回 HTML 非 JSON — 仍可被前端降级解析"
  else
    ok "homework JSON 或非 HTML 响应"
  fi
else
  note "/d/.../homework" "HTTP $code（未登录或未开 homework）"
fi
rm -f /tmp/hydro_hw_body.txt

check_name "C2 GET /training（常为 HTML）"
code=$(curl -sS "${HDR[@]}" -o /dev/null -w '%{http_code}' "${trim_slash}/training" || echo "000")
if [[ "$code" =~ ^(200|302)$ ]]; then
  ok "/training HTTP $code"
else
  note "/training" "HTTP $code"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf '汇总: PASS=%s FAIL=%s WARN=%s\n' "$pass" "$fail" "$warn"
echo "NEXT: FAIL=0 后再做前端 vite dev → DevTools Network 对上述路径复核（含 Cookie）。"
