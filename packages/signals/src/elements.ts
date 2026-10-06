/**
 * @file elements.ts
 * @description Standard Web Components for Centaury Zero-Hydration Client
 */

import { signal, Signal, getRegisteredSignals } from './signal';
import { scanAndBind } from './dom';

const BaseElement = typeof globalThis.HTMLElement !== 'undefined'
  ? globalThis.HTMLElement
  : (class {} as unknown as typeof HTMLElement);


/**
 * <c-stream url="/api/live" topic="analytics">
 * Connects to live stream and automatically updates [data-bind] children
 */
export class CentauryStreamElement extends BaseElement {
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
export class CentauryStackElement extends BaseElement {
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

/**
 * <c-devtools>
 * Floating cybernetic devtools HUD for inspecting signals and runtime state
 */
export class CentauryDevtoolsElement extends BaseElement {
  public isOpen = false;
  private panel: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private updateTimer: unknown = null;

  connectedCallback() {
    this.render();
    this.setupListeners();
  }

  disconnectedCallback() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer as any);
      this.updateTimer = null;
    }
  }

  private render() {
    this.style.position = 'fixed';
    this.style.bottom = '1.25rem';
    this.style.right = '1.25rem';
    this.style.zIndex = '999999';
    this.style.fontFamily = 'monospace';

    // Toggle button
    const doc = this.ownerDocument || document;
    this.toggleBtn = doc.createElement('button');
    this.toggleBtn.className = 'centaury-devtools-toggle';
    this.toggleBtn.innerHTML = '⚡ Centaury Devtools';
    this.toggleBtn.style.background = 'linear-gradient(135deg, #0ea5e9, #6366f1)';
    this.toggleBtn.style.color = '#fff';
    this.toggleBtn.style.border = '1px solid rgba(56, 189, 248, 0.5)';
    this.toggleBtn.style.borderRadius = '9999px';
    this.toggleBtn.style.padding = '8px 16px';
    this.toggleBtn.style.fontSize = '12px';
    this.toggleBtn.style.fontWeight = '700';
    this.toggleBtn.style.cursor = 'pointer';
    this.toggleBtn.style.boxShadow = '0 8px 24px rgba(14, 165, 233, 0.4)';
    this.toggleBtn.onclick = () => this.toggle();

    // Floating Panel
    this.panel = doc.createElement('div');
    this.panel.className = 'centaury-devtools-panel';
    this.panel.style.display = 'none';
    this.panel.style.position = 'absolute';
    this.panel.style.bottom = '44px';
    this.panel.style.right = '0';
    this.panel.style.width = '340px';
    this.panel.style.maxHeight = '420px';
    this.panel.style.overflowY = 'auto';
    this.panel.style.background = 'rgba(5, 7, 17, 0.95)';
    this.panel.style.border = '1px solid rgba(56, 189, 248, 0.3)';
    this.panel.style.borderRadius = '12px';
    this.panel.style.padding = '1rem';
    this.panel.style.color = '#e2e8f0';
    this.panel.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.8)';

    this.appendChild(this.panel);
    this.appendChild(this.toggleBtn);
  }

  public toggle() {
    this.isOpen = !this.isOpen;
    if (this.panel) {
      this.panel.style.display = this.isOpen ? 'block' : 'none';
      if (this.isOpen) {
        this.updateContent();
        this.updateTimer = setInterval(() => this.updateContent(), 1000);
      } else if (this.updateTimer) {
        clearInterval(this.updateTimer as any);
        this.updateTimer = null;
      }
    }
  }

  public updateContent() {
    if (!this.panel) return;
    const signals = getRegisteredSignals();
    let signalsHtml = '';
    for (const [name, sig] of signals.entries()) {
      const val = JSON.stringify(sig.peek());
      signalsHtml += `<div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:11px; padding:4px 6px; background:rgba(255,255,255,0.03); border-radius:4px;"><span style="color:#38bdf8;">${name}:</span><span style="color:#a7f3d0; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${val}</span></div>`;
    }

    this.panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px; margin-bottom:10px;">
        <span style="font-weight:700; color:#38bdf8; font-size:12px;">🌌 Centaury Devtools</span>
        <span style="font-size:10px; color:#94a3b8;">Zero-Hydration</span>
      </div>
      <div style="font-size:11px; margin-bottom:8px; color:#cbd5e1;">
        <strong>Registered Signals:</strong> ${signals.size}
      </div>
      <div style="max-height:220px; overflow-y:auto; margin-bottom:10px;">
        ${signalsHtml || '<div style="font-size:11px; color:#64748b;">No named signals registered</div>'}
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:8px; font-size:10px; color:#64748b; display:flex; justify-content:space-between;">
        <span>Runtime: Optimal</span>
        <span>Click toggle to close</span>
      </div>
    `;
  }

  private setupListeners() {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.toggle();
        }
      });
    }
  }
}

// Register custom elements when running in browser environment or happy-dom
export function registerCentauryElements(registry?: CustomElementRegistry): void {
  const reg = registry || (typeof customElements !== 'undefined' ? customElements : undefined);
  if (reg) {
    if (!reg.get('c-stream')) {
      reg.define('c-stream', CentauryStreamElement);
    }
    if (!reg.get('c-stack')) {
      reg.define('c-stack', CentauryStackElement);
    }
    if (!reg.get('c-devtools')) {
      reg.define('c-devtools', CentauryDevtoolsElement);
    }
  }
}


