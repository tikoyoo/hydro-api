import type { Context, Handler } from 'hydrooj';
import { attachApiCors } from './lib/cors';
import { UserGetHandler } from './handlers/user';
import { ProblemListHandler, ProblemDetailHandler } from './handlers/problem';
import { ContestListHandler, ContestDetailHandler } from './handlers/contest';
import { RecordListHandler } from './handlers/record';
import { DomainUsersHandler } from './handlers/domainUsers';
import { SyncHealthHandler, SyncBootstrapHandler } from './handlers/syncBootstrap';
import { LoginHandler } from './handlers/login';

const BEFORE_HOOKS = [
  'handler/before/api_user_me',
  'handler/before/api_problem_list',
  'handler/before/api_problem_detail',
  'handler/before/api_contest_list',
  'handler/before/api_contest_detail',
  'handler/before/api_record_list',
  'handler/before/api_domain_users',
  'handler/before/sync_health',
  'handler/before/sync_bootstrap',
  'handler/before/api_login',
];

export async function apply(ctx: Context): Promise<void> {
  for (const ev of BEFORE_HOOKS) {
    ctx.on(ev, (h: Handler) => {
      attachApiCors(h);
    });
  }

  ctx.Route('api_user_me', '/api/user/me', UserGetHandler);

  ctx.Route('api_problem_list', '/api/problem', ProblemListHandler);
  ctx.Route('api_problem_detail', '/api/problem/:pid', ProblemDetailHandler);

  ctx.Route('api_contest_list', '/api/contest', ContestListHandler);
  ctx.Route('api_contest_detail', '/api/contest/:tid', ContestDetailHandler);

  ctx.Route('api_record_list', '/api/record', RecordListHandler);

  ctx.Route('api_domain_users', '/api/domainUsers', DomainUsersHandler);

  ctx.Route('api_login', '/api/login', LoginHandler);

  ctx.Route('sync_health', '/api/sync/health', SyncHealthHandler);
  ctx.Route('sync_bootstrap', '/api/sync/bootstrap', SyncBootstrapHandler);
}
