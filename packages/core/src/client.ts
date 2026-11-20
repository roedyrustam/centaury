/**
 * @file client.ts
 * @description Lightweight Type-Safe RPC Client for Centaury Framework
 */

export interface RpcClientOptions {
  /** Base server origin (e.g. 'http://localhost:3000'). Defaults to '' (same-origin). */
  baseUrl?: string;
  /** RPC dispatcher endpoint path. Defaults to '/rpc'. */
  endpoint?: string;
  /** Static headers appended to every RPC request. */
  headers?: Record<string, string>;
  /** Dynamic header resolver evaluated before each request. */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Custom fetch implementation for testing or non-global runtimes. */
  fetchImpl?: typeof fetch;
}

export interface RpcBatchCall<TInput = unknown> {
  id?: string;
  procedure: string;
  input?: TInput;
}

export interface RpcBatchResult<TOutput = unknown> {
  id: string;
  success: boolean;
  data?: TOutput;
  error?: string;
}

interface RpcResponseEnvelope<T> {
  success?: boolean;
  data?: T;
  detail?: string;
  title?: string;
  error?: string;
}

/**
 * Create a lightweight browser/server RPC client for Centaury /rpc endpoints.
 */
export function createRpcClient(options: RpcClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
  const endpoint = options.endpoint ?? '/rpc';
  const targetUrl = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const fetcher = options.fetchImpl ?? fetch;

  async function buildHeaders(): Promise<Record<string, string>> {
    const dynamicHeaders = options.getHeaders ? await options.getHeaders() : {};
    return {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
      ...dynamicHeaders,
    };
  }

  return {
    async call<TOutput = unknown, TInput = unknown>(procedure: string, input?: TInput): Promise<TOutput> {
      const res = await fetcher(targetUrl, {
        method: 'POST',
        headers: await buildHeaders(),
        body: JSON.stringify({ procedure, input }),
      });

      const body = (await res.json()) as RpcResponseEnvelope<TOutput>;
      if (!res.ok || body.success === false) {
        const message = body.detail || body.error || body.title || `RPC '${procedure}' failed with HTTP ${res.status}`;
        throw new Error(message);
      }

      return body.data as TOutput;
    },

    async batch(calls: RpcBatchCall[]): Promise<RpcBatchResult[]> {
      const normalized = calls.map((c, idx) => ({
        id: c.id ?? `call-${idx}`,
        procedure: c.procedure,
        input: c.input,
      }));

      const res = await fetcher(targetUrl, {
        method: 'POST',
        headers: await buildHeaders(),
        body: JSON.stringify(normalized),
      });

      if (!res.ok) {
        throw new Error(`Batched RPC request failed with HTTP ${res.status}`);
      }

      return (await res.json()) as RpcBatchResult[];
    },
  };
}
