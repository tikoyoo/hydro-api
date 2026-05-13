# Hydro JSON API 插件 (`@hydrooj/plugin-api`) 部署指南

本目录为 Hydro Cordis 插件源码，提供 SPA 所需的 JSON API 端点。

---

## 0. 前提条件

| 组件 | 说明 |
|------|------|
| Hydro OJ | 已安装并运行（`pm2 show hydrooj` 确认） |
| Node.js | ≥16（Hydro 自带） |
| MongoDB | Hydro 所用数据库 |
| pm2 | Hydro 进程管理 |
| 本机 `hydro-api/` | 本仓库 `hydro-api/` 目录完整 |

**确认 Hydro 已运行**：
```bash
pm2 list | grep hydrooj
curl -sSo /dev/null -w "%{http_code}" http://127.0.0.1:8888/p
# 应返回 302（重定向到登录页）
```

---

## 1. 服务器配置速览

```
/root/hydro-api-plugin/                  # 插件目录（从本机 scp 上传）
~/.hydro/addon.json                      # Hydro 插件清单（JSON 数组）
/usr/local/share/.config/yarn/global/node_modules/@hydrooj/plugin-api/  # 符号链接 → /root/hydro-api-plugin
```

---

## 2. 部署步骤

### 2.1 上传插件到服务器

在本机 `hydroforwindows` 仓库根目录：

```powershell
# Windows PowerShell
scp -r hydro-api root@你的服务器IP:/root/hydro-api-plugin
```

或 Git Bash：

```bash
rsync -avz --delete hydro-api/ root@你的服务器IP:/root/hydro-api-plugin/
```

> **注意**: 目标目录名 `/root/hydro-api-plugin` 必须与符号链接目标一致。

### 2.2 安装依赖

```bash
ssh root@你的服务器IP
cd /root/hydro-api-plugin
npm install
```

`npm install` 会解析 `package.json` 中的依赖：
- `hydrooj: *` → 从 Hydro 全局 node_modules 解析
- `mongodb: *` → 同上

### 2.3 创建符号链接

Hydro 通过 `@hydrooj/plugin-api` 模块名发现插件，需要将插件目录链接到 Hydro 全局模块路径：

```bash
GLOBAL_MOD=/usr/local/share/.config/yarn/global/node_modules
mkdir -p "$GLOBAL_MOD/@hydrooj"
rm -rf "$GLOBAL_MOD/@hydrooj/plugin-api"
ln -sfn /root/hydro-api-plugin "$GLOBAL_MOD/@hydrooj/plugin-api"
```

> **关键检查**: `ls -la "$GLOBAL_MOD/@hydrooj/plugin-api"` 必须指向 `/root/hydro-api-plugin`，不是死链。

### 2.4 配置 addon.json

```bash
cat ~/.hydro/addon.json
```

确保数组包含 `"@hydrooj/plugin-api"`：

```json
["@hydrooj/ui-default", "@hydrooj/hydrojudge", "@hydrooj/fps-importer", "@hydrooj/a11y", "@hydrooj/plugin-api"]
```

> 如果 `addon.json` 不存在，用上述内容创建。注意 Hydro 只识别 JSON 数组格式。

### 2.5 重启 Hydro

```bash
pm2 restart hydrooj
pm2 logs hydrooj --lines 30
```

**确认加载成功**：PM2 日志中应出现类似：
```
loader [I] apply plugin /@hydrooj/plugin-api/src/index.ts with scope
```
若无，检查步骤 2.3 符号链接和步骤 2.4 addon.json。

---

## 3. 验证 API

### 3.1 快速自检（未登录也可以）

```bash
# 不依赖登录的端点
curl -sS 'http://127.0.0.1:8888/api/sync/health' | python3 -m json.tool
# 预期: {"ok":true, "service":"hydrooj-plugin-sync", "serverTime":...}

curl -sS 'http://127.0.0.1:8888/api/user/me' | python3 -m json.tool
# 未登录: {"_id":0}

curl -sS 'http://127.0.0.1:8888/api/problem?page=1&limit=3' | python3 -m json.tool
# 预期: {"problems":[...], "total":..., "page":1, "limit":3}

curl -sS 'http://127.0.0.1:8888/api/domainUsers?domainId=system&page=1&limit=2' | python3 -m json.tool
# 预期: {"users":[{uid, rp, nAccept, nSubmit,...}], "total":..., "page":1, "limit":2}
```

### 3.2 JSON 登录测试

```bash
curl -sS -X POST 'http://127.0.0.1:8888/api/login' \
  -H 'Content-Type: application/json' \
  -d '{"uname":"你的用户名","password":"你的密码","rememberme":true}' | python3 -m json.tool
# 成功: {"success":true, "user":{_id, uname, perm,...}}
# 失败: {"success":false, "error":"用户名或密码错误"}
```

