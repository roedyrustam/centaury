/**
 * @file compliance.ts
 * @description Mandatory Legal & Privacy Trio Plugin (/privacy, /terms, /delete-account) compliant with UU PDP No. 27/2022, GDPR Art. 17, Apple 5.1.1(v), and Google Play Data Safety
 */

import type { CentauryContext, CentauryPlugin, RouteHandler } from '@rudyrustam/core';

export interface DeletionRequestPayload {
  userId?: string;
  email?: string;
  reason?: string;
}

export interface DeletionAuditRecord {
  receiptId: string;
  userId?: string;
  email?: string;
  reason?: string;
  deletedAt: string;
}

export interface LegalComplianceOptions {
  appName?: string;
  companyName?: string;
  contactEmail?: string;
  jurisdiction?: string;
  onDeleteUser?: (payload: DeletionRequestPayload, record: DeletionAuditRecord) => void | Promise<void>;
}

const COMPLIANCE_STANDARDS = [
  'UU-PDP-27-2022',
  'GDPR-Art-17',
  'Apple-5.1.1v',
  'GooglePlay-DataSafety',
] as const;

function wantsJson(ctx: CentauryContext): boolean {
  const format = ctx.url.searchParams.get('format');
  const accept = ctx.headers.get('accept') || '';
  return format === 'json' || accept.includes('application/json');
}

