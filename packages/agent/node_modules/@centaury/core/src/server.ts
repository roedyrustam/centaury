/**
 * @file server.ts
 * @description High-performance Bun HTTP & WebSocket Micro-Kernel Engine for Centaury
 */

import { CentauryContext } from './context';
import { CentauryRouter, RouteHandler, MiddlewareHandler } from './router';
import { CentauryRPC, ProcedureDefinition } from './rpc';
import type { Server, ServerWebSocket } from 'bun';

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
  private serverState = new Map<string, unknown>();

  constructor(options: CentauryServerOptions = {}) {
    this.options = {
      port: options.port ?? 3000,
      hostname: options.hostname ?? '0.0.0.0',
      staticDir: options.staticDir ?? 'public',
      cors: options.cors ?? true,
      ai: options.ai,
    };

    this.setupBuiltinRoutes();
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
        engine: 'Centaury 1.0.0-alpha',
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
          version: '1.0.0-alpha',
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
        },
        tools: this.rpcEngine.getMetadata().map((m) => ({
          name: m.name,
          description: m.description ?? `Invoke Centaury RPC procedure '${m.name}'`,
          inputSchema: { type: 'object' },
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

  public use(middleware: MiddlewareHandler): this {
    this.router.use(middleware);
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
              engine: 'Centaury 1.0.0-alpha',
              serverTime: Date.now(),
            })
          );
        },
        message(ws, message) {
          try {
            const parsed = typeof message === 'string' ? JSON.parse(message) : null;
            if (parsed?.type === 'subscribe' && typeof parsed.topic === 'string') {
              ws.data.subscriptions.add(parsed.topic);
              ws.send(JSON.stringify({ type: 'subscribed', topic: parsed.topic }));
            }
          } catch {
            // Ignore non-json socket frames
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
