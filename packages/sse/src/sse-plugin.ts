/**
 * @file sse-plugin.ts
 * @description Centaury SSE Plugin — mounts the Event Bus onto a CentauryServer instance,
 * registers the /sse/:topic streaming endpoint, and exposes bus lifecycle management APIs.
 *
 * Usage:
 *   import { ssePlugin, CentauryEventBus } from '@centaury-ai/sse';
 *
 *   const bus = new CentauryEventBus();
 *   app.usePlugin(ssePlugin(bus));
 *
 *   // Publish from anywhere in your server code:
 *   bus.publish('orders', { data: { id: 'ord_123', status: 'filled' } });
 */

import type { CentauryPlugin, CentauryServer } from '@centaury-ai/core';
import { CentauryEventBus } from './event-bus';
import { createSseResponse } from './sse-handler';

export interface SsePluginOptions {
  /** Base path for the SSE endpoint. Default: '/sse' */
  basePath?: string;
  /** Default client reconnect interval in ms. Default: 3000 */
  retryMs?: number;
  /** Replay buffered history to reconnecting clients. Default: true */
  replayHistory?: boolean;
  /** Heartbeat interval in ms. 0 to disable. Default: 15000 */
  heartbeatMs?: number;
  /** Size of per-topic history ring-buffer. Default: 100 */
  historyLimit?: number;
}

/**
 * Create and install the Centaury SSE Event Bus plugin.
 * Registers two endpoints:
 *   GET {basePath}/:topic  — subscribe to a topic stream
 *   GET {basePath}         — subscribe to all topics via wildcard
 *   GET {basePath}/_stats  — JSON diagnostics for all topics
 */
export function ssePlugin(bus: CentauryEventBus, options: SsePluginOptions = {}): CentauryPlugin {
  const basePath = options.basePath ?? '/sse';
  const retryMs = options.retryMs ?? 3000;
  const replayHistory = options.replayHistory !== false;
  const heartbeatMs = options.heartbeatMs ?? 15_000;

  return {
    name: 'centaury:sse',
    version: '1.0.0-alpha',
    install(server: CentauryServer) {
      // 1. Topic-specific SSE endpoint: GET /sse/:topic
      server.get(`${basePath}/:topic`, (ctx) => {
        const topic = ctx.params.topic ?? '*';
        return createSseResponse(ctx, bus, {
          topics: [topic],
          retryMs,
          replayHistory,
          heartbeatMs,
        });
      });

      // 2. Wildcard SSE endpoint: GET /sse (all topics)
      server.get(basePath, (ctx) => {
        return createSseResponse(ctx, bus, {
          topics: ['*'],
          retryMs,
          replayHistory,
          heartbeatMs,
        });
      });

      // 3. Diagnostics endpoint: GET /sse/_stats
      server.get(`${basePath}/_stats`, (ctx) => {
        return ctx.jsonResponse({
          engine: 'Centaury SSE Event Bus 1.0.0-alpha',
          uptime: process.uptime(),
          totalEvents: bus.totalEvents,
          topicCount: bus.topicCount,
          topics: bus.getStats(),
        });
      });
    },
  };
}
