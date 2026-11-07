import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Opaque random secret, e.g. `dpue_at_3f9c…`. Only its SHA-256 hash is ever stored. */
export function generateSecret(prefix: string, bytes = 24): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`;
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(length: number): string {
  const buf = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}
