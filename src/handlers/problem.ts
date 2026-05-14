import { Handler, db, param, Types } from 'hydrooj';

/** Hydro `TYPE_PROBLEM` = 10 */
const TYPE_PROBLEM = 10;

const LIST_PROJECTION = {
  _id: 1, docId: 1, pid: 1, title: 1, difficulty: 1, tag: 1, nSubmit: 1, nAccept: 1,
};

const DETAIL_PROJECTION = {
  _id: 1, docId: 1, pid: 1, title: 1, content: 1, difficulty: 1, tag: 1, nSubmit: 1, nAccept: 1,
  owner: 1, maintainer: 1, config: 1, data: 1, hidden: 1,
};

export class ProblemListHandler extends Handler {
  /** 与 README 一致：题库列表免登录可读；需限制请改为权限检查 */
  noCheckPermView = true;

  @param('page', Types.PositiveInt, true)
  @param('limit', Types.PositiveInt, true)
  @param('q', Types.String, true)
  @param('tag', Types.String, true)
  async get(domainId: string, page = 1, limit = 100, q = '', tag = '') {
    try {
      const coll = db.collection('document');
      const query: Record<string, unknown> = {
        domainId,
        docType: TYPE_PROBLEM,
        hidden: { $ne: true },
      };
      if (q.trim()) query.title = { $regex: q.trim(), $options: 'i' };
      if (tag.trim()) query.tag = tag.trim();

      const total = await coll.countDocuments(query);
      const problems = await coll
        .find(query)
        .project(LIST_PROJECTION)
        .sort({ docId: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      this.response.body = { problems, total, page, limit };
    } catch (e) {
      console.error('[hydro-api] GET /api/problem error:', e);
      this.response.status = 500;
      this.response.body = { problems: [], total: 0, page, limit, error: 'internal_error' };
    }
  }
}

export class ProblemDetailHandler extends Handler {
  @param('pid', Types.String)
  async get(domainId: string, pid: string) {
    try {
      const coll = db.collection('document');
      const decoded = decodeURIComponent(String(pid || '').trim());
      const orClause: Record<string, unknown>[] = [{ pid: decoded }];
      const n = Number(decoded);
      if (Number.isFinite(n)) orClause.push({ docId: n });

      const problem = await coll.findOne(
        { domainId, docType: TYPE_PROBLEM, $or: orClause, hidden: { $ne: true } },
        { projection: DETAIL_PROJECTION },
      );

      if (!problem) {
        this.response.status = 404;
        this.response.body = { error: '题目不存在' };
        return;
      }

      this.response.body = problem;
    } catch (e) {
      console.error('[hydro-api] GET /api/problem/:pid error:', e);
      this.response.status = 500;
      this.response.body = { error: 'internal_error' };
    }
  }
}
