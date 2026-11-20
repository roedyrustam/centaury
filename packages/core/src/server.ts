/**
 * @file server.ts
 * @description High-performance Bun HTTP & WebSocket Micro-Kernel Engine for Centaury
 */

import { CentauryContext } from './context';
import { CentauryRouter, RouteHandler, MiddlewareHandler } from './router';
import { CentauryRPC, ProcedureDefinition } from './rpc';
import type { CentauryPlugin } from './plugins';
import { CENTAURY_VERSION, CENTAURY_ENGINE_LABEL } from './version';
import { statSync } from 'fs';
import { extname, resolve, sep } from 'path';
import type { Server, ServerWebSocket } from 'bun';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export type WebSocketMessageHandler = (
  ws: ServerWebSocket<WebSocketData>,
  parsed: Record<string, unknown> | null,
  raw: string | Buffer
) => void;

export interface StaticServeOptions {
  cacheControl?: string;
}

export interface CentauryServerOptions {
  port?: number;
  hostname?: string;
  staticDir?: string;
  ai?: {
    model?: string;
    thinkingBudget?: number;
  };
  cors?: boolean;
}

export interface WebSocketData {
  sessionId: string;
  subscriptions: Set<string>;
  connectedAt: number;
}

export class CentauryServer {
  public readonly router: CentauryRouter = new CentauryRouter();
  public readonly rpcEngine: CentauryRPC = new CentauryRPC();
  public readonly options: CentauryServerOptions;
  private serverInstance: Server<WebSocketData> | null = null;
  private activeWebSockets = new Set<ServerWebSocket<WebSocketData>>();
  private wsMessageHandlers: WebSocketMessageHandler[] = [];
  private serverState = new Map<string, unknown>();

  constructor(options: CentauryServerOptions = {}) {
    this.options = {
      port: options.port ?? 3000,
      hostname: options.hostname ?? '0.0.0.0',
      staticDir: options.staticDir,
      cors: options.cors ?? true,
      ai: options.ai,
    };

    this.setupBuiltinRoutes();
    if (this.options.staticDir) {
      this.serveStatic('/', this.options.staticDir);
    }
  }

