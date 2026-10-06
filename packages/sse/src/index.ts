/**
 * @file index.ts
 * @description Public API exports for @centaury-ai/sse
 */

// Core Event Bus
export { CentauryEventBus } from './event-bus';
export type { SseEvent, TopicStats } from './event-bus';

// SSE Response Factory
export { createSseResponse, formatSseEvent } from './sse-handler';
export type { SseHandlerOptions } from './sse-handler';

// Server Plugin
export { ssePlugin } from './sse-plugin';
export type { SsePluginOptions } from './sse-plugin';

// Browser Client
export { CentaurySSEClient } from './client';
export type { SseClientOptions, SseClientStatus } from './client';
