/**
 * @file tokens.ts
 * @description Zero-dependency Web Crypto HMAC-SHA256 JWT tokens & PBKDF2-SHA256 password hashing
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface TokenClaims {
  sub?: string;
  role?: string;
  iat: number;
  exp?: number;
  [key: string]: unknown;
}

export interface TokenVerificationResult<T extends TokenClaims = TokenClaims> {
  valid: boolean;
  payload?: T;
  error?: string;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function fromBase64Url(input: string): Uint8Array {
  return new Uint8Array(Buffer.from(input, 'base64url'));
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 8) {
    throw new Error('Auth secret must be at least 8 characters long');
  }
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Sign a payload into an HS256 JWT token using native crypto.subtle.
 */
export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSec = 3600
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const fullPayload: TokenClaims = {
    ...payload,
    iat: typeof payload.iat === 'number' ? payload.iat : nowSec,
    ...(expiresInSec > 0 ? { exp: nowSec + expiresInSec } : {}),
  };

  const headerPart = toBase64Url(textEncoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadPart = toBase64Url(textEncoder.encode(JSON.stringify(fullPayload)));
  const signingInput = `${headerPart}.${payloadPart}`;

  const key = await importHmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, textEncoder.encode(signingInput))
  );

  return `${signingInput}.${toBase64Url(signature)}`;
}

/**
 * Verify an HS256 JWT token signature and expiration timestamp.
 */
export async function verifyToken<T extends TokenClaims = TokenClaims>(
  token: string,
  secret: string
): Promise<TokenVerificationResult<T>> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [headerPart, payloadPart, sigPart] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;

  try {
    const headerJson = textDecoder.decode(fromBase64Url(headerPart));
    const header = JSON.parse(headerJson) as { alg?: string; typ?: string };
    if (header?.alg !== 'HS256') {
      return { valid: false, error: 'Unsupported token algorithm' };
    }

    const key = await importHmacKey(secret);
    const expectedSig = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, textEncoder.encode(signingInput))
    );
    const actualSig = fromBase64Url(sigPart);

    if (!timingSafeEqualBytes(expectedSig, actualSig)) {
      return { valid: false, error: 'Invalid token signature' };
    }

    const payloadJson = textDecoder.decode(fromBase64Url(payloadPart));
    const payload = JSON.parse(payloadJson) as T;

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp <= nowSec) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

/**
 * Hash a password using PBKDF2-SHA256 with a random 16-byte salt.
 * Stored format: pbkdf2_sha256$<iterations>$<saltHex>$<hashHex>
 */
export async function hashPassword(password: string, salt?: string): Promise<string> {
  const iterations = 100_000;
  const saltBytes = salt
    ? new Uint8Array(Buffer.from(salt, 'hex'))
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
      keyMaterial,
      256
    )
  );

  const saltHex = Buffer.from(saltBytes).toString('hex');
  const hashHex = Buffer.from(derived).toString('hex');
  return `pbkdf2_sha256$${iterations}$${saltHex}$${hashHex}`;
}

/**
 * Verify a plaintext password against a stored PBKDF2 hash string using constant-time equality.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
    return false;
  }

  const iterations = Number(parts[1]);
  const saltHex = parts[2];
  const expectedHex = parts[3];
  if (!Number.isFinite(iterations) || iterations < 10_000) {
    return false;
  }

  const saltBytes = new Uint8Array(Buffer.from(saltHex, 'hex'));
  const expectedBytes = new Uint8Array(Buffer.from(expectedHex, 'hex'));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
      keyMaterial,
      256
    )
  );

  return timingSafeEqualBytes(derived, expectedBytes);
}
