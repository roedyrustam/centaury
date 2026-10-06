/**
 * @file router.ts
 * @description High-performance Trie-based HTTP router and middleware pipeline for Centaury
 */

import { CentauryContext } from './context';

export type RouteHandler = (ctx: CentauryContext) => Promise<Response> | Response;
export type MiddlewareHandler = (ctx: CentauryContext, next: () => Promise<Response>) => Promise<Response>;

interface RouteNode {
  part: string;
  isParam: boolean;
  paramName?: string;
  isWildcard: boolean;
  handlers: Map<string, RouteHandler>;
  children: Map<string, RouteNode>;
  wildcardChild?: RouteNode;
  paramChild?: RouteNode;
}

export class CentauryRouter {
  private root: RouteNode = this.createNode('');
  private middlewares: MiddlewareHandler[] = [];

  private createNode(part: string): RouteNode {
    return {
      part,
      isParam: part.startsWith(':'),
      paramName: part.startsWith(':') ? part.slice(1) : undefined,
      isWildcard: part === '*',
      handlers: new Map(),
      children: new Map(),
    };
  }

  /**
   * Register a global or prefix middleware
   */
  public use(middleware: MiddlewareHandler): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Register a route handler with path and method
   */
  public add(method: string, path: string, handler: RouteHandler): this {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const segments = cleanPath.split('/').filter(Boolean);
    let current = this.root;

    for (const segment of segments) {
      if (segment.startsWith(':')) {
        if (!current.paramChild) {
          current.paramChild = this.createNode(segment);
        }
        current = current.paramChild;
      } else if (segment === '*') {
        if (!current.wildcardChild) {
          current.wildcardChild = this.createNode(segment);
        }
        current = current.wildcardChild;
      } else {
        if (!current.children.has(segment)) {
          current.children.set(segment, this.createNode(segment));
        }
        current = current.children.get(segment)!;
      }
    }

    current.handlers.set(method.toUpperCase(), handler);
    return this;
  }

  public get(path: string, handler: RouteHandler): this {
    return this.add('GET', path, handler);
  }

  public post(path: string, handler: RouteHandler): this {
    return this.add('POST', path, handler);
  }

  public put(path: string, handler: RouteHandler): this {
    return this.add('PUT', path, handler);
  }

  public delete(path: string, handler: RouteHandler): this {
    return this.add('DELETE', path, handler);
  }

  public patch(path: string, handler: RouteHandler): this {
    return this.add('PATCH', path, handler);
  }

  public options(path: string, handler: RouteHandler): this {
    return this.add('OPTIONS', path, handler);
  }

  public all(path: string, handler: RouteHandler): this {
    return this.add('ALL', path, handler);
  }

  /**
   * Match incoming pathname and extract dynamic params
   */
  public match(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
    const segments = pathname.split('/').filter(Boolean);
    const params: Record<string, string> = {};

    const findMatch = (node: RouteNode, index: number): RouteHandler | null => {
      if (index === segments.length) {
        return node.handlers.get(method.toUpperCase()) ?? node.handlers.get('ALL') ?? null;
      }

      const segment = segments[index];

      // 1. Exact match check
      const exactChild = node.children.get(segment);
      if (exactChild) {
        const res = findMatch(exactChild, index + 1);
        if (res) return res;
      }

      // 2. Parametric match (:id)
      if (node.paramChild) {
        if (node.paramChild.paramName) {
          params[node.paramChild.paramName] = segment;
        }
        const res = findMatch(node.paramChild, index + 1);
        if (res) return res;
      }

      // 3. Wildcard match (*)
      if (node.wildcardChild) {
        params['*'] = segments.slice(index).join('/');
        return node.wildcardChild.handlers.get(method.toUpperCase()) ?? node.wildcardChild.handlers.get('ALL') ?? null;
      }

      return null;
    };

    const handler = findMatch(this.root, 0);
    if (!handler) return null;

    return { handler, params };
  }

  /**
   * Execute request through middleware chain and final handler
   */
  public async handle(ctx: CentauryContext): Promise<Response> {
    const matchResult = this.match(ctx.method, ctx.url.pathname);
    if (!matchResult) {
      return ctx.errorResponse('Route Not Found', 404, `No handler registered for ${ctx.method} ${ctx.url.pathname}`);
    }

    // Merge extracted path parameters
    Object.assign(ctx.params, matchResult.params);

    // Build onion middleware chain
    let idx = -1;
    const dispatch = async (i: number): Promise<Response> => {
      if (i <= idx) throw new Error('next() called multiple times in middleware');
      idx = i;
      if (i < this.middlewares.length) {
        const mw = this.middlewares[i];
        return await mw(ctx, () => dispatch(i + 1));
      }
      return await matchResult.handler(ctx);
    };

    return await dispatch(0);
  }

  /**
   * List all registered routes (used by MCP Agent Introspection)
   */
  public listRoutes(): Array<{ method: string; path: string }> {
    const routes: Array<{ method: string; path: string }> = [];

    const traverse = (node: RouteNode, currentPath: string) => {
      let pathSoFar = currentPath;
      if (node.isParam) {
        pathSoFar += `/:${node.paramName}`;
      } else if (node.isWildcard) {
        pathSoFar += '/*';
      } else if (node.part) {
        pathSoFar += `/${node.part}`;
      }

      for (const method of node.handlers.keys()) {
        routes.push({
          method,
          path: pathSoFar || '/',
        });
      }

      for (const child of node.children.values()) {
        traverse(child, pathSoFar);
      }
      if (node.paramChild) traverse(node.paramChild, pathSoFar);
      if (node.wildcardChild) traverse(node.wildcardChild, pathSoFar);
    };

    traverse(this.root, '');
    return routes;
  }
}
