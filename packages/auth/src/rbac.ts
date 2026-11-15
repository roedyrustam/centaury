/**
 * @file rbac.ts
 * @description Role-Based (RBAC) & Relationship-Based (ReBAC) Access Control + Auth Middleware for Centaury
 */

import type { MiddlewareHandler } from '@rudyrustam/core';
import { verifyToken, type TokenClaims } from './tokens';

export interface AuthMiddlewareOptions {
  secret: string;
  requiredPermission?: string;
  accessControl?: CentauryAccessControl;
  /** Optional prefixes excluded from auth enforcement (defaults to public health & legal routes) */
  publicPaths?: string[];
}

/**
 * Combined Role-Based (RBAC) and Relationship-Based (ReBAC) permission manager.
 */
export class CentauryAccessControl {
  private readonly rolePermissions = new Map<string, Set<string>>();
  private readonly relations = new Set<string>();

  private static tupleKey(subject: string, relation: string, object: string): string {
    return `${subject}::${relation}::${object}`;
  }

  /**
   * Bind a set of permissions to a role (supports '*' wildcard).
   */
  public defineRole(role: string, permissions: string[]): this {
    const existing = this.rolePermissions.get(role) ?? new Set<string>();
    for (const perm of permissions) {
      existing.add(perm);
    }
    this.rolePermissions.set(role, existing);
    return this;
  }

  /**
   * Check whether a role has the specified permission.
   */
  public hasPermission(role: string, permission: string): boolean {
    const perms = this.rolePermissions.get(role);
    if (!perms) return false;
    if (perms.has('*') || perms.has(permission)) return true;

    const [prefix] = permission.split(':');
    return Boolean(prefix && perms.has(`${prefix}:*`));
  }

  /**
   * Grant a fine-grained ReBAC relationship tuple: (subject, relation, object).
   */
  public grantRelation(subject: string, relation: string, object: string): this {
    this.relations.add(CentauryAccessControl.tupleKey(subject, relation, object));
    return this;
  }

  /**
   * Revoke an existing ReBAC relationship tuple.
   */
  public revokeRelation(subject: string, relation: string, object: string): this {
    this.relations.delete(CentauryAccessControl.tupleKey(subject, relation, object));
    return this;
  }

  /**
   * Check whether (subject, relation, object) exists.
   */
  public checkRelation(subject: string, relation: string, object: string): boolean {
    return this.relations.has(CentauryAccessControl.tupleKey(subject, relation, object));
  }
}

/**
 * Create a Centaury middleware verifying Bearer HS256 JWT tokens and optional RBAC permission.
 */
export function createAuthMiddleware(
  secretOrOptions: string | AuthMiddlewareOptions,
  requiredPermission?: string,
  accessControl?: CentauryAccessControl
): MiddlewareHandler {
  const opts: AuthMiddlewareOptions =
    typeof secretOrOptions === 'string'
      ? { secret: secretOrOptions, requiredPermission, accessControl }
      : secretOrOptions;

  const publicPaths = opts.publicPaths ?? [
    '/_health',
    '/privacy',
    '/privacy-policy',
    '/terms',
    '/terms-and-conditions',
    '/delete-account',
    '/data-deletion',
  ];

  return async (ctx, next) => {
    if (publicPaths.some((p) => ctx.url.pathname === p || ctx.url.pathname.startsWith(`${p}/`))) {
      return await next();
    }

    const authHeader = ctx.headers.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (!match) {
      return ctx.errorResponse('Unauthorized', 401, 'Missing Bearer authentication token');
    }

    const verified = await verifyToken<TokenClaims>(match[1], opts.secret);
    if (!verified.valid || !verified.payload) {
      return ctx.errorResponse('Unauthorized', 401, verified.error || 'Invalid token');
    }

    ctx.state.set('user', verified.payload);

    if (opts.requiredPermission) {
      const role = verified.payload.role;
      const acl = opts.accessControl;
      const allowedByAcl = role && acl ? acl.hasPermission(role, opts.requiredPermission) : false;
      const inlinePerms = Array.isArray(verified.payload.permissions)
        ? (verified.payload.permissions as unknown[])
        : [];
      const allowedByClaim = inlinePerms.includes('*') || inlinePerms.includes(opts.requiredPermission);

      if (!allowedByAcl && !allowedByClaim) {
        return ctx.errorResponse(
          'Forbidden',
          403,
          `Missing required permission '${opts.requiredPermission}'`
        );
      }
    }

    return await next();
  };
}
