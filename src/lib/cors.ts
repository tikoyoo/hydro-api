import type { Handler } from 'hydrooj';

export function attachApiCors(h: Handler): void {
  const origin = h.request.headers.origin;
  const headers = (h.response.headers ||= {}) as Record<string, string>;
  headers['Access-Control-Allow-Origin'] = typeof origin === 'string' && origin.trim() ? origin : '';
  if (typeof origin === 'string' && origin.trim()) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
}
