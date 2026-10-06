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
export function registerEphemeralComponents(): void {
  if (typeof customElements === 'undefined') return;

  if (!customElements.get('c-ephemeral')) {
    customElements.define('c-ephemeral', CentauryEphemeralElement);
  }

  // Register pre-styled ephemeral primitives
  const defineTag = (tag: string, styles: string) => {
    if (!customElements.get(tag)) {
      class DynamicComponent extends HTMLElement {
        connectedCallback() {
          if (!this.shadowRoot) {
            const shadow = this.attachShadow({ mode: 'open' });
            shadow.innerHTML = `
              <style>${styles}</style>
              <slot></slot>
            `;
          }
        }
      }
      customElements.define(tag, DynamicComponent);
    }
  };

  defineTag(
    'ui-card',
    `:host { display: block; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(12px); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 12px; padding: 1.25rem; color: #f8fafc; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }`
  );

  defineTag(
    'ui-header',
    `:host { display: flex; align-items: center; justify-content: space-between; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.75rem; color: #38bdf8; }`
  );

  defineTag(
    'ui-metric',
    `:host { display: flex; align-items: baseline; gap: 0.5rem; font-size: 1.75rem; font-weight: 700; color: #ffffff; }`
  );

  defineTag(
    'ui-button',
    `:host { display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0ea5e9, #6366f1); color: #fff; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 500; cursor: pointer; user-select: none; transition: transform 0.15s ease; } :host(:hover) { transform: scale(1.02); } :host(:active) { transform: scale(0.98); }`
  );

  defineTag(
    'ui-badge',
    `:host { display: inline-block; padding: 0.2rem 0.5rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; border-radius: 9999px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }`
  );

  defineTag(
    'ui-alert',
    `:host { display: block; padding: 0.75rem 1rem; border-radius: 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; font-size: 0.9rem; margin-top: 0.5rem; }`
  );
}
