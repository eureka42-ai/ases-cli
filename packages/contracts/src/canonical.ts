import { createHash } from 'node:crypto';

/** JSON com chaves ordenadas; o mesmo algoritmo de scripts/ases-dev.mjs (§6.6: hash sobre a forma canônica). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
}

export const sha256Hex = (data: string): string => createHash('sha256').update(data).digest('hex');
export const payloadSha256 = (payload: unknown): string => sha256Hex(canonicalJson(payload));
