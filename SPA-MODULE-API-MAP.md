# SPA 功能模块 ↔ HTTP/API 对照与核查清单

本文件落实「按功能模块核对数据与 API」：标明 **hydro-api 插件是否提供**，以及浏览器侧如何自检。同源路径以站点根 `/` 为准；若配置了 `VITE_HYDRO_PLUGIN_ORIGIN`，`GET /api/domainUsers` 等可能指向独立源（需与 CDN/反代策略一致）。

**插件已实现路由**（见 `src/index.ts`）：  
`POST /api/login`、`GET /api/user/me`、`/api/problem`、`/api/contest`、`/api/record`、`/api/domainUsers`、`/api/sync/health`、`/api/sync/bootstrap`。

---

## 0. 命令行自检（服务器 / 开发者）

### Bash（Linux / Git Bash）

```bash
export BASE_URL=https://你的域名   # 或 http://127.0.0.1:8888
export MY_UID=你的数字UID       # 用于拉 /api/record 两分支
chmod +x hydro-api/scripts/verify-apis.sh
./hydro-api/scripts/verify-apis.sh
```

需登录语义时：`COOKIE_HEADER='Cookie: sid=…' ./hydro-api/scripts/verify-apis.sh`

### Windows PowerShell

```powershell
$env:BASE_URL="https://你的域名"; $env:MY_UID="27"
powershell -ExecutionPolicy Bypass -File hydro-api/scripts/verify-apis.ps1
```

本地开发机若无运行中的 Hydro：`BASE_URL` 对应请求会失败，属预期；请到**已部署 Hydro + 插件**的环境执行。

---

## 1. 首页 Dashboard

| 数据 | `src/` 入口 | HTTP | hydro-api |
|------|-------------|------|-----------|
| 登录 | `AuthContext.login`、`authApi.login` | `POST /api/login`（JSON 优先）、`POST /login`（HTML 回退） | `/api/login` 插件 |
| 登录态与用户 | `AuthContext`、`authApi.getMe`、`userApi.getInfo` | `GET /api/user/me`（JSON 优先）、`GET /p`（HTML 回退） | `/api/user/me` 插件 |
| 最近比赛 | `contestApi.fetchDashboardRecentContests` | `GET /api/contest`（分页，`rule≠homework` 在前端过滤） | 插件 |
| 排名摘要 | `userApi.fetchSiteRankingSummaryForUser` | `GET /ranking`（JSON）+ `GET /api/domainUsers`（hydrate） | `/ranking` Hydro；`/api/domainUsers` 插件 |
| 今日评测 | `userApi.getRecords`（Dashboard 聚合） | `GET /api/record`… | 插件 |

**DevTools 核查**：过滤器 `problem`、`ranking`、`domainUsers`、`contest`、`record`、`user/me`；确认 **`domainUsers`** 与同域或显式配置的插件源一致。

---

## 2. 题库 Questions / 做题 Solving

| 数据 | `src/` 入口 | HTTP | hydro-api |
|------|-------------|------|-----------|
| 题目列表 | `problemApi.getList` | `GET /api/problem` | 插件 |
| 题面 | `problemApi.getDetail` | `GET /p/:pid`（JSON，可带 `tid`） | Hydro |
| 单条记录 | `problemApi.getRecord` | `GET /api/record?rid=` | 插件 |
| 提交 | `problemApi.submit` | `POST /p/:pid/submit` | Hydro |
| 在线运行 | `problemApi.run` | `POST /api/run` | 站点能力与 judge |
| 评测文案 | `getRecordDetail` | `GET /record/:rid?raw=1` | Hydro HTML |

---

## 3. 课程 Courses / CourseDetail / CourseSection

| 数据 | `src/` 入口 | HTTP | hydro-api |
|------|-------------|------|-----------|
| 课程列表 | `trainingApi.listTrainings` | `GET /training`（HTML 解析为主） | 非插件 |
| 详情 / 章节 DAG | `trainingApi.getTrainingWithModules` | `GET /training/:tid`（JSON 优先） | 非插件 |

若异常：检查 **training 插件/路由**、`/training` 反代，非 `hydro-api` 插件范围。

---

## 4. 比赛 ContestList / ContestDetail

| 数据 | `src/` 入口 | HTTP | hydro-api |
|------|-------------|------|-----------|
| 非作业列表 | `contestApi.listAllNonHomeworkContests` → `getList` | `GET /api/contest` | 插件 |
| 「是否参加」补全 | `enrichContestRowsWithAttend` | `GET /contest/:tid`（优先）、`GET /api/contest/:tid`（兜底） | 详情以 Hydro 为主 |
| 详情 / 成绩板 | `getDetailJson`、`getScoreboardJson` | `/contest/:tid`、`/contest/:tid/scoreboard`（及 `/d/:dom/…`） | Hydro |

---

## 5. 作业 Homework / HomeworkDetail

| 数据 | `src/` 入口 | HTTP | hydro-api |
|------|-------------|------|-----------|
| 作业列表（主路径） | `homeworkApi.listAll` | `GET /d/:domainId/homework`（JSON；失败可走 HTML） | Hydro HomeworkMain |
| 进度条 | `attachListProgress` | `GET /api/record`（`uid` + 多 `pid`、`excludePretest=1`） | 插件 |
| 题目集合 | `fetchProblemsPage` | 作业：`GET /p/:pid`×N；赛制：`GET .../contest/:tid/problems` | Hydro |
| 认领 | `attendContest` | `POST` 详情页表单 `operation=attend` | Hydro |
| 兜底列表 | `listAll` 末段 | `GET /api/contest` + `POST /api`（`user`/`groups`） | 插件 + Hydro JSON API |

见 `api.js` 中「作业模型为 hidden，勿单靠 `GET /api/contest` 列表」的注释。

---

## 6. 缺口归类（出现 404 / 缺字段时）

| 现象 | 优先怀疑 |
|------|----------|
| `/api/problem` 等全部 404 | 插件未装载、`addon.json`、未 `pm2 restart` |
| `/api/record` 无 `contest` 字段 | 非本插件或旧实现；需含 `contest` 才能在前端识别 pretest |
| `/api/domainUsers` 跨域失败 | Caddy/反代、`VITE_HYDRO_PLUGIN_ORIGIN` 与 Cookie 策略 |
| `/training`、`/d/.../homework` 失败 | Hydro 模块/域配置/登录，与 plugin-api 无关 |
| `POST /api/run` 失败 | 在线 IDE/判题服务未启用 |
| 排名数字与库表不一致 | `/ranking` JSON 与 `domain.user` 语义；验 `GET /api/domainUsers?uids=…` 与行合并逻辑（见 `hydrateRankingRowsFromBackend`） |

---

## 7. 与「全部 JSON 归插件」的关系

当前为**刻意分层**：列表类 GET 由 **hydro-api** 提供；题面、训练、作业首页、提交、原生 `POST /api` 仍走 **Hydro**。若要把 training/homework 列表迁入插件，需**新增 handler**并对齐 Hydro 语义，另立需求。
