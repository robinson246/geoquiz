import crypto from 'node:crypto';

const TOKEN_SECRET = process.env.AUTH_SECRET || 'geoquiz-dev-secret-change-me';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signPayload(payload) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

export function createToken(userId) {
  const body = base64url(
    JSON.stringify({
      sub: userId,
      exp: Date.now() + TOKEN_TTL_MS,
    })
  );
  return `${body}.${signPayload(body)}`;
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) {
    return null;
  }

  const [body, signature] = token.split('.');
  if (signature !== signPayload(body)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.sub || payload.exp < Date.now()) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}
