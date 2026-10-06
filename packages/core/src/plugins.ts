/**
 * @file plugins.ts
 * @description Official Plugin System and Built-in Security & Rate-Limiter Plugins for Centaury
 */

import type { CentauryServer } from './server';
import type { CentauryContext } from './context';

export interface CentauryPlugin {
  name: string;
  version?: string;
  install: (server: CentauryServer) => void | Promise<void>;
}

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: string;
  hsts?: boolean;
  frameOptions?: 'DENY' | 'SAMEORIGIN';
  contentTypeOptions?: boolean;
}

/**
 * Enterprise Security Headers Plugin: enforces CSP, HSTS, X-Frame-Options, X-Content-Type-Options
 */
export function securityHeadersPlugin(options: SecurityHeadersOptions = {}): CentauryPlugin {
  const csp = options.contentSecurityPolicy ?? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: wss:;";
  const frameOptions = options.frameOptions ?? 'DENY';

  return {
    name: 'centaury:security-headers',
    version: '1.0.0',
    install(server) {
      server.use(async (ctx, next) => {
        const res = await next();
        res.headers.set('X-Content-Type-Options', 'nosniff');
        res.headers.set('X-Frame-Options', frameOptions);
        res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.headers.set('Content-Security-Policy', csp);
        if (options.hsts !== false) {
          res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        return res;
      });
    },
  };
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (ctx: CentauryContext) => string;
}

/**
 * Sliding Window In-Memory Rate Limiter Plugin for Centaury APIs and RPC endpoints
 */
export function rateLimiterPlugin(options: RateLimiterOptions = {}): CentauryPlugin {
  const windowMs = options.windowMs ?? 60000;
  const max = options.maxRequests ?? 100;
  const keyGen = options.keyGenerator ?? ((ctx) => {
    return ctx.req.headers.get('x-forwarded-for') || '127.0.0.1';
  });

  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    name: 'centaury:rate-limiter',
    version: '1.0.0',
    install(server) {
      server.use(async (ctx, next) => {
        const key = keyGen(ctx);
        const now = Date.now();
        const record = hits.get(key);

        if (!record || now > record.resetAt) {
          hits.set(key, { count: 1, resetAt: now + windowMs });
        } else {
          record.count++;
          if (record.count > max) {
            return new Response(
              JSON.stringify({
                type: 'https://centaury.dev/errors/rate-limit-exceeded',
                title: 'Too Many Requests',
                status: 429,
                detail: `Rate limit of ${max} requests per ${windowMs}ms exceeded. Try again in ${Math.ceil((record.resetAt - now) / 1000)}s.`,
              }),
              {
                status: 429,
                headers: {
                  'Content-Type': 'application/problem+json',
                  'Retry-After': Math.ceil((record.resetAt - now) / 1000).toString(),
                },
              }
            );
          }
        }

        const res = await next();
        const cur = hits.get(key);
        if (cur) {
          res.headers.set('X-RateLimit-Limit', max.toString());
          res.headers.set('X-RateLimit-Remaining', Math.max(0, max - cur.count).toString());
        }
        return res;
      });
    },
  };
}
