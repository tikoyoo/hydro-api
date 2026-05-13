'use strict';

/**
 * 全站排名「补齐 domain.user 统计」用：Mongo `domain.user` 查询逻辑。
 *
 * 与文档 `docs/project-analysis-log.md` §19 一致：可当 **pm2 `hydro-api` :8890**
 *（`/root/hydro-api-gateway.js`）里 `routes['GET:/api/domainUsers']` 的处理体，
 * 也可单独被 `hydro-api-gateway-standalone.example.js` 调用。
 *
 * 前端：`src/services/api.js` → `getDomainUsersPluginStats`，与 Hydro 原生 `GET /ranking`
 * JSON 可能在缺 `nSubmit`/`nAccept` 时拼接（`hydrateRankingRowsFromBackend`）。
 */

const SORT_WHITELIST = new Set([
  'rp',
  'nAccept',
  'nSubmit',
  'rank',
  'level',
  'nLiked',
  'displayName',
  'join',
  'uid',
]);

/**
 * @param {import('mongodb').Db} db
 * @param {URLSearchParams} searchParams
 * @returns {Promise<{ users: object[], total: number, page: number, limit: number }>}
 */
async function executeDomainUsersGet(db, searchParams) {
  const domainId = String(searchParams.get('domainId') || 'system').trim() || 'system';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  let limit = parseInt(searchParams.get('limit') || '100', 10) || 100;
  limit = Math.min(500, Math.max(1, limit));

  const sortFieldRaw = searchParams.get('sortField') || 'rp';
  const sortOrder = (searchParams.get('sortOrder') || 'desc') === 'asc' ? 1 : -1;
  const sortField = SORT_WHITELIST.has(sortFieldRaw) ? sortFieldRaw : 'rp';

  const uidsStr = String(searchParams.get('uids') || '').trim();

  const query = { uid: { $gt: 1 }, join: true };
  if (uidsStr) {
    const uidList = uidsStr
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => Number.isFinite(id) && id > 1);
    if (uidList.length > 0) query.uid = { $in: uidList };
  } else {
    query.rp = { $gt: 0 };
  }

  const coll = db.collection('domain.user');
  const mongoFilter = { domainId, ...query };
  const total = await coll.countDocuments(mongoFilter);
  const skip = (page - 1) * limit;
  const users = await coll
    .find(mongoFilter)
    .sort({ [sortField]: sortOrder })
    .skip(skip)
    .limit(limit)
    .project({
      uid: 1,
      rp: 1,
      nAccept: 1,
      nSubmit: 1,
      nLiked: 1,
      rank: 1,
      level: 1,
      displayName: 1,
    })
    .toArray();

  return { users, total, page, limit };
}

/**
 * 供现有 `/root/hydro-api-gateway.js` 的 routes 字面量粘贴；函数体与
 * `server/snippets/hydro-api-gateway-GET-domainUsers-route.js` 同源（本仓库为权威副本）。
 *
 * @param {import('mongodb').Db} db
 */
function createGatewayRouteGetter(db) {
  return async (req, res, url) => {
    void req;
    void res;
    return executeDomainUsersGet(db, url.searchParams);
  };
}

module.exports = {
  SORT_WHITELIST,
  executeDomainUsersGet,
  createGatewayRouteGetter,
};
