import crypto from 'crypto';

export const AUTH_COOKIE = 'scholar_session';
export const LOGIN_PATH = '/login';

function sessionSecret() {
  return process.env.APP_SHARED_PASSWORD || '';
}

function digest(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function isAuthConfigured() {
  return sessionSecret().trim().length > 0;
}

export function verifySharedPassword(candidate: string) {
  const secret = sessionSecret();
  if (!secret) return true;
  return safeEqual(candidate, secret);
}

export function createSessionValue() {
  const secret = sessionSecret();
  if (!secret) return '';
  return digest(`scholar-ai:${secret}`);
}

export function isValidSessionValue(value: string | undefined) {
  if (!isAuthConfigured()) return true;
  if (!value) return false;
  return safeEqual(value, createSessionValue());
}
