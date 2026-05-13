import { Handler, db } from 'hydrooj';

const COL = 'edu_user_sync';

export class SyncHealthHandler extends Handler {
  noCheckPermView = true;

  async get() {
    this.response.body = {
      ok: true,
      service: 'hydrooj-plugin-sync',
      serverTime: Date.now(),
    };
  }
}

export class SyncBootstrapHandler extends Handler {
  async get() {
    try {
      const uid = Number(this.user?._id ?? (this.user as unknown as { uid?: number }).uid ?? 0);
      if (!Number.isFinite(uid) || uid <= 1) {
        this.response.status = 401;
        this.response.body = {
          error: 'login_required',
          userDataVersion: 0,
          serverTime: Date.now(),
          resources: {},
        };
        return;
      }

      const coll = db.collection(COL);
      const _id = `uid_${uid}`;

      // upsert: 并发安全，避免 insertOne + findOne 的竞态
      const result = await coll.findOneAndUpdate(
        { _id },
        {
          $setOnInsert: { uid, userDataVersion: 1, createdAt: new Date() },
          $set: { updatedAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' },
      );

      const doc = result.value || (await coll.findOne({ _id }));
      this.response.body = {
        userDataVersion: typeof doc?.userDataVersion === 'number' ? doc.userDataVersion : 1,
        serverTime: Date.now(),
        resources: {},
      };
    } catch (e) {
      console.error('[hydro-api] GET /api/sync/bootstrap error:', e);
      this.response.status = 500;
      this.response.body = { error: 'internal_error', userDataVersion: 0, serverTime: Date.now(), resources: {} };
    }
  }
}
