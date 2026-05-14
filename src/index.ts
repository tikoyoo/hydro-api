import type { Context, Handler } from 'hydrooj';
import { attachApiCors } from './lib/cors';
import { UserGetHandler } from './handlers/user';
import { DomainUsersHandler } from './handlers/domainUsers';
import { SyncHealthHandler, SyncBootstrapHandler } from './handlers/syncBootstrap';
import { LoginHandler } from './handlers/login';
import { EduProblemListApiHandler } from './handlers/problem';
import { EduContestListApiHandler } from './handlers/contest';

/**
 * Hydro 插件：注册 SPA 所需 GET JSON。
 * 原生不提供这些分页列表：`GET /api/problem`、`GET /api/contest`。
 * `/api/contest/:tid`、`/api/record`、赛板 web 路由仍主要由 Hydro（或其它层）承担；详情可先走 `/contest/:id` Accept JSON。
 *
 * 列表 Handler 类名须避免 `*ListHandler` 与核心推断的 `ContestList` / `ProblemList` 路由名冲突。
 */

const BEFORE_HOOKS = [
  'handler/before/user_me',
  'handler/before/domain_users',
  'handler/before/sync_health',
  'handler/before/sync_bootstrap',
  'handler/before/login',
  'handler/before/problem_list',
  'handler/before/contest_list',
];

const ROUTES: [string, string, new () => Handler][] = [
  ['user_me', '/api/user/me', UserGetHandler],
  ['domain_users', '/api/domainUsers', DomainUsersHandler],
  ['sync_health', '/api/sync/health', SyncHealthHandler],
  ['sync_bootstrap', '/api/sync/bootstrap', SyncBootstrapHandler],
  ['login', '/api/login', LoginHandler],
  ['edu_problem_list', '/api/problem', EduProblemListApiHandler],
  ['edu_contest_list', '/api/contest', EduContestListApiHandler],
];

export async function apply(ctx: Context): Promise<void> {
  for (const ev of BEFORE_HOOKS) {
    ctx.on(ev, (h: Handler) => { attachApiCors(h); });
  }
  for (const [name, path, HandlerClass] of ROUTES) {
    ctx.Route(name, path, HandlerClass);
  }
}
