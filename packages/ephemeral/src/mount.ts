/**
 * @file mount.ts
 * @description Safe DOM Mounting Engine & Custom Elements for Ephemeral UI in Centaury
 */

import { SanitizedNode } from './sanitizer';
import { EphemeralStreamParser } from './parser';

/**
 * Render a SanitizedNode AST directly to a DOM Element
 */
export function renderNodeToDOM(node: SanitizedNode | string, containerDoc?: Document): Node {
  const doc = containerDoc ?? (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('No DOM Document available for mounting');

  if (typeof node === 'string') {
    return doc.createTextNode(node);
  }

  const el = doc.createElement(node.tag);

  // Apply sanitized attributes
  for (const [key, val] of Object.entries(node.attrs)) {
    el.setAttribute(key, val);
  }

  // Handle ephemeral action dispatching
  if (node.attrs.action) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      let parsedParam: unknown = node.attrs.param;
      try {
        if (node.attrs.param) parsedParam = JSON.parse(node.attrs.param);
      } catch {
        // Keep string if not json
      }

      el.dispatchEvent(
        new CustomEvent('ephemeral:action', {
          bubbles: true,
          composed: true,
          detail: {
            action: node.attrs.action,
            param: parsedParam,
            sourceElement: el,
          },
        })
      );
    });
  }

  // Recursively render children
  for (const child of node.children) {
    el.appendChild(renderNodeToDOM(child, doc));
  }

  return el;
}

const SafeHTMLElement = typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as typeof HTMLElement);

/**
 * <c-ephemeral slot="generative-view">
 * Dynamic target for synthetic streaming components
 */
export class CentauryEphemeralElement extends SafeHTMLElement {
  private parser: EphemeralStreamParser;

  constructor() {
    super();
    this.parser = new EphemeralStreamParser((node) => {
      this.mountRootNode(node);
    });
  }

  connectedCallback() {
    this.classList.add('c-ephemeral-host');
  }

  /**
   * Feed incoming stream token chunk from WebSocket or Gemini reasoning stream
   */
  public write(chunk: string): void {
    this.parser.write(chunk);
  }

  /**
   * Clear all mounted ephemeral UI components
   */
  public clear(): void {
    this.innerHTML = '';
    this.parser.reset();
  }

  private mountRootNode(node: SanitizedNode): void {
    const domNode = renderNodeToDOM(node, this.ownerDocument);
    this.appendChild(domNode);
    this.dispatchEvent(new CustomEvent('ephemeral:mounted', { detail: { node } }));
  }
}

/**
 * Built-in styling and registration for Ephemeral DSL components
 */
export function registerEphemeralComponents(
  registry?: CustomElementRegistry,
  baseElement?: typeof HTMLElement
): void {
  const reg = registry ?? (typeof customElements !== 'undefined' ? customElements : undefined);
  const BaseHTMLElement = baseElement ?? SafeHTMLElement;
  if (!reg) return;

  if (!reg.get('c-ephemeral')) {
    reg.define('c-ephemeral', CentauryEphemeralElement);
  }

  // Register pre-styled ephemeral primitives with crisp 1px borders and attribute rendering
  const defineStaticTag = (tag: string, styles: string) => {
    if (!reg.get(tag)) {
      class DynamicComponent extends BaseHTMLElement {
        connectedCallback() {
          if (!this.shadowRoot) {
            const shadow = this.attachShadow({ mode: 'open' });
            shadow.innerHTML = `<style>${styles}</style><slot></slot>`;
          }
        }
      }
      reg.define(tag, DynamicComponent);
    }
  };

  defineStaticTag(
    'ui-card',
    `:host { display: block; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 10px; padding: 1.25rem; color: #f8fafc; box-shadow: 0 4px 16px rgba(0,0,0,0.35); }`
  );

  if (!reg.get('ui-header')) {
    class UiHeaderComponent extends BaseHTMLElement {
      static get observedAttributes() {
        return ['title', 'badge'];
      }
      connectedCallback() {
        this.renderHeader();
      }
      attributeChangedCallback() {
        this.renderHeader();
      }
      private renderHeader() {
        const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>
          :host { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; font-weight: 600; font-size: 1.05rem; margin-bottom: 0.75rem; color: #38bdf8; }
          .badge { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.15rem 0.5rem; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.35); background: rgba(56, 189, 248, 0.12); color: #7dd3fc; }
        </style>`;
        const doc = this.ownerDocument;
        const titleVal = this.getAttribute('title');
        if (titleVal) {
          const titleSpan = doc.createElement('span');
          titleSpan.textContent = titleVal;
          shadow.appendChild(titleSpan);
        }
        const slot = doc.createElement('slot');
        shadow.appendChild(slot);
        const badgeVal = this.getAttribute('badge');
        if (badgeVal) {
          const badgeSpan = doc.createElement('span');
          badgeSpan.className = 'badge';
          badgeSpan.textContent = badgeVal;
          shadow.appendChild(badgeSpan);
        }
      }
    }
    reg.define('ui-header', UiHeaderComponent);
  }

  if (!reg.get('ui-metric')) {
    class UiMetricComponent extends BaseHTMLElement {
      static get observedAttributes() {
        return ['value', 'change', 'trend'];
      }
      connectedCallback() {
        this.renderMetric();
      }
      attributeChangedCallback() {
        this.renderMetric();
      }
      private renderMetric() {
        const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>
          :host { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.5rem; font-size: 1.6rem; font-weight: 700; color: #ffffff; font-variant-numeric: tabular-nums; margin-bottom: 0.5rem; }
          .change { font-size: 0.8rem; font-weight: 600; color: #34d399; padding: 0.12rem 0.45rem; border-radius: 6px; border: 1px solid rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.1); }
        </style>`;
        const doc = this.ownerDocument;
        const val = this.getAttribute('value');
        if (val) {
          const valSpan = doc.createElement('span');
          valSpan.textContent = val;
          shadow.appendChild(valSpan);
        }
        const changeVal = this.getAttribute('change');
        if (changeVal) {
          const changeSpan = doc.createElement('span');
          changeSpan.className = 'change';
          changeSpan.textContent = changeVal;
          shadow.appendChild(changeSpan);
        }
        const slot = doc.createElement('slot');
        shadow.appendChild(slot);
      }
    }
    reg.define('ui-metric', UiMetricComponent);
  }

  defineStaticTag(
    'ui-button',
    `:host { display: inline-flex; align-items: center; justify-content: center; background: #0284c7; border: 1px solid #38bdf8; color: #ffffff; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; font-size: 0.875rem; cursor: pointer; user-select: none; transition: background 0.15s ease, transform 0.12s ease; } :host(:hover) { background: #0369a1; } :host(:active) { transform: scale(0.98); }`
  );

  defineStaticTag(
    'ui-badge',
    `:host { display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; border-radius: 6px; background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }`
  );

  defineStaticTag(
    'ui-alert',
    `:host { display: block; padding: 0.75rem 1rem; border-radius: 8px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #fecaca; font-size: 0.875rem; margin-top: 0.5rem; }`
  );
}
