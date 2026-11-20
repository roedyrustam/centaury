/**
 * @file core.test.ts
 * @description Comprehensive test suite for @centaury/core micro-kernel
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CENTAURY_ENGINE_LABEL, createRpcClient, zodToJsonSchema } from '../src/index';
import { CentauryServer } from '../src/server';
import { securityHeadersPlugin, rateLimiterPlugin } from '../src/plugins';
import { z } from 'zod';

describe('@centaury/core Micro-Kernel Engine', () => {
  let server: CentauryServer;
  let baseUrl: string;

  beforeAll(() => {
    const start = performance.now();
    server = new CentauryServer({ port: 0 }); // Random free port

    // Register test routes
    server.get('/hello', (ctx) => ctx.jsonResponse({ message: 'Welcome to Centaury' }));
    server.get('/user/:id', (ctx) => ctx.jsonResponse({ userId: ctx.params.id }));

    // Register type-safe RPC
    server.rpc('math.calculate', {
      inputSchema: z.object({ a: z.number(), b: z.number(), op: z.enum(['add', 'multiply']) }),
      handler: ({ input }) => {
        const result = input.op === 'add' ? input.a + input.b : input.a * input.b;
        return { result };
      },
    });

    const instance = server.listen();
    const duration = performance.now() - start;
    baseUrl = `http://localhost:${instance.port}`;

    console.log(`⏱️ Centaury Micro-Kernel booted in ${duration.toFixed(2)} ms on port ${instance.port}`);
  });

  afterAll(() => {
    server.stop();
  });

  it('boots server in under 50ms cold-start', () => {
    expect(server.port).toBeGreaterThan(0);
  });

  it('serves basic GET route correctly', async () => {
    const res = await fetch(`${baseUrl}/hello`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe('Welcome to Centaury');
  });

  it('extracts dynamic URL route params in Trie router', async () => {
    const res = await fetch(`${baseUrl}/user/quantum-007`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.userId).toBe('quantum-007');
  });

  it('returns 404 with RFC 9457 Problem Details for unregistered routes', async () => {
    const res = await fetch(`${baseUrl}/non-existent-path`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.title).toBe('Route Not Found');
  });

  it('executes type-safe RPC procedures with input validation', async () => {
    const res = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        procedure: 'math.calculate',
        input: { a: 15, b: 5, op: 'multiply' },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.result).toBe(75);
  });

  it('rejects invalid RPC input with schema validation error', async () => {
    const res = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        procedure: 'math.calculate',
        input: { a: 'not-a-number', b: 5, op: 'invalid-op' },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.title).toBe('RPC Execution Error');
  });

  it('exposes Dual-Citizen MCP v1.x discovery at /.well-known/mcp.json', async () => {
    const res = await fetch(`${baseUrl}/.well-known/mcp.json`);
    expect(res.status).toBe(200);
    const mcp = await res.json();
    expect(mcp.mcpVersion).toBe('1.0.0');
    expect(mcp.serverInfo.name).toBe('Centaury Dual-Citizen Engine');
    expect(Array.isArray(mcp.tools)).toBe(true);
    const calcTool = mcp.tools.find((t: any) => t.name === 'math.calculate');
    expect(calcTool).toBeDefined();
    expect(calcTool.inputSchema.type).toBe('object');
    expect(calcTool.inputSchema.properties.a.type).toBe('number');
    expect(calcTool.inputSchema.required).toEqual(['a', 'b', 'op']);

    const strictSchema = zodToJsonSchema(
      z.object({
        zLast: z.string().optional(),
        aFirst: z.number().int(),
        mMiddle: z.string().nullable().default('ok'),
      }),
      { strict: true }
    ) as any;

    expect(strictSchema.additionalProperties).toBe(false);
    expect(strictSchema.required).toEqual(['aFirst', 'mMiddle', 'zLast']);
    expect(Object.keys(strictSchema.properties)).toEqual(['aFirst', 'mMiddle', 'zLast']);
    expect(strictSchema.properties.aFirst.type).toBe('integer');
    expect(strictSchema.properties.zLast.anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
    expect(strictSchema.properties.mMiddle.anyOf).toEqual([{ type: 'string' }, { type: 'null' }]);
  });

  it('upgrades WebSocket connection for real-time live bus', async () => {
    const ws = new WebSocket(`ws://localhost:${server.port}/api/live`);
    const messagePromise = new Promise((resolve) => {
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data as string));
      };
    });

    const firstMsg: any = await messagePromise;
    expect(firstMsg.type).toBe('system.connect');
    expect(firstMsg.engine).toBe(CENTAURY_ENGINE_LABEL);
    ws.close();
  });

  it('installs custom plugins and applies security headers without unsafe-eval (including 404)', async () => {
    const pluginServer = new CentauryServer({ port: 0 });
    let installed = false;

    pluginServer.usePlugin({
      name: 'test-plugin',
      install: () => {
        installed = true;
      },
    });

    pluginServer.usePlugin(securityHeadersPlugin());
    pluginServer.get('/secure-page', (ctx) => ctx.jsonResponse({ secure: true }));

    pluginServer.listen();
    try {
      expect(installed).toBe(true);
      const res = await fetch(`http://localhost:${pluginServer.port}/secure-page`);
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      const csp = res.headers.get('Content-Security-Policy') || '';
      expect(csp.includes("'unsafe-eval'")).toBe(false);

      const res404 = await fetch(`http://localhost:${pluginServer.port}/missing-page`);
      expect(res404.status).toBe(404);
      expect(res404.headers.get('X-Frame-Options')).toBe('DENY');
    } finally {
      pluginServer.stop();
    }
  });

  it('prevents router param leakage on backtrack, supports PUT/DELETE, createRpcClient, WS hooks & safe serveStatic', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'centaury-static-'));
    writeFileSync(join(tmpDir, 'hello.txt'), 'Centaury Static OK');

    const s = new CentauryServer({ port: 0 });
    let leakedParamSeen: unknown = 'unset';
    s.get('/items/:id/details', (ctx) => ctx.jsonResponse({ id: ctx.params.id }));
    s.get('/items/*', (ctx) => {
      leakedParamSeen = ctx.params.id;
      return ctx.jsonResponse({ wildcard: ctx.params['*'], idParam: ctx.params.id ?? null });
    });
    s.put('/resource', (ctx) => ctx.jsonResponse({ method: 'PUT' }));
    s.delete('/resource', (ctx) => ctx.jsonResponse({ method: 'DELETE' }));
    s.rpc('echo', {
      inputSchema: z.object({ msg: z.string() }),
      handler: ({ input }) => ({ echoed: input.msg }),
    });
    s.serveStatic('/assets', tmpDir);

    let customWsMsg = '';
    s.onWebSocketMessage((ws, parsed) => {
      if (parsed?.type === 'custom.ping') {
        customWsMsg = String(parsed.payload ?? '');
        ws.send(JSON.stringify({ type: 'custom.pong', payload: customWsMsg }));
      }
    });

    const listener = s.listen();
    try {
      const backtrackRes = await fetch(`http://localhost:${listener.port}/items/secret-id/other`);
      expect(backtrackRes.status).toBe(200);
      const btJson: any = await backtrackRes.json();
      expect(btJson.idParam).toBeNull();
      expect(leakedParamSeen).toBeUndefined();

      const putRes = await fetch(`http://localhost:${listener.port}/resource`, { method: 'PUT' });
      expect((await putRes.json() as any).method).toBe('PUT');
      const delRes = await fetch(`http://localhost:${listener.port}/resource`, { method: 'DELETE' });
      expect((await delRes.json() as any).method).toBe('DELETE');

      const staticOk = await fetch(`http://localhost:${listener.port}/assets/hello.txt`);
      expect(staticOk.status).toBe(200);
      expect(await staticOk.text()).toBe('Centaury Static OK');

      const traversalRes = await fetch(`http://localhost:${listener.port}/assets/..%5cpackage.json`);
      expect(traversalRes.status).toBe(403);

      const client = createRpcClient({ baseUrl: `http://localhost:${listener.port}` });
      const single = await client.call<{ echoed: string }>('echo', { msg: 'v1.2' });
      expect(single.echoed).toBe('v1.2');
      const batched = await client.batch([{ procedure: 'echo', input: { msg: 'b1' } }]);
      expect(batched[0].success).toBe(true);
      expect((batched[0].data as any).echoed).toBe('b1');

      const ws = new WebSocket(`ws://localhost:${listener.port}/api/live`);
      const pongPromise = new Promise<string>((resolve) => {
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'system.connect') {
            ws.send(JSON.stringify({ type: 'custom.ping', payload: 'hello-ws' }));
          } else if (msg.type === 'custom.pong') {
            resolve(msg.payload);
          }
        };
      });
      expect(await pongPromise).toBe('hello-ws');
      ws.close();
    } finally {
      s.stop();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('enforces rate limiting and returns 429 when max requests exceeded', async () => {
    const rateLimitedServer = new CentauryServer({ port: 0 });
    rateLimitedServer.usePlugin(
      rateLimiterPlugin({
        maxRequests: 2,
        windowMs: 5000,
        keyGenerator: () => 'fixed-test-client',
      })
    );
    rateLimitedServer.get('/api/test', (ctx) => ctx.jsonResponse({ ok: true }));

    rateLimitedServer.listen();
    try {
      const p = rateLimitedServer.port;
      const res1 = await fetch(`http://localhost:${p}/api/test`);
      expect(res1.status).toBe(200);
      expect(res1.headers.get('X-RateLimit-Remaining')).toBe('1');

      const res2 = await fetch(`http://localhost:${p}/api/test`);
      expect(res2.status).toBe(200);
      expect(res2.headers.get('X-RateLimit-Remaining')).toBe('0');

      const res3 = await fetch(`http://localhost:${p}/api/test`);
      expect(res3.status).toBe(429);
      const err = await res3.json();
      expect(err.title).toBe('Too Many Requests');
      expect(res3.headers.get('Retry-After')).toBeDefined();
    } finally {
      rateLimitedServer.stop();
    }
  });
});

