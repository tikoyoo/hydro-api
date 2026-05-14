import { Handler } from 'hydrooj';

export class UserGetHandler extends Handler {
  noCheckPermView = true;

  async get() {
    try {
      const u = this.user as Record<string, unknown> & { _id?: number; hash?: unknown; salt?: unknown };
      if (!u || u._id === 0) {
        this.response.body = { _id: 0 };
        return;
      }
      const { hash: _hash, salt: _salt, ...safe } = u;
      this.response.body = safe;
    } catch (e) {
      console.error('[hydro-api] GET /api/user/me error:', e);
      this.response.status = 500;
      this.response.body = { _id: 0, error: 'internal_error' };
    }
  }
}
