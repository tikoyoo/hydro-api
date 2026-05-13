import { Handler, db, param, Types, PERM } from 'hydrooj';
import { ObjectId } from 'mongodb';
import { shallowSerializeDoc } from '../lib/serialize';

const RECORD_PRETEST = new ObjectId('000000000000000000000000');
const RECORD_GENERATE = new ObjectId('000000000000000000000001');

const STATUS_MAP: Record<number, string> = {
  0: 'Waiting',
  1: 'Accepted',
  2: 'Wrong Answer',
  3: 'Time Limit Exceeded',
  4: 'Memory Limit Exceeded',
  5: 'Runtime Error',
  6: 'Compile Error',
  7: 'System Error',
  8: 'Canceled',
  9: 'Judging',
};

function readMergedQuery(handler: Handler): Record<string, unknown> {
  const req = handler as unknown as {
    args?: Record<string, unknown>;
    request?: { query?: Record<string, unknown> };
  };
  const q =
    typeof req.request?.query === 'object' && req.request.query
      ? { ...req.request.query }
      : {};
  const a = typeof req.args === 'object' && req.args ? { ...req.args } : {};
  return { ...q, ...a };
}

function normalizePidList(handler: Handler): number[] | undefined {
  const m = readMergedQuery(handler);
  const raw = m.pid ?? m.problem ?? m.pidList;
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (Array.isArray(raw))
    return [...new Set(raw.map((x) => Number(String(x))).filter(Number.isFinite))].filter((n) => !Number.isNaN(n));
  if (typeof raw === 'number' && Number.isFinite(raw)) return [raw];
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? [n] : undefined;
  }
  return undefined;
}

function excludePretestEnabled(ex?: string | number, incl?: string | number): boolean {
  if (String(incl) === '1' || String(incl).toLowerCase() === 'true') return false;
  if (String(ex) === '0' || String(ex).toLowerCase() === 'false') return false;
  if (ex == null || ex === '') return true;
  return String(ex) === '1' || String(ex).toLowerCase() === 'true';
}

function recordWithStatus(r: Record<string, unknown>): Record<string, unknown> {
  const flat = shallowSerializeDoc(r);
  const sn =
    typeof (r as { status?: number }).status === 'number' ? (r as { status: number }).status : NaN;
  return {
    ...flat,
    statusText: Number.isFinite(sn) ? (STATUS_MAP[sn] ?? 'Unknown') : 'Unknown',
  };
}

export class RecordListHandler extends Handler {
  @param('page', Types.PositiveInt, true)
  @param('limit', Types.PositiveInt, true)
  @param('uid', Types.PositiveInt, true)
  @param('rid', Types.ObjectId, true)
  @param('excludePretest', Types.String, true)
  @param('includePretest', Types.String, true)
  async get(
    domainId: string,
    page = 1,
    limit = 200,
    uid?: number,
    rid?: ObjectId,
    excludePretest?: string,
    includePretest?: string,
  ) {
    try {
    const merged = readMergedQuery(this as unknown as Handler);
    const exArg =
      excludePretest ??
      (merged.excludePretest as string | undefined) ??
      (merged.exclude_pretest as string | undefined) ??
      (merged.officialOnly as string | undefined) ??
      (merged.official_only as string | undefined);
    const incArg =
      includePretest ??
      ((merged.includePretest ?? merged.include_pretest) as string | undefined);
    const noPretest = excludePretestEnabled(typeof exArg === 'string' ? exArg : exArg?.toString(), incArg?.toString());

    const pidList = normalizePidList(this as unknown as Handler);
    const coll = db.collection('record');

    if (rid) {
      if (!(this.user?._id >= 2)) {
        this.response.status = 401;
        this.response.body = {
          records: [],
          total: 0,
          page: 1,
          limit: 1,
          error: 'login_required',
        };
        return;
      }

      const rdoc = await coll.findOne({
        domainId,
        _id: rid,
      });
      if (!rdoc || typeof (rdoc as { uid?: number }).uid !== 'number') {
        this.response.body = { records: [], total: 0, page: 1, limit: 1 };
        return;
      }
      const owner = (rdoc as { uid: number }).uid;
      if (owner !== this.user._id) this.checkPerm(PERM.PERM_VIEW_RECORD);

      const out = recordWithStatus(rdoc as Record<string, unknown>);
      this.response.body = { records: [out], total: 1, page: 1, limit: 1 };
      return;
    }

    if (!(typeof uid === 'number' && uid > 1)) {
      this.response.status = 400;
      this.response.body = {
        records: [],
        total: 0,
        page: Math.max(1, page),
        limit: Math.min(500, Math.max(1, limit)),
        error: 'requires_positive_uid_parameter',
      };
      return;
    }

    if (uid !== this.user._id) this.checkPerm(PERM.PERM_VIEW_RECORD);

    const query: Record<string, unknown> = { domainId, uid };
    if (pidList?.length) query.pid = { $in: pidList };

    if (noPretest) {
      query.$nor = [{ contest: RECORD_PRETEST }, { contest: RECORD_GENERATE }];
    }

    const lim = Math.min(500, Math.max(1, limit));
    const pg = Math.max(1, page);
    const total = await coll.countDocuments(query);

    const rdocs = await coll
      .find(query)
      .project({
        _id: 1,
        score: 1,
        time: 1,
        memory: 1,
        lang: 1,
        uid: 1,
        pid: 1,
        rejudged: 1,
        progress: 1,
        domainId: 1,
        contest: 1,
        judger: 1,
        judgeAt: 1,
        status: 1,
        source: 1,
        input: 1,
      })
      .sort({ _id: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .toArray();

    const records = rdocs.map((r) => recordWithStatus(r as Record<string, unknown>));

    this.response.body = { records, total, page: pg, limit: lim };
    } catch (e) {
      console.error('[hydro-api] GET /api/record error:', e);
      this.response.status = 500;
      this.response.body = { records: [], total: 0, page: 1, limit: 200, error: 'internal_error' };
    }
  }
}
