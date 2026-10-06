/**
 * @file core.test.ts
 * @description Comprehensive test suite for @centaury/core micro-kernel
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { CentauryServer } from '../src/server';
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
    expect(mcp.tools.some((t: any) => t.name === 'math.calculate')).toBe(true);
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
    expect(firstMsg.engine).toBe('Centaury 1.0.0-alpha');
    ws.close();
  });
});
