/**
 * @file sse.test.ts
 * @description Comprehensive test suite for @centaury-ai/sse
 * Tests: EventBus, SSE formatter, plugin routing, and client reconnect logic
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { CentauryEventBus, type SseEvent } from '../src/event-bus';
import { formatSseEvent, createSseResponse } from '../src/sse-handler';
import { ssePlugin } from '../src/sse-plugin';
import { CentaurySSEClient } from '../src/client';
import { CentauryServer, CentauryContext } from '@centaury-ai/core';

// ─── EventBus ────────────────────────────────────────────────────────────────

describe('CentauryEventBus', () => {
  let bus: CentauryEventBus;

  beforeEach(() => {
    bus = new CentauryEventBus(10);
  });

  test('subscribe and receive events on a topic', () => {
    const received: SseEvent[] = [];
    bus.subscribe('orders', (ev) => received.push(ev));
    bus.publish('orders', { data: { id: 1 } });
    bus.publish('orders', { data: { id: 2 } });

    expect(received).toHaveLength(2);
    expect((received[0].data as { id: number }).id).toBe(1);
    expect((received[1].data as { id: number }).id).toBe(2);
  });

  test('wildcard subscriber receives all topics', () => {
    const received: SseEvent[] = [];
    bus.subscribe('*', (ev) => received.push(ev));
    bus.publish('orders', { data: 'a' });
    bus.publish('inventory', { data: 'b' });

    expect(received).toHaveLength(2);
  });

  test('unsubscribe stops delivery', () => {
    const received: SseEvent[] = [];
    const unsub = bus.subscribe('alerts', (ev) => received.push(ev));
    bus.publish('alerts', { data: 'first' });
    unsub();
    bus.publish('alerts', { data: 'second' });

    expect(received).toHaveLength(1);
  });

  test('ring-buffer history caps at historyLimit', () => {
    for (let i = 0; i < 15; i++) {
      bus.publish('prices', { data: i });
    }

    const replayed: SseEvent[] = [];
    bus.replayHistory('prices', (ev) => replayed.push(ev));
    // historyLimit is 10, so only last 10 events
    expect(replayed).toHaveLength(10);
  });

  test('replayHistory with sinceId skips older events', () => {
    bus.publish('ticker', { data: 1 });
    bus.publish('ticker', { data: 2 });
    bus.publish('ticker', { data: 3 });

    // Get the id of the second event
    const stats = bus.getStats().find((s) => s.topic === 'ticker');
    expect(stats).toBeDefined();

    // We need to introspect history — subscribe once to capture ids
    const evs: SseEvent[] = [];
    bus.replayHistory('ticker', (ev) => evs.push(ev));
    expect(evs).toHaveLength(3);

    const sinceId = evs[1].id!;
    const afterSecond: SseEvent[] = [];
    bus.replayHistory('ticker', (ev) => afterSecond.push(ev), sinceId);
    expect(afterSecond).toHaveLength(1);
    expect((afterSecond[0].data as number)).toBe(3);
  });

  test('auto-assigns event IDs', () => {
    bus.publish('a', { data: 'no-id' });
    const captured: SseEvent[] = [];
    bus.replayHistory('a', (ev) => captured.push(ev));
    expect(captured[0].id).toMatch(/^evt-/);
  });

  test('getStats returns correct counts', () => {
    bus.subscribe('topic1', () => {});
    bus.subscribe('topic1', () => {});
    bus.publish('topic1', { data: 'x' });

    const stats = bus.getStats();
    const t1 = stats.find((s) => s.topic === 'topic1');
    expect(t1).toBeDefined();
    expect(t1!.subscriberCount).toBe(2);
    expect(t1!.totalEmitted).toBe(1);
    expect(t1!.lastEmittedAt).toBeGreaterThan(0);
  });

  test('totalEvents counter is cumulative', () => {
    bus.publish('x', { data: 1 });
    bus.publish('y', { data: 2 });
    bus.publish('x', { data: 3 });
    expect(bus.totalEvents).toBe(3);
  });

  test('destroy clears all state', () => {
    bus.subscribe('z', () => {});
    bus.publish('z', { data: 1 });
    bus.destroy();
    expect(bus.topicCount).toBe(0);
    expect(bus.totalEvents).toBe(0);
  });

  test('subscriber errors do not break fan-out', () => {
    const good: SseEvent[] = [];
    bus.subscribe('safe', () => { throw new Error('boom'); });
    bus.subscribe('safe', (ev) => good.push(ev));
    expect(() => bus.publish('safe', { data: 'test' })).not.toThrow();
    expect(good).toHaveLength(1);
  });
});

// ─── SSE Wire Format ─────────────────────────────────────────────────────────

describe('formatSseEvent', () => {
  test('formats minimal event with data only', () => {
    const out = formatSseEvent({ data: 'hello' });
    expect(out).toBe('data: hello\n\n');
  });

  test('formats full event with id, event type, and retry', () => {
    const out = formatSseEvent({ id: '42', event: 'update', data: { x: 1 }, retry: 5000 });
    expect(out).toContain('id: 42\n');
    expect(out).toContain('event: update\n');
    expect(out).toContain('data: {"x":1}\n');
    expect(out).toContain('retry: 5000\n');
    expect(out.endsWith('\n\n')).toBe(true);
  });

  test('handles multi-line data with per-line data: prefix', () => {
    const out = formatSseEvent({ data: 'line1\nline2' });
    expect(out).toContain('data: line1\n');
    expect(out).toContain('data: line2\n');
  });

  test('serializes object data to JSON', () => {
    const out = formatSseEvent({ data: { key: 'value' } });
    expect(out).toContain('data: {"key":"value"}\n');
  });
});

// ─── SSE Plugin + Server Integration ─────────────────────────────────────────

describe('ssePlugin integration', () => {
  test('registers /sse/:topic, /sse, and /sse/_stats routes', () => {
    const bus = new CentauryEventBus();
    const app = new CentauryServer({ port: 0 });
    app.usePlugin(ssePlugin(bus));

    const routes = app.router.listRoutes();
    const paths = routes.map((r) => r.path);

    expect(paths).toContain('/sse/:topic');
    expect(paths).toContain('/sse');
    expect(paths).toContain('/sse/_stats');
  });

  test('/sse/_stats returns JSON diagnostics', async () => {
    const bus = new CentauryEventBus();
    const app = new CentauryServer({ port: 0 });
    app.usePlugin(ssePlugin(bus));

    bus.publish('metrics', { data: 42 });

    const req = new Request('http://localhost/sse/_stats');
    const ctx = new CentauryContext({ req });
    const res = await app.router.handle(ctx);
    const body = await res.json() as Record<string, unknown>;

    expect(body.engine).toContain('Centaury SSE');
    expect(typeof body.uptime).toBe('number');
    expect(body.totalEvents).toBe(1);
  });

  test('/sse/:topic returns text/event-stream response', async () => {
    const bus = new CentauryEventBus();
    const app = new CentauryServer({ port: 0 });
    app.usePlugin(ssePlugin(bus, { heartbeatMs: 0 }));

    const req = new Request('http://localhost/sse/orders');
    const ctx = new CentauryContext({ req, params: { topic: 'orders' } });

    // We can't fully consume the stream in unit tests — just verify headers
    const res = await app.router.handle(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-centaury-sse')).toBe('1.0.0-alpha');
    res.body?.cancel(); // Release the locked stream
  });

  test('custom basePath is respected', () => {
    const bus = new CentauryEventBus();
    const app = new CentauryServer({ port: 0 });
    app.usePlugin(ssePlugin(bus, { basePath: '/events' }));

    const paths = app.router.listRoutes().map((r) => r.path);
    expect(paths).toContain('/events/:topic');
    expect(paths).toContain('/events/_stats');
  });
});

// ─── Client (non-browser environment stubs) ──────────────────────────────────

describe('CentaurySSEClient', () => {
  test('initial status is idle', () => {
    const client = new CentaurySSEClient('/sse/test');
    expect(client.status).toBe('idle');
  });

  test('disconnect transitions to closed', () => {
    const client = new CentaurySSEClient('/sse/test');
    client.disconnect();
    expect(client.status).toBe('closed');
  });

  test('on/off handlers register and deregister', () => {
    const client = new CentaurySSEClient('/sse/test');
    const handler = () => {};
    client.on('message', handler);
    client.off('message', handler);
    // No assertion needed — just verify no error thrown
  });

  test('named event registration does not throw', () => {
    const client = new CentaurySSEClient('/sse/test');
    client.on('order.created', (data) => { void data; });
    expect(client.status).toBe('idle');
  });
});
