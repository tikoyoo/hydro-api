import { Handler, db, param, Types } from 'hydrooj';
import { ObjectId } from 'mongodb';

/** Hydro `TYPE_CONTEST` = 30, `TYPE_PROBLEM` = 10 */
const TYPE_CONTEST = 30;
const TYPE_PROBLEM = 10;

const USER_PROJECTION = {
  _id: 1, uname: 1, displayName: 1, avatar: 1, mail: 1, perm: 1, role: 1,
};

const PROBLEM_PROJECTION = {
  _id: 1, docId: 1, pid: 1, title: 1, nSubmit: 1, nAccept: 1, difficulty: 1, tag: 1,
};

/** 类名勿用 `ContestListHandler`：会与 Hydro 核心路由名 `ContestList` 冲突 */
export class EduContestListApiHandler extends Handler {
  /** 列表与 SPA 对齐：免登录可查（与 GET /api/problem 一致）；若站点要求登录再改权限 */
  noCheckPermView = true;

  @param('page', Types.PositiveInt, true)
  @param('limit', Types.PositiveInt, true)
  async get(domainId: string, page = 1, limit = 50) {
    try {
      const coll = db.collection('document');
      const query: Record<string, unknown> = {
        domainId,
        docType: TYPE_CONTEST,
      };

      const total = await coll.countDocuments(query);
      const rows = await coll
        .find(query)
        .project({
          _id: 1,
          docId: 1,
          title: 1,
          rule: 1,
          beginAt: 1,
          endAt: 1,
          pids: 1,
          assign: 1,
          owner: 1,
          attend: 1,
          duration: 1,
          rated: 1,
          penaltySince: 1,
        })
        .sort({ beginAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      this.response.body = { contests: rows, total, page, limit };
    } catch (e) {
      console.error('[hydro-api] GET /api/contest error:', e);
      this.response.status = 500;
      this.response.body = { contests: [], total: 0, page, limit, error: 'internal_error' };
    }
  }
}

export class EduContestDetailApiHandler extends Handler {
  @param('tid', Types.ObjectId)
  async get(domainId: string, tid: ObjectId) {
    try {
      const coll = db.collection('document');

      let tdoc = await coll.findOne({
        domainId,
        docType: TYPE_CONTEST,
        docId: tid,
      });
      if (!tdoc)
        tdoc = await coll.findOne({
          domainId,
          docType: TYPE_CONTEST,
          _id: tid,
        });

      if (!tdoc) {
        this.response.status = 404;
        this.response.body = { error: 'contest_not_found' };
        return;
      }

      const tsdocRow = await db.collection('document.status').findOne({
        domainId,
        docType: TYPE_CONTEST,
        docId: tdoc.docId,
        uid: this.user._id,
      });

      const uidSet = new Set<number>();
      if (typeof (tdoc as { owner?: number }).owner === 'number') uidSet.add((tdoc as { owner: number }).owner);
      if (typeof (tdoc as { maintainer?: number }).maintainer === 'number') uidSet.add((tdoc as { maintainer: number }).maintainer);
      if (tsdocRow && typeof (tsdocRow as { uid?: number }).uid === 'number') {
        uidSet.add((tsdocRow as { uid: number }).uid);
      }

      const pids = Array.isArray((tdoc as { pids?: unknown[] }).pids)
        ? ((tdoc as { pids: unknown[] }).pids as number[]).filter((p) => typeof p === 'number')
        : [];

      const [udocs, pdocs] = await Promise.all([
        uidSet.size > 0
          ? db.collection('user').find({ _id: { $in: [...uidSet] } }).project(USER_PROJECTION).toArray()
          : [],
        pids.length > 0
          ? db.collection('document').find({ domainId, docType: TYPE_PROBLEM, docId: { $in: pids } }).project(PROBLEM_PROJECTION).toArray()
          : [],
      ]);

      const udict: Record<string, unknown> = {};
      for (const u of udocs) {
        udict[String((u as { _id: number })._id)] = u;
      }

      const pdict: Record<string, unknown> = {};
      for (const p of pdocs) {
        const docId = (p as { docId: number }).docId;
        if (docId != null) pdict[String(docId)] = p;
      }

      this.response.body = { tdoc, tsdoc: tsdocRow ?? null, udict, pdict };
    } catch (e) {
      console.error('[hydro-api] GET /api/contest/:tid error:', e);
      this.response.status = 500;
      this.response.body = { error: 'internal_error' };
    }
  }
}
