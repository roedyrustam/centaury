/**
 * @file elements.ts
 * @description Standard Web Components for Centaury Zero-Hydration Client
 */

import { signal, Signal } from './signal';
import { scanAndBind } from './dom';

/**
 * <c-stream url="/api/live" topic="analytics">
 * Connects to live stream and automatically updates [data-bind] children
 */
export class CentauryStreamElement extends HTMLElement {
  private ws: WebSocket | null = null;
  private signalStore: Record<string, Signal<unknown>> = {};
  private unbindAll: (() => void) | null = null;

  static get observedAttributes() {
    return ['url', 'topic'];
  }

  connectedCallback() {
    this.connect();
    this.bindChildren();
  }

  disconnectedCallback() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.unbindAll) {
      this.unbindAll();
      this.unbindAll = null;
    }
  }

  private connect() {
    const urlAttr = this.getAttribute('url') || '/api/live';
    const topic = this.getAttribute('topic');

    // Resolve relative URL to absolute ws:// or wss://
    let wsUrl = urlAttr;
    if (typeof window !== 'undefined' && (urlAttr.startsWith('/') || !urlAttr.includes('://'))) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${proto}//${window.location.host}${urlAttr.startsWith('/') ? '' : '/'}${urlAttr}`;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        if (topic) {
          this.ws?.send(JSON.stringify({ type: 'subscribe', topic }));
        }
        this.dispatchEvent(new CustomEvent('stream:connected', { detail: { url: wsUrl } }));
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.handleIncomingData(parsed);
        } catch {
          // ignore non-json
        }
      };

      this.ws.onerror = (err) => {
        this.dispatchEvent(new CustomEvent('stream:error', { detail: { error: err } }));
      };
    } catch (e) {
      // In non-browser environments or network failures
    }
  }

  private handleIncomingData(data: Record<string, unknown>) {
    // If incoming message has a nested payload or is a flat object
    const payload = (data.data as Record<string, unknown>) || data;

    for (const [key, value] of Object.entries(payload)) {
      if (!this.signalStore[key]) {
        this.signalStore[key] = signal(value);
        // Re-bind to capture any new data keys
        if (this.unbindAll) this.unbindAll();
        this.bindChildren();
      } else {
        this.signalStore[key].value = value;
      }
    }

    this.dispatchEvent(new CustomEvent('stream:data', { detail: payload }));
  }

  private bindChildren() {
    this.unbindAll = scanAndBind(this, this.signalStore);
  }

  /**
   * Access an internal reactive signal directly
   */
  public getSignal(key: string): Signal<unknown> | undefined {
    return this.signalStore[key];
  }
}

/**
 * <c-stack direction="row|column" gap="4">
 * High-performance layout container
 */
export class CentauryStackElement extends HTMLElement {
  connectedCallback() {
    const direction = this.getAttribute('direction') || 'column';
    const gap = this.getAttribute('gap') || '1rem';
    const align = this.getAttribute('align') || 'stretch';
    const justify = this.getAttribute('justify') || 'flex-start';

    this.style.display = 'flex';
    this.style.flexDirection = direction === 'row' ? 'row' : 'column';
    this.style.gap = gap;
    this.style.alignItems = align;
    this.style.justifyContent = justify;
  }
}

// Register custom elements when running in browser environment
export function registerCentauryElements(): void {
  if (typeof customElements !== 'undefined') {
    if (!customElements.get('c-stream')) {
      customElements.define('c-stream', CentauryStreamElement);
    }
    if (!customElements.get('c-stack')) {
      customElements.define('c-stack', CentauryStackElement);
    }
  }
}
