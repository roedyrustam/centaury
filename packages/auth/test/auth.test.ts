/**
 * @file auth.test.ts
 * @description Test suite for @rudyrustam/auth (Tokens, PBKDF2, RBAC/ReBAC, Passkeys, Legal Compliance Trio)
 */

import { describe, it, expect } from 'bun:test';
import { CentauryServer } from '@rudyrustam/core';
import {
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  CentauryAccessControl,
  createAuthMiddleware,
  CentauryPasskeyManager,
  legalCompliancePlugin,
} from '../src/index';

describe('@rudyrustam/auth Security, Passkeys & Legal Compliance', () => {
  const SECRET = 'centaury-super-secret-signing-key-2026';

  it('signs and verifies HS256 JWT tokens cleanly and rejects tampered or expired tokens', async () => {
    const token = await signToken({ sub: 'usr-1', role: 'admin' }, SECRET, 60);
    const verified = await verifyToken(token, SECRET);

    expect(verified.valid).toBe(true);
    expect(verified.payload?.sub).toBe('usr-1');
    expect(verified.payload?.role).toBe('admin');

    const tampered = `${token.slice(0, -4)}xxxx`;
    const tamperedResult = await verifyToken(tampered, SECRET);
    expect(tamperedResult.valid).toBe(false);

    const expired = await signToken({ sub: 'usr-1', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET, 0);
    const expiredResult = await verifyToken(expired, SECRET);
    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.error).toContain('expired');
  });

  it('hashes and verifies passwords securely with salted PBKDF2-SHA256', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple!');
    expect(hash.startsWith('pbkdf2_sha256$')).toBe(true);

    expect(await verifyPassword('CorrectHorseBatteryStaple!', hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('enforces RBAC permissions, ReBAC tuples, and auth middleware on CentauryServer', async () => {
    const acl = new CentauryAccessControl()
      .defineRole('editor', ['docs:read', 'docs:write'])
      .defineRole('admin', ['*'])
      .grantRelation('usr-7', 'owner', 'doc-42');

    expect(acl.hasPermission('editor', 'docs:write')).toBe(true);
    expect(acl.hasPermission('editor', 'billing:write')).toBe(false);
    expect(acl.hasPermission('admin', 'billing:write')).toBe(true);

    expect(acl.checkRelation('usr-7', 'owner', 'doc-42')).toBe(true);
    acl.revokeRelation('usr-7', 'owner', 'doc-42');
    expect(acl.checkRelation('usr-7', 'owner', 'doc-42')).toBe(false);

    const server = new CentauryServer({ port: 0 });
    server.use(
      createAuthMiddleware({
        secret: SECRET,
        requiredPermission: 'docs:write',
        accessControl: acl,
      })
    );
    server.get('/api/docs', (ctx) => {
      const user = ctx.state.get('user') as { sub: string };
      return ctx.jsonResponse({ ok: true, userId: user.sub });
    });

    const listener = server.listen();
    try {
      const noAuth = await fetch(`http://localhost:${listener.port}/api/docs`);
      expect(noAuth.status).toBe(401);

      const viewerToken = await signToken({ sub: 'usr-2', role: 'viewer' }, SECRET);
      const forbidden = await fetch(`http://localhost:${listener.port}/api/docs`, {
        headers: { Authorization: `Bearer ${viewerToken}` },
      });
      expect(forbidden.status).toBe(403);

      const editorToken = await signToken({ sub: 'usr-7', role: 'editor' }, SECRET);
      const ok = await fetch(`http://localhost:${listener.port}/api/docs`, {
        headers: { Authorization: `Bearer ${editorToken}` },
      });
      expect(ok.status).toBe(200);
      const body: any = await ok.json();
      expect(body.userId).toBe('usr-7');
    } finally {
      server.stop();
    }
  });

  it('issues and verifies single-use WebAuthn Passkey registration and authentication challenges', () => {
    const passkeys = new CentauryPasskeyManager({ rpId: 'centaury.dev', rpName: 'Centaury' });
    const reg = passkeys.createRegistrationChallenge('usr-99', 'roedy@centaury.dev');

    const clientData = JSON.stringify({
      type: 'webauthn.create',
      challenge: reg.challenge,
      origin: 'https://centaury.dev',
    });

    const firstVerify = passkeys.verifyChallenge(reg.challengeId, clientData);
    expect(firstVerify.verified).toBe(true);
    expect(firstVerify.userId).toBe('usr-99');

    // Replay with the same challengeId must be rejected
    const replay = passkeys.verifyChallenge(reg.challengeId, clientData);
    expect(replay.verified).toBe(false);

    const auth = passkeys.createAuthenticationChallenge('usr-99');
    const authPayload = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: auth.challenge,
        origin: 'https://centaury.dev',
      })
    ).toString('base64url');
    expect(passkeys.verifyChallenge(auth.challengeId, authPayload).verified).toBe(true);
  });

  it('serves the mandatory Legal & Privacy Trio and processes account deletion requests', async () => {
    const deletedUsers: string[] = [];
    const server = new CentauryServer({ port: 0 });
    server.usePlugin(
      legalCompliancePlugin({
        appName: 'Centaury Demo',
        contactEmail: 'dpo@centaury.dev',
        onDeleteUser: async (payload) => {
          deletedUsers.push(payload.userId || payload.email || 'unknown');
        },
      })
    );

    const listener = server.listen();
    try {
      const privacyRes = await fetch(`http://localhost:${listener.port}/privacy`);
      expect(privacyRes.status).toBe(200);
      expect(await privacyRes.text()).toContain('UU PDP');

      const termsRes = await fetch(`http://localhost:${listener.port}/terms`);
      expect(termsRes.status).toBe(200);
      expect(await termsRes.text()).toContain('Terms');

      const deletePageRes = await fetch(`http://localhost:${listener.port}/delete-account`);
      expect(deletePageRes.status).toBe(200);
      expect(await deletePageRes.text()).toContain('Permanent Data Deletion');

      const badDelete = await fetch(`http://localhost:${listener.port}/api/compliance/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'missing user' }),
      });
      expect(badDelete.status).toBe(400);

      const goodDelete = await fetch(`http://localhost:${listener.port}/api/compliance/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr-del-1', email: 'user@centaury.dev', reason: 'GDPR erasure' }),
      });
      expect(goodDelete.status).toBe(200);
      const delJson: any = await goodDelete.json();
      expect(delJson.status).toBe('deleted');
      expect(delJson.receiptId).toMatch(/^del-/);
      expect(delJson.compliance).toContain('GDPR-Art-17');
      expect(deletedUsers).toEqual(['usr-del-1']);
    } finally {
      server.stop();
    }
  });
});
