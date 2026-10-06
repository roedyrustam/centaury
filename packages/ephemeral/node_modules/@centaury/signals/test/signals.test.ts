/**
 * @file signals.test.ts
 * @description Test suite for @centaury/signals reactive engine & DOM bindings
 */

import { describe, it, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { signal, computed, effect, batch } from '../src/signal';
import { bindText, bindAttr, bindClass, bindModel, scanAndBind } from '../src/dom';

describe('@centaury/signals Atomic Reactive Engine', () => {
  it('manages signal values and triggers subscribers', () => {
    const count = signal(10);
    expect(count.value).toBe(10);

    let observed = 0;
    const unsubscribe = count.subscribe((val) => {
      observed = val;
    });

    expect(observed).toBe(10);

    count.value = 25;
    expect(observed).toBe(25);
    expect(count.peek()).toBe(25);

    unsubscribe();
    count.value = 50;
    expect(observed).toBe(25); // Did not trigger after unsubscribe
  });

  it('computes derived values lazily and re-evaluates automatically', () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed(() => a.value + b.value);

    expect(sum.value).toBe(5);

    a.value = 10;
    expect(sum.value).toBe(13);

    b.value = 7;
    expect(sum.value).toBe(17);
  });

  it('tracks dependencies in effects with cleanup support', () => {
    const enabled = signal(true);
    let runCount = 0;
    let cleanedUp = false;

    const stop = effect(() => {
      runCount++;
      if (enabled.value) {
        return () => {
          cleanedUp = true;
        };
      }
    });

    expect(runCount).toBe(1);
    expect(cleanedUp).toBe(false);

    enabled.value = false;
    expect(runCount).toBe(2);
    expect(cleanedUp).toBe(true);

    stop();
  });

  it('batches multiple signal mutations into a single subscriber run', () => {
    const first = signal('Alpha');
    const last = signal('Omega');
    let evaluations = 0;

    effect(() => {
      evaluations++;
      // access both
      const _ = `${first.value} ${last.value}`;
    });

    expect(evaluations).toBe(1);

    batch(() => {
      first.value = 'Beta';
      last.value = 'Zeta';
      first.value = 'Gamma';
    });

    expect(evaluations).toBe(2); // Only 1 additional evaluation instead of 3
  });
});

describe('@centaury/signals Zero-Hydration DOM Bindings', () => {
  it('binds signal to DOM textContent directly', () => {
    const window = new Window();
    const document = window.document;

    const span = document.createElement('span');
    const greeting = signal('Hello World');

    const unbind = bindText(span as any, greeting);
    expect(span.textContent).toBe('Hello World');

    greeting.value = 'Hello Centaury';
    expect(span.textContent).toBe('Hello Centaury');

    unbind();
  });

  it('binds attributes and removes them on null/false', () => {
    const window = new Window();
    const document = window.document;

    const btn = document.createElement('button');
    const disabled = signal<boolean | null>(true);

    bindAttr(btn as any, 'disabled', disabled);
    expect(btn.hasAttribute('disabled')).toBe(true);

    disabled.value = false;
    expect(btn.hasAttribute('disabled')).toBe(false);
  });

  it('binds classes dynamically', () => {
    const window = new Window();
    const document = window.document;

    const div = document.createElement('div');
    const isActive = signal(false);

    bindClass(div as any, 'active-glow', isActive);
    expect(div.classList.contains('active-glow')).toBe(false);

    isActive.value = true;
    expect(div.classList.contains('active-glow')).toBe(true);
  });

  it('supports two-way input model binding', () => {
    const window = new Window();
    const document = window.document;

    const input = document.createElement('input');
    const textSig = signal('Initial');

    const unbind = bindModel(input as any, textSig);
    expect(input.value).toBe('Initial');

    // Model update -> DOM
    textSig.value = 'Updated from signal';
    expect(input.value).toBe('Updated from signal');

    // DOM event -> Model
    input.value = 'User typed this';
    input.dispatchEvent(new window.Event('input') as any);
    expect(textSig.value).toBe('User typed this');

    unbind();
  });

  it('scans and binds [data-bind] attributes inside containers', () => {
    const window = new Window();
    const document = window.document;

    const container = document.createElement('div');
    container.innerHTML = `
      <h1 data-bind="title">Old Title</h1>
      <p data-bind="status">Idle</p>
    `;

    const titleSig = signal('Centaury Nexus');
    const statusSig = signal('Processing 100k req/s');

    scanAndBind(container as any, {
      title: titleSig,
      status: statusSig,
    });

    expect(container.querySelector('h1')!.textContent).toBe('Centaury Nexus');
    expect(container.querySelector('p')!.textContent).toBe('Processing 100k req/s');

    statusSig.value = 'Completed in 0.4ms';
    expect(container.querySelector('p')!.textContent).toBe('Completed in 0.4ms');
  });
});
