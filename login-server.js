const http = require('http');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

/**
 * 独立登录 HTTP 服务（监听 127.0.0.1:8891）
 *
 * 背景：Hydro 框架对 Guest POST 请求有无法绕过的 PrivilegeError 检查，
 * 即使在 Handler 上设置 noCheckPermView=true 和 allowCors=true 也不生效。
 * 因此通过独立 Node HTTP 服务直连 MongoDB 处理 JSON 登录，完全绕过 Hydro 框架。
 *
 * 使用方式：
 *   1. pm2 start login-server.js --name login-server
 *   2. Caddy 反代 /api/login → 127.0.0.1:8891
 *   3. 前端 authApi.login 优先调 /api/login JSON（404 时自动回退 HTML 表单）
 */

const PORT = process.env.LOGIN_PORT || 8891;
const MONGO_URL = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hydro';

let db;
MongoClient.connect(MONGO_URL).then((c) => {
  db = c.db();
  console.log('[login-server] DB connected');
});

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '');
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/login') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    try {
      const { uname, password } = JSON.parse(body);
      if (!uname || !password) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: '用户名和密码不能为空' }));
        return;
      }

      const udoc = await db.collection('user').findOne(
        { unameLower: uname.toLowerCase() },
        {
          projection: {
            _id: 1, uname: 1, hash: 1, salt: 1, mail: 1,
            perm: 1, role: 1, priv: 1, regat: 1, loginat: 1, avatar: 1,
          },
        },
      );
      if (!udoc?.hash || !udoc?.salt) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: '用户名或密码错误' }));
        return;
      }

      const valid = await new Promise((resolve) => {
        crypto.pbkdf2(password, udoc.salt, 100000, 64, 'sha256', (err, key) => {
          resolve(!err && key.toString('hex').substring(0, 64) === udoc.hash);
        });
      });
      if (!valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: '用户名或密码错误' }));
        return;
      }

      const { hash, salt, ...safe } = udoc;
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, user: safe }));
    } catch (e) {
      console.error('[login-server] error:', e);
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: '登录服务异常' }));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[login-server] listening on 127.0.0.1:${PORT}`);
});
