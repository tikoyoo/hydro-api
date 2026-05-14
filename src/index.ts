import type { Context, Handler } from 'hydrooj';
import { attachApiCors } from './lib/cors';
import { UserGetHandler } from './handlers/user';
import { DomainUsersHandler } from './handlers/domainUsers';
import { SyncHealthHandler, SyncBootstrapHandler } from './handlers/syncBootstrap';
import { LoginHandler } from './handlers/login';
import { ProblemListHandler } from './handlers/problem';

/**
 * Hydro 插件：注册 SPA 所需 GET JSON。
 * 原生 `ProblemApi` 仅有 `problem`/`problems`（按 id），**无**分页列表；题库须 `GET /api/problem`（本插件）。
 * `/api/contest`、`/api/record` 仍由站点其它层或原生提供，未在此重复注册以免路由名冲突。
 */

const BEFORE_HOOKS = [
  'handler/before/user_me',
  'handler/before/domain_users',
  'handler/before/sync_health',
  'handler/before/sync_bootstrap',
  'handler/before/login',
  'handler/before/problem_list',
];

const ROUTES: [string, string, new () => Handler][] = [
  ['user_me', '/api/user/me', UserGetHandler],
  ['domain_users', '/api/domainUsers', DomainUsersHandler],
  ['sync_health', '/api/sync/health', SyncHealthHandler],
  ['sync_bootstrap', '/api/sync/bootstrap', SyncBootstrapHandler],
  ['login', '/api/login', LoginHandler],
  ['edu_problem_list', '/api/problem', ProblemListHandler],
];

export async function apply(ctx: Context): Promise<void> {
  for (const ev of BEFORE_HOOKS) {
    ctx.on(ev, (h: Handler) => { attachApiCors(h); });
  }
  for (const [name, path, HandlerClass] of ROUTES) {
    ctx.Route(name, path, HandlerClass);
  }
}
