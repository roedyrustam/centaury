/**
 * @file webauthn.ts
 * @description FIDO2 / WebAuthn Passkeys Cryptographic Challenge Manager for Centaury
 */

export interface PasskeyManagerOptions {
  rpId?: string;
  rpName?: string;
  /** Challenge expiration window in milliseconds. Default: 120000 (2 minutes) */
  challengeTtlMs?: number;
}

export interface PasskeyChallenge {
  challengeId: string;
  challenge: string;
  type: 'registration' | 'authentication';
  userId: string;
  rpId: string;
  rpName: string;
  expiresAt: number;
}

export interface PasskeyRegistrationOptions extends PasskeyChallenge {
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
}

export interface PasskeyVerificationResult {
  verified: boolean;
  userId?: string;
  challengeId: string;
  origin?: string;
  error?: string;
}

function generateChallengeBase64Url(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Manages single-use, TTL-bounded WebAuthn / Passkey registration and authentication challenges.
 */
export class CentauryPasskeyManager {
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly challengeTtlMs: number;
  private readonly activeChallenges = new Map<string, PasskeyChallenge>();

  constructor(options: PasskeyManagerOptions = {}) {
    this.rpId = options.rpId ?? 'localhost';
    this.rpName = options.rpName ?? 'Centaury Application';
    this.challengeTtlMs = options.challengeTtlMs ?? 120_000;
  }

  /**
   * Generate WebAuthn registration options with a single-use cryptographic challenge.
   */
  public createRegistrationChallenge(
    userId: string,
    userName: string,
    displayName = userName
  ): PasskeyRegistrationOptions {
    const challengeId = crypto.randomUUID();
    const challenge = generateChallengeBase64Url();
    const record: PasskeyChallenge = {
      challengeId,
      challenge,
      type: 'registration',
      userId,
      rpId: this.rpId,
      rpName: this.rpName,
      expiresAt: Date.now() + this.challengeTtlMs,
    };
    this.activeChallenges.set(challengeId, record);

    return {
      ...record,
      user: {
        id: Buffer.from(userId, 'utf8').toString('base64url'),
        name: userName,
        displayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
    };
  }

  /**
   * Generate a WebAuthn authentication challenge for passwordless sign-in.
   */
  public createAuthenticationChallenge(userId: string): PasskeyChallenge {
    const challengeId = crypto.randomUUID();
    const record: PasskeyChallenge = {
      challengeId,
      challenge: generateChallengeBase64Url(),
      type: 'authentication',
      userId,
      rpId: this.rpId,
      rpName: this.rpName,
      expiresAt: Date.now() + this.challengeTtlMs,
    };
    this.activeChallenges.set(challengeId, record);
    return record;
  }

  /**
   * Verify clientDataJSON (JSON string or base64url-encoded JSON) against the issued single-use challenge.
   */
  public verifyChallenge(challengeId: string, clientDataJSON: string): PasskeyVerificationResult {
    const record = this.activeChallenges.get(challengeId);
    if (!record) {
      return { verified: false, challengeId, error: 'Challenge not found or already consumed' };
    }

    // Single-use consumption
    this.activeChallenges.delete(challengeId);

    if (Date.now() > record.expiresAt) {
      return { verified: false, challengeId, error: 'Challenge expired' };
    }

    try {
      const trimmed = clientDataJSON.trim();
      const rawJson = trimmed.startsWith('{')
        ? trimmed
        : Buffer.from(trimmed, 'base64url').toString('utf8');
      const parsed = JSON.parse(rawJson) as {
        type?: string;
        challenge?: string;
        origin?: string;
      };

      const expectedType =
        record.type === 'registration' ? 'webauthn.create' : 'webauthn.get';
      if (parsed.type && parsed.type !== expectedType) {
        return {
          verified: false,
          challengeId,
          error: `Unexpected ceremony type '${parsed.type}', expected '${expectedType}'`,
        };
      }

      if (parsed.challenge !== record.challenge) {
        return { verified: false, challengeId, error: 'Challenge mismatch' };
      }

      return {
        verified: true,
        userId: record.userId,
        challengeId,
        origin: parsed.origin,
      };
    } catch (err) {
      return {
        verified: false,
        challengeId,
        error: `Malformed clientDataJSON: ${(err as Error).message}`,
      };
    }
  }
}
