'use strict';

/**
 * 极简 8890 网关示例：仅提供 `GET /api/domainUsers`（与全站排名 hydrate 对齐）。
 *
 * 用法：
 *   MONGODB_URI="mongodb://127.0.0.1:27017/hydro" PORT=8890 node hydro-api-gateway-standalone.example.js
 *   若连接串里没有库名，`MONGO_DB_NAME=hydro` 指定 Hydro 所用库（默认 `hydro`）。
 *
 * 自检：
 *   curl -sS 'http://127.0.0.1:8890/api/domainUsers?domainId=system&page=1&limit=2&sortField=rp&sortOrder=desc'
 *
 * 生产环境往往在 Caddy/Nginx **同源反代** `/api/domainUsers` → 本端口；或使用完整版
 * `/root/hydro-api-gateway.js` 并把 `createGatewayRouteGetter(db)` 挂进 routes。
 */

const http = require('http');
const { MongoClient } = require('mongodb');
const { executeDomainUsersGet } = require('./domainUsers-route.js');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/hydro';
const PORT = Number.parseInt(process.env.PORT || '8890', 10);

function corsHeaders(origin) {
  const hasOrigin = typeof origin === 'string' && origin.trim() !== '';
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (hasOrigin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGO_DB_NAME || 'hydro');

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const baseHeaders = corsHeaders(origin);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, baseHeaders);
      res.end();
      return;
    }

    let url;
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400, baseHeaders);
      res.end(JSON.stringify({ error: 'bad_url' }));
      return;
    }

    if (req.method !== 'GET' || url.pathname !== '/api/domainUsers') {
      res.writeHead(404, baseHeaders);
      res.end(JSON.stringify({ error: 'not_found', hint: 'only GET /api/domainUsers is implemented in this example' }));
      return;
    }

    try {
      const body = await executeDomainUsersGet(db, url.searchParams);
      res.writeHead(200, baseHeaders);
      res.end(JSON.stringify(body));
    } catch (e) {
      console.error('[domainUsers]', e);
      res.writeHead(500, baseHeaders);
      res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[hydro-api-gateway-standalone] listening :${PORT}, GET /api/domainUsers`);
    console.log(`[hydro-api-gateway-standalone] MONGODB_URI=${MONGODB_URI} db=${process.env.MONGO_DB_NAME || 'hydro'}`);
  });

  process.on('SIGTERM', async () => {
    await client.close();
    process.exit(0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
