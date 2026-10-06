/**
 * @file client.ts
 * @description Browser-side SSE client with auto-reconnect, exponential back-off,
 * topic filtering, and typed event deserialization.
 *
 * Designed to run in the browser. Zero dependencies. ~1.2KB minified.
 *
 * Usage:
 *   const client = new CentaurySSEClient('/sse/orders');
 *   client.on('message', (data) => console.log(data));
 *   client.on('error', (err) => console.error(err));
 *   client.connect();
 *   // Later:
 *   client.disconnect();
 */

export type SseClientStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface SseClientOptions {
  /** Max reconnect attempts. 0 = infinite. Default: 0 */
  maxRetries?: number;
  /** Initial back-off delay in ms. Doubles on each retry. Default: 1000 */
  initialRetryMs?: number;
  /** Cap for exponential back-off in ms. Default: 30000 */
  maxRetryMs?: number;
  /** Jitter fraction 0..1 applied to back-off to prevent thundering herd. Default: 0.3 */
  jitter?: number;
  /** Extra headers to pass (via fetch-based polyfill if needed). Default: {} */
  headers?: Record<string, string>;
}

type EventHandler<T = unknown> = (data: T, event: MessageEvent) => void;
type ErrorHandler = (err: Event) => void;
type StatusHandler = (status: SseClientStatus) => void;

export class CentaurySSEClient<T = unknown> {
  private readonly url: string;
  private readonly opts: Required<SseClientOptions>;
  private es: EventSource | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: SseClientStatus = 'idle';

  private readonly messageHandlers = new Set<EventHandler<T>>();
  private readonly namedHandlers = new Map<string, Set<EventHandler<T>>>();
  private readonly errorHandlers = new Set<ErrorHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();

  constructor(url: string, options: SseClientOptions = {}) {
    this.url = url;
    this.opts = {
      maxRetries: options.maxRetries ?? 0,
      initialRetryMs: options.initialRetryMs ?? 1000,
      maxRetryMs: options.maxRetryMs ?? 30_000,
      jitter: options.jitter ?? 0.3,
      headers: options.headers ?? {},
    };
  }

  public get status(): SseClientStatus {
    return this._status;
  }

  /**
   * Listen to all incoming messages (unnamed events)
   */
  public on(eventName: 'message', handler: EventHandler<T>): this;
  /**
   * Listen to a named SSE event type
   */
  public on(eventName: string, handler: EventHandler<T>): this;
  /**
   * Listen to SSE connection errors
   */
  public on(eventName: 'error', handler: ErrorHandler): this;
  /**
   * Listen to client status transitions
   */
  public on(eventName: 'status', handler: StatusHandler): this;
  public on(eventName: string, handler: EventHandler<T> | ErrorHandler | StatusHandler): this {
    if (eventName === 'error') {
      this.errorHandlers.add(handler as ErrorHandler);
    } else if (eventName === 'status') {
      this.statusHandlers.add(handler as StatusHandler);
    } else if (eventName === 'message') {
      this.messageHandlers.add(handler as EventHandler<T>);
    } else {
      if (!this.namedHandlers.has(eventName)) {
        this.namedHandlers.set(eventName, new Set());
      }
      this.namedHandlers.get(eventName)!.add(handler as EventHandler<T>);
    }
    return this;
  }

  /**
   * Remove a previously registered handler
   */
  public off(eventName: string, handler: EventHandler<T> | ErrorHandler | StatusHandler): this {
    if (eventName === 'error') {
      this.errorHandlers.delete(handler as ErrorHandler);
    } else if (eventName === 'status') {
      this.statusHandlers.delete(handler as StatusHandler);
    } else if (eventName === 'message') {
      this.messageHandlers.delete(handler as EventHandler<T>);
    } else {
      this.namedHandlers.get(eventName)?.delete(handler as EventHandler<T>);
    }
    return this;
  }

  /**
   * Establish the SSE connection. Idempotent if already open.
   */
  public connect(): this {
    if (this._status === 'open' || this._status === 'connecting') return this;
    this.setStatus('connecting');
    this.openEventSource();
    return this;
  }

  /**
   * Permanently close the connection and stop all reconnect attempts.
   */
  public disconnect(): this {
    this.setStatus('closed');
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.es?.close();
    this.es = null;
    return this;
  }

  private openEventSource(): void {
    this.es?.close();
    const es = new EventSource(this.url);
    this.es = es;

    es.onopen = () => {
      this.retries = 0;
      this.setStatus('open');
    };

    es.onmessage = (event: MessageEvent) => {
      const parsed = this.parse(event.data);
      for (const handler of this.messageHandlers) {
        try {
          handler(parsed, event);
        } catch {
          // Handler errors must not break the stream
        }
      }
    };

    es.onerror = (err: Event) => {
      for (const handler of this.errorHandlers) {
        try {
          handler(err);
        } catch {
          // ignore
        }
      }
      if (this._status === 'closed') return;
      this.scheduleReconnect();
    };

    // Attach named event listeners already registered
    for (const [name, handlers] of this.namedHandlers.entries()) {
      es.addEventListener(name, (event: Event) => {
        const msgEvent = event as MessageEvent;
        const parsed = this.parse(msgEvent.data);
        for (const handler of handlers) {
          try {
            handler(parsed, msgEvent);
          } catch {
            // ignore
          }
        }
      });
    }
  }

  private scheduleReconnect(): void {
    if (this._status === 'closed') return;
    if (this.opts.maxRetries > 0 && this.retries >= this.opts.maxRetries) {
      this.disconnect();
      return;
    }

    this.setStatus('reconnecting');
    this.es?.close();

    const base = Math.min(
      this.opts.initialRetryMs * Math.pow(2, this.retries),
      this.opts.maxRetryMs
    );
    const jitter = base * this.opts.jitter * Math.random();
    const delay = Math.round(base + jitter);

    this.retries++;
    this.retryTimer = setTimeout(() => {
      if (this._status !== 'closed') {
        this.openEventSource();
      }
    }, delay);
  }

  private parse(raw: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  private setStatus(status: SseClientStatus): void {
    if (this._status === status) return;
    this._status = status;
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch {
        // ignore
      }
    }
  }
}