function renderDocumentHtml(title: string, appName: string, bodyHtml: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — ${appName}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 760px; margin: 2.5rem auto; padding: 0 1.25rem; line-height: 1.6; color: #0f172a; background: #f8fafc; }
    main { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-top: 0; }
    h2 { font-size: 1.125rem; margin-top: 1.5rem; }
    code { background: #f1f5f9; padding: 0.125rem 0.35rem; border-radius: 4px; }
    .meta { font-size: 0.875rem; color: #475569; margin-bottom: 1.25rem; }
    form { display: grid; gap: 0.75rem; margin-top: 1rem; }
    input, textarea, button { font: inherit; padding: 0.55rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; }
    button { background: #dc2626; color: #ffffff; border-color: #dc2626; cursor: pointer; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    ${bodyHtml}
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function registerAliasedRoutes(
  paths: string[],
  registerFn: (path: string, handler: RouteHandler) => void,
  handler: RouteHandler
): void {
  for (const path of paths) {
    registerFn(path, handler);
  }
}

/**
 * Installs the mandatory Legal & Privacy Trio (/privacy, /terms, /delete-account) on a CentauryServer.
 */
export function legalCompliancePlugin(options: LegalComplianceOptions = {}): CentauryPlugin {
  const appName = options.appName ?? 'Centaury Application';
  const companyName = options.companyName ?? appName;
  const contactEmail = options.contactEmail ?? 'privacy@centaury.dev';
  const jurisdiction = options.jurisdiction ?? 'Republic of Indonesia (UU PDP No. 27/2022) & GDPR';
  const auditTrail: DeletionAuditRecord[] = [];

  return {
    name: 'centaury:legal-compliance',
    version: '1.1.0',
    install(server) {
      const privacyHandler: RouteHandler = (ctx) => {
        const doc = {
          title: 'Privacy Policy / Kebijakan Privasi',
          appName,
          dataController: companyName,
          contactEmail,
          compliance: COMPLIANCE_STANDARDS,
          rights: [
            'Right of Access & Correction (UU PDP Art. 5 / GDPR Art. 15-16)',
            'Right to Erasure & Account Deletion via /delete-account (UU PDP Art. 8 / GDPR Art. 17)',
            'Right to Data Portability & Consent Withdrawal',
          ],
        };
        if (wantsJson(ctx)) return ctx.jsonResponse(doc);

        return renderDocumentHtml(
          doc.title,
          appName,
          `<p class="meta">Controller: <strong>${companyName}</strong> | Contact: <code>${contactEmail}</code></p>
           <h2>1. Data Collected & Purpose</h2>
           <p>${appName} processes only strictly necessary authentication, session, and operational records required to deliver core functionality.</p>
           <h2>2. User Rights & Data Erasure</h2>
           <p>You may request permanent deletion of your account and personal records at any time via <a href="/delete-account">/delete-account</a> or <code>POST /api/compliance/delete-account</code> in accordance with UU PDP No. 27/2022 &amp; GDPR Art. 13/17.</p>
           <p class="meta">Standards: ${COMPLIANCE_STANDARDS.join(', ')}</p>`
        );
      };

      const termsHandler: RouteHandler = (ctx) => {
        const doc = {
          title: 'Terms & Conditions / Syarat & Ketentuan',
          appName,
          operator: companyName,
          jurisdiction,
          contactEmail,
        };
        if (wantsJson(ctx)) return ctx.jsonResponse(doc);

        return renderDocumentHtml(
          doc.title,
          appName,
          `<p class="meta">Operator: <strong>${companyName}</strong> | Governing Law: ${jurisdiction}</p>
           <h2>1. Acceptable Use</h2>
           <p>Users and autonomous agents integrating with ${appName} agree to abide by rate limits, authentication safeguards, and applicable laws.</p>
           <h2>2. Termination & Account Deletion</h2>
           <p>Access may be terminated at user request using <a href="/delete-account">/delete-account</a>. Support contact: <code>${contactEmail}</code>.</p>`
        );
      };

      const deletePageHandler: RouteHandler = (ctx) => {
        const doc = {
          title: 'User Data & Account Deletion / Hapus Data Pengguna',
          appName,
          endpoint: '/api/compliance/delete-account',
          method: 'POST',
          compliance: COMPLIANCE_STANDARDS,
        };
        if (wantsJson(ctx)) return ctx.jsonResponse(doc);

        return renderDocumentHtml(
          doc.title,
          appName,
          `<p class="meta">Compliant with UU PDP No. 27/2022, GDPR Art. 17, Apple App Store 5.1.1(v), and Google Play Data Safety.</p>
           <p>Submit a permanent deletion request via JSON API (<code>POST /api/compliance/delete-account</code>) or complete the form below:</p>
           <form method="post" action="/api/compliance/delete-account">
             <input name="userId" placeholder="User ID (e.g. usr_123)" />
             <input name="email" type="email" placeholder="Registered Email" />
             <textarea name="reason" rows="3" placeholder="Optional reason for deletion"></textarea>
             <button type="submit">Request Permanent Data Deletion</button>
           </form>`
        );
      };

      const deleteSubmitHandler: RouteHandler = async (ctx) => {
        const contentType = ctx.headers.get('content-type') || '';
        let payload: DeletionRequestPayload = {};

        if (contentType.includes('application/json')) {
          payload = await ctx.json<DeletionRequestPayload>();
        } else {
          const form = await ctx.req.formData();
          payload = {
            userId: form.get('userId')?.toString() || undefined,
            email: form.get('email')?.toString() || undefined,
            reason: form.get('reason')?.toString() || undefined,
          };
        }

        const userId = payload.userId?.trim();
        const email = payload.email?.trim();
        if (!userId && !email) {
          return ctx.errorResponse(
            'Validation Error',
            400,
            'Either userId or email must be supplied to process data deletion.'
          );
        }

        const record: DeletionAuditRecord = {
          receiptId: `del-${crypto.randomUUID().slice(0, 12)}`,
          userId,
          email,
          reason: payload.reason?.trim(),
          deletedAt: new Date().toISOString(),
        };

        if (options.onDeleteUser) {
          await options.onDeleteUser({ userId, email, reason: record.reason }, record);
        }

        auditTrail.push(record);

        return ctx.jsonResponse({
          status: 'deleted',
          receiptId: record.receiptId,
          deletedAt: record.deletedAt,
          subject: { userId, email },
          compliance: COMPLIANCE_STANDARDS,
        });
      };

      registerAliasedRoutes(['/privacy', '/privacy-policy'], (p, h) => server.get(p, h), privacyHandler);
      registerAliasedRoutes(['/terms', '/terms-and-conditions'], (p, h) => server.get(p, h), termsHandler);
      registerAliasedRoutes(['/delete-account', '/data-deletion'], (p, h) => server.get(p, h), deletePageHandler);
      registerAliasedRoutes(
        ['/delete-account', '/api/compliance/delete-account'],
        (p, h) => server.post(p, h),
        deleteSubmitHandler
      );
    },
  };
}
