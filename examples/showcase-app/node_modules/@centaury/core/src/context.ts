/**
 * @file context.ts
 * @description Request context and deterministic KV-cache prefix state for Centaury Framework
 */

export interface CentauryContextInit {
  req: Request;
  params?: Record<string, string>;
  serverState?: Map<string, unknown>;
}

export class CentauryContext {
  public readonly req: Request;
  public readonly url: URL;
  public readonly method: string;
  public readonly headers: Headers;
  public readonly params: Record<string, string>;
  public readonly state: Map<string, unknown>;
  
  // Deterministic KV-cache tracker for Gemini 4 Pro / Project Astra
  private _kvCachePrefixTokens: string[] = [];

  constructor(init: CentauryContextInit) {
    this.req = init.req;
    this.url = new URL(init.req.url);
    this.method = init.req.method;
    this.headers = init.req.headers;
    this.params = init.params ?? {};
    this.state = new Map(init.serverState ?? []);
  }

  /**
   * Get parsed JSON body safely
   */
  public async json<T = unknown>(): Promise<T> {
    try {
      return (await this.req.json()) as T;
    } catch {
      throw new Error('Invalid JSON payload');
    }
  }

  /**
   * Register a deterministic prompt/context prefix for LLM KV caching
   */
  public registerKVCachePrefix(tokenBlock: string): void {
    this._kvCachePrefixTokens.push(tokenBlock);
  }

  /**
   * Get the consolidated deterministic KV cache prefix string
   */
  public getConsolidatedKVCachePrefix(): string {
    return this._kvCachePrefixTokens.join('\n---\n');
  }

  /**
   * Return a standard JSON response
   */
  public jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
    return Response.json(data, {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Centaury-Engine': '1.0.0-alpha',
        ...headers,
      },
    });
  }

  /**
   * Return an SSE (Server-Sent Events) stream
   */
  public sseResponse(stream: ReadableStream<Uint8Array>, headers: HeadersInit = {}): Response {
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Centaury-Stream': 'active',
        ...headers,
      },
    });
  }

  /**
   * Return standard RFC 9457 Problem Details error response
   */
  public errorResponse(title: string, status = 500, detail?: string): Response {
    return this.jsonResponse(
      {
        type: 'https://centaury.dev/errors/' + status,
        title,
        status,
        detail,
        timestamp: new Date().toISOString(),
      },
      status,
      { 'Content-Type': 'application/problem+json' }
    );
  }
}