  private setupBuiltinRoutes(): void {
    // 1. CORS Preflight & Headers
    if (this.options.cors) {
      this.router.use(async (ctx, next) => {
        if (ctx.method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Centaury-Key',
              'Access-Control-Max-Age': '86400',
            },
          });
        }
        const res = await next();
        res.headers.set('Access-Control-Allow-Origin', '*');
        return res;
      });
    }

    // 2. Health & Heartbeat
    this.router.get('/_health', (ctx) => {
      return ctx.jsonResponse({
        status: 'online',
        engine: CENTAURY_ENGINE_LABEL,
        version: CENTAURY_VERSION,
        runtime: 'Bun ' + Bun.version,
        activeConnections: this.activeWebSockets.size,
        uptime: process.uptime(),
      });
    });

    // 3. Unified RPC Dispatcher Endpoint
    this.router.post('/rpc', (ctx) => {
      return this.rpcEngine.handleRequest(ctx);
    });

    // 4. Built-in MCP Discovery (Dual-Citizen Agent Introspection)
    this.router.get('/.well-known/mcp.json', (ctx) => {
      return ctx.jsonResponse({
        mcpVersion: '1.0.0',
        serverInfo: {
          name: 'Centaury Dual-Citizen Engine',
          version: CENTAURY_VERSION,
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
        },
        tools: this.rpcEngine.getMetadata().map((m) => ({
          name: m.name,
          description: m.description ?? `Invoke Centaury RPC procedure '${m.name}'`,
          inputSchema: m.inputSchema,
        })),
        routes: this.router.listRoutes(),
      });
    });
  }

  /**
   * Register a route shortcut
   */
  public get(path: string, handler: RouteHandler): this {
    this.router.get(path, handler);
    return this;
  }

  public post(path: string, handler: RouteHandler): this {
    this.router.post(path, handler);
    return this;
  }

  public put(path: string, handler: RouteHandler): this {
    this.router.put(path, handler);
    return this;
  }

  public delete(path: string, handler: RouteHandler): this {
    this.router.delete(path, handler);
    return this;
  }

  public patch(path: string, handler: RouteHandler): this {
    this.router.patch(path, handler);
    return this;
  }

  public optionsMethod(path: string, handler: RouteHandler): this {
    this.router.options(path, handler);
    return this;
  }

  public all(path: string, handler: RouteHandler): this {
    this.router.all(path, handler);
    return this;
  }

  public use(middleware: MiddlewareHandler): this {
    this.router.use(middleware);
    return this;
  }

  /**
   * Register a custom handler for incoming WebSocket frames
   */
  public onWebSocketMessage(handler: WebSocketMessageHandler): this {
    this.wsMessageHandlers.push(handler);
    return this;
  }

  /**
   * Serve static files from a local directory with strict path-traversal confinement
   */
  public serveStatic(urlPrefix: string, directory: string, options: StaticServeOptions = {}): this {
    const rootDir = resolve(directory);
    const normalizedPrefix = urlPrefix === '/' ? '' : `/${urlPrefix.replace(/^\/+|\/+$/g, '')}`;
    const cacheControl = options.cacheControl ?? 'public, max-age=3600';

    const serveRelativePath = (ctx: CentauryContext, relInput: string): Response => {
      if (relInput.includes('\0')) {
        return ctx.errorResponse('Forbidden', 403, 'Null byte in static asset path is not permitted');
      }

      let decoded = relInput;
      try {
        decoded = decodeURIComponent(relInput);
      } catch {
        return ctx.errorResponse('Bad Request', 400, 'Malformed URI encoding in asset path');
      }

      const cleanRel = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
      const segments = cleanRel.split('/').filter(Boolean);
      if (segments.some((s) => s === '..')) {
        return ctx.errorResponse('Forbidden', 403, 'Path traversal outside static directory is not permitted');
      }

      const targetRel = segments.length === 0 ? 'index.html' : segments.join('/');
      let resolved = resolve(rootDir, targetRel);
      if (resolved !== rootDir && !resolved.startsWith(rootDir + sep)) {
        return ctx.errorResponse('Forbidden', 403, 'Path traversal outside static directory is not permitted');
      }

      try {
        let stats = statSync(resolved);
        if (stats.isDirectory()) {
          resolved = resolve(resolved, 'index.html');
          stats = statSync(resolved);
        }
        if (!stats.isFile()) {
          return ctx.errorResponse('Not Found', 404, `Static asset '${targetRel}' not found`);
        }
      } catch {
        return ctx.errorResponse('Not Found', 404, `Static asset '${targetRel}' not found`);
      }

      const ext = extname(resolved).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      return new Response(Bun.file(resolved), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
        },
      });
    };

    const wildcardRoute = normalizedPrefix ? `${normalizedPrefix}/*` : '/*';
    this.router.get(wildcardRoute, (ctx) => serveRelativePath(ctx, ctx.params['*'] ?? ''));

    const indexRoute = normalizedPrefix || '/';
    if (!this.router.match('GET', indexRoute)) {
      this.router.get(indexRoute, (ctx) => serveRelativePath(ctx, 'index.html'));
    }

    return this;
  }

  /**
   * Install a Centaury plugin
   */
  public usePlugin(plugin: CentauryPlugin): this {
    plugin.install(this);
    return this;
  }

  /**
   * Register an RPC procedure
   */
  public rpc<TInput, TOutput>(name: string, definition: ProcedureDefinition<TInput, TOutput>): this {
    this.rpcEngine.register(name, definition);
    return this;
  }

  /**
   * Broadcast message to all active WebSocket clients or specific topic
   */
  public broadcast(topic: string, data: unknown): void {
    const payload = JSON.stringify({ topic, data, timestamp: Date.now() });
    for (const ws of this.activeWebSockets) {
      if (ws.data.subscriptions.has(topic) || ws.data.subscriptions.has('*')) {
        ws.send(payload);
      }
    }
  }

  /**
   * Start the server instance with Bun.serve
   */
  public listen(): Server<WebSocketData> {
    const self = this;

    this.serverInstance = Bun.serve<WebSocketData>({
      port: this.options.port,
      hostname: this.options.hostname,

      async fetch(req, server) {
        const url = new URL(req.url);

        // Check for WebSocket upgrade (e.g., /api/live or /ws)
        if (url.pathname === '/api/live' || url.pathname === '/ws') {
          const sessionId = crypto.randomUUID();
          const upgraded = server.upgrade(req, {
            data: {
              sessionId,
              subscriptions: new Set(['*']),
              connectedAt: Date.now(),
            },
          });
          if (upgraded) return undefined;
        }

        // Create unified CentauryContext
        const ctx = new CentauryContext({
          req,
          serverState: self.serverState,
        });

        // Handle via Router
        return await self.router.handle(ctx);
      },

      websocket: {
        open(ws) {
          self.activeWebSockets.add(ws);
          ws.send(
            JSON.stringify({
              type: 'system.connect',
              sessionId: ws.data.sessionId,
              engine: CENTAURY_ENGINE_LABEL,
              serverTime: Date.now(),
            })
          );
        },
        message(ws, message) {
          let parsed: Record<string, unknown> | null = null;
          if (typeof message === 'string') {
            try {
              parsed = JSON.parse(message) as Record<string, unknown>;
              if (parsed?.type === 'subscribe' && typeof parsed.topic === 'string') {
                ws.data.subscriptions.add(parsed.topic);
                ws.send(JSON.stringify({ type: 'subscribed', topic: parsed.topic }));
              }
            } catch {
              parsed = null;
            }
          }
          for (const handler of self.wsMessageHandlers) {
            try {
              handler(ws, parsed, message);
            } catch {
              // Keep live socket active if user handler throws
            }
          }
        },
        close(ws) {
          self.activeWebSockets.delete(ws);
        },
      },
    });

    return this.serverInstance;
  }

  /**
   * Gracefully stop the server
   */
  public stop(): void {
    if (this.serverInstance) {
      this.serverInstance.stop(true);
      this.serverInstance = null;
    }
  }

  public get port(): number {
    return this.serverInstance?.port ?? this.options.port ?? 3000;
  }
}
