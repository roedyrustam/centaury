/**
 * @file agent.test.ts
 * @description Test suite for @centaury/agent MCP v1.x Server & AST Inspector
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { CentauryServer } from '@centaury/core';
import { CentauryMCPServer } from '../src/mcp';
import { CentauryAgentMemory } from '../src/memory';
import { z } from 'zod';

describe('@centaury/agent Dual-Citizen MCP v1.x & AST Reflector', () => {
  let server: CentauryServer;
  let mcp: CentauryMCPServer;

  beforeAll(() => {
    server = new CentauryServer({ port: 0 });

    server.get('/api/status', (ctx) => ctx.jsonResponse({ ok: true }));

    server.rpc('orders.create', {
      description: 'Creates a new mock order',
      inputSchema: z.object({ item: z.string(), quantity: z.number() }),
      handler: ({ input }) => {
        return { orderId: 'ord-999', item: input.item, total: input.quantity * 25 };
      },
    });

    server.listen();
    mcp = new CentauryMCPServer(server);
    mcp.inspector.log('Centaury Server initialized for testing');
  });

  afterAll(() => {
    server.stop();
  });

  it('handles MCP initialize handshake', async () => {
    const res = await mcp.handleJsonRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });

    expect(res.error).toBeUndefined();
    const result: any = res.result;
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(result.serverInfo.name).toBe('Centaury Dual-Citizen MCP Server');
    expect(result.capabilities.tools).toBeDefined();
  });

  it('lists MCP tools including AST inspection & RPC invocation', async () => {
    const res = await mcp.handleJsonRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    const result: any = res.result;
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.some((t: any) => t.name === 'centaury_list_routes')).toBe(true);
    expect(result.tools.some((t: any) => t.name === 'centaury_invoke_rpc')).toBe(true);
    expect(result.tools.some((t: any) => t.name === 'centaury_synthesize_ui')).toBe(true);
  });

  it('calls centaury_list_routes via MCP tool/call', async () => {
    const res = await mcp.handleJsonRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'centaury_list_routes',
        arguments: {},
      },
    });

    expect(res.error).toBeUndefined();
    const result: any = res.result;
    const text = result.content[0].text;
    expect(text).toContain('/api/status');
  });

  it('executes internal RPC procedure through centaury_invoke_rpc tool call', async () => {
    const res = await mcp.handleJsonRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'centaury_invoke_rpc',
        arguments: {
          procedure: 'orders.create',
          input: { item: 'Quantum Core', quantity: 2 },
        },
      },
    });

    expect(res.error).toBeUndefined();
    const result: any = res.result;
    const data = JSON.parse(result.content[0].text);
    expect(data.orderId).toBe('ord-999');
    expect(data.total).toBe(50);
  });

  it('allows agent to synthesize Ephemeral UI via centaury_synthesize_ui', async () => {
    const res = await mcp.handleJsonRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'centaury_synthesize_ui',
        arguments: {
          markup: '<ui-card><p>Agent broadcast</p></ui-card>',
        },
      },
    });

    expect(res.error).toBeUndefined();
    const logs = mcp.inspector.getLogs();
    expect(logs.some((l) => l.includes('Ephemeral UI synthesized by AI Agent'))).toBe(true);
  });

  it('exposes and reads MCP resources', async () => {
    const listRes = await mcp.handleJsonRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'resources/list',
    });
    const resources: any = listRes.result;
    expect(resources.resources.some((r: any) => r.uri === 'centaury://system')).toBe(true);

    const readRes = await mcp.handleJsonRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'resources/read',
      params: { uri: 'centaury://system' },
    });
    const contents: any = readRes.result;
    expect(contents.contents[0].text).toContain('Centaury 1.0.0-alpha');
  });

  it('manages episodic agent memory with deterministic prefix support', () => {
    const memory = new CentauryAgentMemory();
    memory.setDeterministicPrefix('SYSTEM: You are Centaury Super-Intelligent Agent.');
    expect(memory.getDeterministicPrefix()).toContain('Centaury Super-Intelligent Agent');

    memory.storeTurn({
      sessionId: 'sess-100',
      role: 'user',
      content: 'Analyze memory leak',
    });

    memory.storeTurn({
      sessionId: 'sess-100',
      role: 'agent',
      content: 'No leaks found in AST graph',
    });

    const history = memory.getSessionHistory('sess-100');
    expect(history.length).toBe(2);
    expect(history[0].content).toBe('Analyze memory leak');
    expect(history[1].role).toBe('agent');
  });
});