### 3.3 完整自检脚本

```bash
cd /root/hydro-api-plugin
chmod +x scripts/verify-apis.sh
BASE_URL=http://127.0.0.1:8888 bash scripts/verify-apis.sh
```

---

## 4. 前端配合

### 4.1 Vite 代理

前端 `vite.config.js` 的代理路由中，`/api` 已自动转发到 Hydro（`HYDRO_ORIGIN`）。插件部署后无需修改 vite 配置。

### 4.2 登录流程

前端 `authApi.login` 已实现**渐进增强**：
1. **优先**：`POST /api/login`（JSON）— 插件部署后生效
2. **回退**：`POST /login`（HTML 表单）— 插件未部署时自动使用

`authApi.getMe` 同理：
1. **优先**：`GET /api/user/me`（JSON）
2. **回退**：`GET /p`（HTML → 解析 `window.UserContext`）

> 前端**无需修改**，部署插件后自动切换到 JSON 路径。

### 4.3 比赛详情补全

插件部署后，`ContestDetailHandler` 会返回真实的 `udict` 和 `pdict`（之前为空对象 `{}`），前端 `getDetailJson` 不再需要额外请求补全用户信息和题目信息。

---

## 5. 当前插件提供的完整路由列表

| 路由 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/login` | POST | 无需 | JSON 登录，返回 `{success, user}` |
| `/api/user/me` | GET | 无需 | 当前用户（未登录返回 `{_id:0}`） |
| `/api/problem` | GET | 无需 | 题目列表（分页+搜索） |
| `/api/problem/:pid` | GET | 无需 | 题目详情（限制暴露字段） |
| `/api/contest` | GET | 无需 | 比赛列表（含 attend 等字段） |
| `/api/contest/:tid` | GET | 需要登录 | 比赛详情（含 udict+pdict 真实数据） |
| `/api/record` | GET | 部分 | 评测记录（支持 pretest 过滤） |
| `/api/domainUsers` | GET | 无需 | 域用户统计排行 |
| `/api/sync/health` | GET | 无需 | 同步服务健康检查 |
| `/api/sync/bootstrap` | GET | 需要登录 | 用户同步启动数据 |

---

## 6. 常见问题

### 插件未加载（PM2 日志无 plugin-api 记录）

```bash
# 1. 检查符号链接
ls -la /usr/local/share/.config/yarn/global/node_modules/@hydrooj/plugin-api
# 必须是有效链接 → /root/hydro-api-plugin

# 2. 检查 addon.json
cat ~/.hydro/addon.json
# 必须包含 "@hydrooj/plugin-api"

# 3. 检查 package.json 名称
cat /root/hydro-api-plugin/package.json | grep '"name"'
# 必须是 "@hydrooj/plugin-api"
```

### 登录返回 403/404

```bash
# 检查插件路由是否注册
curl -sS 'http://127.0.0.1:8888/api/sync/health'
# 返回 404 → 插件未加载，回到上述排查
# 返回 200 → 插件已加载，检查 POST 路径
```

### npm install 报错找不到 hydrooj

```bash
# 确保 Hydro 已全局安装
ls /usr/local/share/.config/yarn/global/node_modules/hydrooj
# 若不存在，在 Hydro 源码目录执行：
cd /path/to/Hydro
npm install
npm link
```

### 8890 网关问题

如果之前有独立的 8890 网关（`hydro-api-gateway.js`）直接透传 `/api/domainUsers`：
- 部署插件后可以**保留**网关（作为备用）
- 也可以**移除**网关路由中的 `domainUsers`，走插件同源路径
- 推荐：用 Caddy/Nginx 将 `/api/` 统一反代到 Hydro 8888，不在额外端口暴露

---

## 7. 升级流程

后续 `hydro-api/` 有更新时：

```bash
# 本机
scp -r hydro-api/src root@服务器IP:/root/hydro-api-plugin/

# 服务器
ssh root@服务器IP
cd /root/hydro-api-plugin
npm install --production  # 如有新依赖
pm2 restart hydrooj
pm2 logs hydrooj --lines 10  # 确认加载
```

---

## 8. 与前端仓库的关系

```
hydroforwindows/
├── hydro-api/                    # ← 本目录（部署到服务器）
│   └── src/...
├── src/services/api.js          # ← 前端 API 层（调用上述端点）
├── src/services/api/constants.js
├── src/services/api/dedup.js
├── src/services/api/pathEscalator.js
└── vite.config.js               # ← 代理 /api → HYDRO_ORIGIN
```

本仓库同时包含**前端调用方**和**后端插件源码**，两者通过 SPA-MODULE-API-MAP.md 中的 API 约定协作。
