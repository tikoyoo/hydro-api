import { Handler, db, param, Types } from 'hydrooj';

/**
 * GET /api/domainUsers
 * - 与同仓库 `server/snippets/hydro-api-gateway-GET-domainUsers-route.js` 语义对齐
 * - `noCheckPermView`：免登录可读（与同域 SPA + 网关场景一致）；若你希望仅登录可读，删掉该属性并实现权限检查。
 */
export class DomainUsersHandler extends Handler {
  noCheckPermView = true;

  @param('domainId', Types.String, true)
  @param('uids', Types.String, true)
  @param('page', Types.PositiveInt, true)
  @param('limit', Types.PositiveInt, true)
  @param('sortField', Types.String, true)
  @param('sortOrder', Types.String, true)
  async get(
    domainId = 'system',
    uids?: string,
    page = 1,
    limit = 100,
    sortField = 'rp',
    sortOrder = 'desc',
  ) {
    const actualLimit = Math.min(500, Math.max(1, limit));
    try {
      const dom = String(domainId || 'system').trim() || 'system';
      const skip = Math.max(0, page - 1) * actualLimit;
      const order = sortOrder === 'asc' ? 1 : -1;

      const SORT_WHITELIST = new Set([
        'rp', 'nAccept', 'nSubmit', 'rank', 'level', 'nLiked', 'displayName', 'join', 'uid',
      ]);
      const sf = SORT_WHITELIST.has(String(sortField)) ? String(sortField) : 'rp';

      const query: Record<string, unknown> = { uid: { $gt: 1 }, join: true };

      const uCsv = typeof uids === 'string' ? uids.trim() : '';
      if (uCsv.length) {
        const uidList = uCsv
          .split(',')
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => Number.isFinite(id) && id > 1);
        if (uidList.length) query.uid = { $in: uidList };
      } else {
        query.rp = { $gt: 0 };
      }

      const coll = db.collection('domain.user');
      const mongoQuery = { domainId: dom, ...query };

      const total = await coll.countDocuments(mongoQuery);
      const users = await coll
        .find(mongoQuery)
        .sort({ [sf]: order } as Record<string, 1 | -1>)
        .skip(skip)
        .limit(actualLimit)
        .project({
          uid: 1, rp: 1, nAccept: 1, nSubmit: 1, nLiked: 1, rank: 1, level: 1, displayName: 1,
        })
        .toArray();

      this.response.body = { users, total, page, limit: actualLimit };
    } catch (e) {
      console.error('[hydro-api] GET /api/domainUsers error:', e);
      this.response.status = 500;
      this.response.body = { users: [], total: 0, page, limit: actualLimit, error: 'internal_error' };
    }
  }
}
