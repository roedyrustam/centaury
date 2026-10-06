/**
 * @file sse-handler.ts
 * @description Native Bun SSE stream handler — formats events to text/event-stream protocol
 * and integrates with CentauryEventBus for reactive topic delivery.
 *
 * RFC 8895 SSE Wire Format:
 *   id: <event-id>\n
 *   event: <event-type>\n
 *   data: <json-payload>\n
 *   retry: <ms>\n
 *   \n
 */

import type { CentauryContext } from '@centaury-ai/core';
import { CentauryEventBus, type SseEvent } from './event-bus';

export interface SseHandlerOptions {
  /** Topics to subscribe to on connection. Defaults to ['*'] (all topics). */
  topics?: string[];
  /** Client reconnect interval in ms. Sent as SSE `retry` field. Default: 3000 */
  retryMs?: number;
  /** Whether to replay buffered history to late-joining clients. Default: true */
  replayHistory?: boolean;
  /** Last-Event-ID to replay from (read from request header if not provided) */
  sinceId?: string;
  /** Heartbeat ping interval in ms. 0 disables. Default: 15000 */
  heartbeatMs?: number;
}

/**
 * Format a single SseEvent object to the SSE wire protocol string.
 */
export function formatSseEvent(event: SseEvent): string {
  const parts: string[] = [];

  if (event.id !== undefined) {
    parts.push(`id: ${event.id}`);
  }
  if (event.event !== undefined) {
    parts.push(`event: ${event.event}`);
  }

  const dataStr = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
  // Each line of multi-line data must be prefixed with "data: "
  for (const line of dataStr.split('\n')) {
    parts.push(`data: ${line}`);
  }

  if (event.retry !== undefined) {
    parts.push(`retry: ${event.retry}`);
  }

  // SSE message is terminated by two newlines
  return parts.join('\n') + '\n\n';
}

/**
 * Create a native Bun SSE response that streams real-time events from the EventBus.
 * The returned Response uses a ReadableStream driven entirely by Bun's native I/O.
 */
export function createSseResponse(
  ctx: CentauryContext,
  bus: CentauryEventBus,
  options: SseHandlerOptions = {}
): Response {
  const topics = options.topics ?? ['*'];
  const retryMs = options.retryMs ?? 3000;
  const replayHistory = options.replayHistory !== false;
  const heartbeatMs = options.heartbeatMs ?? 15_000;

  // Read Last-Event-ID from header for client-side auto-reconnect replay
  const lastEventId =
    options.sinceId ??
    ctx.req.headers.get('last-event-id') ??
    ctx.req.headers.get('Last-Event-Id') ??
    undefined;

  const encoder = new TextEncoder();
  const unsubscribeFns: Array<() => void> = [];
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (event: SseEvent) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        } catch {
          // Stream has been closed (client disconnected) — silently drop
        }
      };

      // 1. Send initial retry directive so client knows reconnect interval
      try {
        controller.enqueue(encoder.encode(`retry: ${retryMs}\n\n`));
      } catch {
        return;
      }

      // 2. Replay buffered history for late-join recovery
      if (replayHistory) {
        for (const topic of topics) {
          bus.replayHistory(topic, enqueue, lastEventId);
        }
      }

      // 3. Subscribe to live events for each requested topic
      for (const topic of topics) {
        const unsub = bus.subscribe(topic, enqueue);
        unsubscribeFns.push(unsub);
      }

      // 4. Heartbeat: emit a comment line (":\n\n") to keep connection alive
      //    through proxies and load balancers that close idle connections
      if (heartbeatMs > 0) {
        heartbeatTimer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          } catch {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
          }
        }, heartbeatMs);
      }
    },

    cancel() {
      // Client disconnected — clean up all subscriptions and timers
      for (const unsub of unsubscribeFns) unsub();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx proxy buffering
      'X-Centaury-SSE': '1.0.0-alpha',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
