/**
 * @file inspector.ts
 * @description Live AST & Schema Reflector for Centaury Dual-Citizen Agent Engine
 */

import type { CentauryServer } from '@centaury/core';

export interface RouteMetadata {
  method: string;
  path: string;
}

export interface RPCMetadata {
  name: string;
  description?: string;
  hasInputSchema: boolean;
}

export interface SystemSnapshot {
  engine: string;
  runtime: string;
  uptime: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
  routesCount: number;
  rpcCount: number;
}

export class CentauryInspector {
  private logRingBuffer: string[] = [];
  private maxLogs: number;

  constructor(maxLogs = 200) {
    this.maxLogs = maxLogs;
  }

  /**
   * Log an internal event into the ring buffer for agent inspection
   */
  public log(entry: string): void {
    const timestamp = new Date().toISOString();
    this.logRingBuffer.push(`[${timestamp}] ${entry}`);
    if (this.logRingBuffer.length > this.maxLogs) {
      this.logRingBuffer.shift();
    }
  }

  /**
   * Retrieve recent logs
   */
  public getLogs(limit = 50): string[] {
    return this.logRingBuffer.slice(-limit);
  }

  /**
   * Inspect all routes from CentauryServer
   */
  public inspectRoutes(server: CentauryServer): RouteMetadata[] {
    return server.router.listRoutes();
  }

  /**
   * Inspect all RPC procedures from CentauryServer
   */
  public inspectRPC(server: CentauryServer): RPCMetadata[] {
    return server.rpcEngine.getMetadata();
  }

  /**
   * Generate complete system diagnostic snapshot
   */
  public getSystemSnapshot(server: CentauryServer): SystemSnapshot {
    const mem = process.memoryUsage();
    return {
      engine: 'Centaury 1.0.0-alpha',
      runtime: `Bun ${Bun.version}`,
      uptime: process.uptime(),
      memoryUsage: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      },
      routesCount: server.router.listRoutes().length,
      rpcCount: server.rpcEngine.getMetadata().length,
    };
  }
}
