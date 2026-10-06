/**
 * @file dom.ts
 * @description Zero-Hydration direct DOM binding primitives for Centaury
 */

import { effect, ReadonlySignal, Signal } from './signal';

/**
 * Bind signal value directly to node textContent
 */
export function bindText(node: Node, sig: ReadonlySignal<unknown>): () => void {
  return effect(() => {
    node.textContent = String(sig.value ?? '');
  });
}

/**
 * Bind signal value directly to element attribute
 */
export function bindAttr(el: Element, attr: string, sig: ReadonlySignal<unknown>): () => void {
  return effect(() => {
    const val = sig.value;
    if (val === null || val === undefined || val === false) {
      el.removeAttribute(attr);
    } else {
      el.setAttribute(attr, String(val));
    }
  });
}

/**
 * Toggle a CSS class based on boolean signal
 */
export function bindClass(el: Element, className: string, sig: ReadonlySignal<boolean>): () => void {
  return effect(() => {
    if (sig.value) {
      el.classList.add(className);
    } else {
      el.classList.remove(className);
    }
  });
}

/**
 * Two-way bind an input element to a signal
 */
export function bindModel(el: HTMLInputElement | HTMLTextAreaElement, sig: Signal<string>): () => void {
  const unbind = effect(() => {
    if (el.value !== sig.value) {
      el.value = sig.value;
    }
  });

  const onInput = () => {
    sig.value = el.value;
  };

  el.addEventListener('input', onInput);

  return () => {
    unbind();
    el.removeEventListener('input', onInput);
  };
}

/**
 * Auto-bind all elements with [data-bind] within a container
 */
export function scanAndBind(container: Element, store: Record<string, ReadonlySignal<unknown>>): () => void {
  const cleanups: Array<() => void> = [];
  const boundElements = container.querySelectorAll('[data-bind]');

  boundElements.forEach((el) => {
    const key = el.getAttribute('data-bind');
    if (key && store[key]) {
      cleanups.push(bindText(el, store[key]));
    }
  });

  return () => {
    cleanups.forEach((c) => c());
  };
}
