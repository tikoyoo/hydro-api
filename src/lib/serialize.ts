import { ObjectId } from 'mongodb';

/** 单层：把评测等文档里的 OID/Date 变成 JSON 安全类型 */
export function shallowSerializeDoc<T extends Record<string, unknown>>(doc: T): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v instanceof ObjectId) out[k] = v.toHexString();
    else if (v instanceof Date) out[k] = v.toISOString();
  }
  return out;
}
