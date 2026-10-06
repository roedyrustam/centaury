/**
 * @file mcp.ts
 * @description Native Model Context Protocol (MCP v1.x) Server for Centaury Dual-Citizen AI Agents
 */

import { CentauryServer, CentauryContext } from '@centaury/core';
import { CentauryInspector } from './inspector';
import { CentauryAgentMemory } from './memory';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class CentauryMCPServer {
  public readonly inspector: CentauryInspector = new CentauryInspector();
  public readonly memory: CentauryAgentMemory = new CentauryAgentMemory();
  private server: CentauryServer;

  constructor(server: CentauryServer) {
    this.server = server;
  }

  /**
   * Handle incoming MCP JSON-RPC 2.0 request
   */
  public async handleJsonRpc(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      switch (req.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {},
                prompts: {},
              },
              serverInfo: {
                name: 'Centaury Dual-Citizen MCP Server',
                version: '1.0.0-alpha',
              },
            },
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: {
              tools: [
                {
                  name: 'centaury_list_routes',
                  description: 'List all registered HTTP and WebSocket routes in Centaury',
                  inputSchema: { type: 'object', properties: {} },
                },
                {
                  name: 'centaury_get_system_snapshot',
                  description: 'Retrieve real-time memory, CPU uptime, and performance metrics',
                  inputSchema: { type: 'object', properties: {} },
                },
                {
                  name: 'centaury_invoke_rpc',
                  description: 'Execute an internal Centaury RPC procedure with type-safe parameters',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      procedure: { type: 'string', description: 'Name of the RPC procedure' },
                      input: { type: 'object', description: 'Arguments for the procedure' },
                    },
                    required: ['procedure'],
                  },
                },
                {
                  name: 'centaury_get_logs',
                  description: 'Read the recent server circular ring-buffer logs for live debugging',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      limit: { type: 'number', description: 'Number of recent log lines to fetch' },
                    },
                  },
                },
                {
                  name: 'centaury_synthesize_ui',
                  description: 'Push an Ephemeral UI token chunk directly to all connected browser clients',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      markup: { type: 'string', description: 'Declarative Ephemeral DSL component markup' },
                    },
                    required: ['markup'],
                  },
                },
              ],
            },
          };

        case 'tools/call': {
          const toolName = req.params?.name as string;
          const args = (req.params?.arguments as Record<string, unknown>) || {};
          const result = await this.executeTool(toolName, args);
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                },
              ],
            },
          };
        }

        case 'resources/list':
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: {
              resources: [
                {
                  uri: 'centaury://routes',
                  name: 'Centaury Routes Registry',
                  mimeType: 'application/json',
                },
                {
                  uri: 'centaury://system',
                  name: 'Centaury System Diagnostics',
                  mimeType: 'application/json',
                },
                {
                  uri: 'centaury://logs',
                  name: 'Centaury Live Server Logs',
                  mimeType: 'text/plain',
                },
              ],
            },
          };

        case 'resources/read': {
          const uri = req.params?.uri as string;
          const content = this.readResource(uri);
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: uri.endsWith('logs') ? 'text/plain' : 'application/json',
                  text: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
                },
              ],
            },
          };
        }

        default:
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: {
              code: -32601,
              message: `Method '${req.method}' not implemented`,
            },
          };
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: {
          code: -32603,
          message: (err as Error).message,
        },
      };
    }
  }

  private async executeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'centaury_list_routes':
        return this.inspector.inspectRoutes(this.server);

      case 'centaury_get_system_snapshot':
        return this.inspector.getSystemSnapshot(this.server);

      case 'centaury_invoke_rpc': {
        const procName = args.procedure as string;
        const dummyReq = new Request('http://localhost/rpc', {
          method: 'POST',
          body: JSON.stringify({ procedure: procName, input: args.input }),
        });
        const ctx = new CentauryContext({ req: dummyReq });
        return await this.server.rpcEngine.execute(procName, args.input, ctx);
      }

      case 'centaury_get_logs':
        return this.inspector.getLogs(Number(args.limit) || 50);

      case 'centaury_synthesize_ui': {
        const markup = args.markup as string;
        this.server.broadcast('ephemeral:chunk', { markup });
        this.inspector.log(`Ephemeral UI synthesized by AI Agent: ${markup.slice(0, 40)}...`);
        return { status: 'broadcasted', bytes: markup.length };
      }

      default:
        throw new Error(`Tool '${toolName}' not recognized`);
    }
  }

  private readResource(uri: string): unknown {
    if (uri === 'centaury://routes') {
      return this.inspector.inspectRoutes(this.server);
    }
    if (uri === 'centaury://system') {
      return this.inspector.getSystemSnapshot(this.server);
    }
    if (uri === 'centaury://logs') {
      return this.inspector.getLogs().join('\n');
    }
    throw new Error(`Resource '${uri}' not found`);
  }
}
