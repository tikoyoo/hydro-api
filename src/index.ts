import type { Context, Handler } from 'hydrooj';
import { attachApiCors } from './lib/cors';
import { UserGetHandler } from './handlers/user';
import { DomainUsersHandler } from './handlers/domainUsers';
import { SyncHealthHandler, SyncBootstrapHandler } from './handlers/syncBootstrap';
import { LoginHandler } from './handlers/login';

/**
 * Hydro 插件：只注册原生没有的 JSON API 端点。
 * /api/problem, /api/contest, /api/record 由 Hydro 原生提供，不重复注册。
 */

const BEFORE_HOOKS = [
  'handler/before/user_me',
  'handler/before/domain_users',
  'handler/before/sync_health',
  'handler/before/sync_bootstrap',
  'handler/before/login',
];

const ROUTES: [string, string, new () => Handler][] = [
  ['user_me', '/api/user/me', UserGetHandler],
  ['domain_users', '/api/domainUsers', DomainUsersHandler],
  ['sync_health', '/api/sync/health', SyncHealthHandler],
  ['sync_bootstrap', '/api/sync/bootstrap', SyncBootstrapHandler],
  ['login', '/api/login', LoginHandler],
];

export async function apply(ctx: Context): Promise<void> {
  for (const ev of BEFORE_HOOKS) {
    ctx.on(ev, (h: Handler) => { attachApiCors(h); });
  }
  for (const [name, path, HandlerClass] of ROUTES) {
    ctx.Route(name, path, HandlerClass);
  }
}
