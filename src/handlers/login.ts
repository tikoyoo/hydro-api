import { Handler, db } from 'hydrooj';
import crypto from 'crypto';

/**
 * POST /api/login
 * JSON 登录：接受 { uname, password, rememberme? } → 返回 { success, user }
 * 成功时通过 Hydro 内置机制设置 session，前端无需解析 HTML。
 *
 * 密码校验：Hydro 的 hash/salt 格式为迭代哈希 (pbkdf2-like)，
 * 与 `packages/hydrooj/src/model/user.ts` 中 verifyPassword 语义一致。
 */
export class LoginHandler extends Handler {
  noCheckPermView = true;

  async post() {
    const body = (this as unknown as { request?: { body?: Record<string, unknown> } }).request?.body;
    if (!body || typeof body !== 'object') {
      this.response.status = 400;
      this.response.body = { success: false, error: '请求体需为 JSON' };
      return;
    }

    const uname = String(body.uname || '').trim();
    const password = String(body.password || '');
    const rememberme = !!(body.rememberme || body.rememberMe);

    if (!uname || !password) {
      this.response.status = 400;
      this.response.body = { success: false, error: '用户名和密码不能为空' };
      return;
    }

    try {
      const coll = db.collection('user');
      const udoc = await coll.findOne(
        { unameLower: uname.toLowerCase() },
        { projection: { _id: 1, uname: 1, unameLower: 1, hash: 1, salt: 1, mail: 1, perm: 1, role: 1, priv: 1, regat: 1, loginat: 1, avatar: 1 } },
      );

      if (!udoc || !udoc.hash || !udoc.salt) {
        this.response.status = 401;
        this.response.body = { success: false, error: '用户名或密码错误' };
        return;
      }

      const valid = verifyHydroPassword(password, String(udoc.salt), String(udoc.hash));
      if (!valid) {
        this.response.status = 401;
        this.response.body = { success: false, error: '用户名或密码错误' };
        return;
      }

      // 写入 session
      const session = (this as unknown as { session?: Record<string, unknown> }).session;
      if (session) {
        session.uid = udoc._id;
        if (rememberme) {
          session.rememberme = true;
        }
      }

      // 更新最后登录时间
      await coll.updateOne({ _id: udoc._id }, { $set: { loginat: new Date() } });

      const { hash: _h, salt: _s, unameLower: _ul, ...safe } = udoc;
      this.response.body = { success: true, user: safe };
    } catch (e) {
      console.error('[hydro-api] POST /api/login error:', e);
      this.response.status = 500;
      this.response.body = { success: false, error: '登录服务异常，请稍后重试' };
    }
  }
}

/**
 * 与 Hydro `model/user.ts` 的密码校验对齐：
 * hash 存储在 DB 为 `${iterations}|${derivedKeyHex}`，
 * salt 为 hex 字符串。
 */
function verifyHydroPassword(password: string, saltHex: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('|');
    if (parts.length === 2) {
      // 格式: iterations|hash
      const iterations = parseInt(parts[0], 10);
      const expected = parts[1];
      if (Number.isFinite(iterations) && iterations > 0) {
        const derived = crypto.pbkdf2Sync(password, saltHex, iterations, 64, 'sha512');
        return derived.toString('hex') === expected;
      }
    }
    // 无分隔符：旧格式，直接比较（Hydro 早期版本）
    const derived = crypto.pbkdf2Sync(password, saltHex, 10000, 64, 'sha512');
    return derived.toString('hex') === storedHash;
  } catch {
    return false;
  }
}
