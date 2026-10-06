/**
 * @file signal.ts
 * @description Zero-Hydration Atomic Micro-Signals (<1.5KB) for Centaury
 */

type Subscriber = () => void;

let activeSubscriber: Subscriber | null = null;
let isBatching = false;
const pendingEffects = new Set<Subscriber>();

export interface ReadonlySignal<T> {
  readonly value: T;
  peek(): T;
  subscribe(fn: (val: T) => void): () => void;
}

export class Signal<T> implements ReadonlySignal<T> {
  private _value: T;
  private subscribers = new Set<Subscriber>();

  constructor(initialValue: T) {
    this._value = initialValue;
  }

  public get value(): T {
    if (activeSubscriber) {
      this.subscribers.add(activeSubscriber);
    }
    return this._value;
  }

  public set value(newValue: T) {
    if (!Object.is(this._value, newValue)) {
      this._value = newValue;
      this.notify();
    }
  }

  public peek(): T {
    return this._value;
  }

  public set(newValue: T): void {
    this.value = newValue;
  }

  public update(updater: (prev: T) => T): void {
    this.value = updater(this._value);
  }

  public subscribe(fn: (val: T) => void): () => void {
    const sub = () => fn(this._value);
    this.subscribers.add(sub);
    sub(); // Immediate run
    return () => {
      this.subscribers.delete(sub);
    };
  }

  private notify(): void {
    for (const sub of this.subscribers) {
      if (isBatching) {
        pendingEffects.add(sub);
      } else {
        sub();
      }
    }
  }
}

/**
 * Create a new reactive signal
 */
export function signal<T>(initialValue: T): Signal<T> {
  return new Signal<T>(initialValue);
}

/**
 * Create an automatically tracking computed signal
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
  const result = new Signal<T>(undefined as unknown as T);
  effect(() => {
    result.value = fn();
  });
  return result;
}

/**
 * Execute an effect that automatically tracks and re-runs on signal changes
 */
export function effect(fn: () => void | (() => void)): () => void {
  let cleanup: void | (() => void);

  const runner: Subscriber = () => {
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }
    const prevSubscriber = activeSubscriber;
    activeSubscriber = runner;
    try {
      cleanup = fn();
    } finally {
      activeSubscriber = prevSubscriber;
    }
  };

  runner();

  return () => {
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }
  };
}

/**
 * Batch multiple signal mutations to avoid unnecessary intermediate re-runs
 */
export function batch<T>(fn: () => T): T {
  const prevBatching = isBatching;
  isBatching = true;
  try {
    return fn();
  } finally {
    isBatching = prevBatching;
    if (!isBatching) {
      const effectsToRun = Array.from(pendingEffects);
      pendingEffects.clear();
      for (const eff of effectsToRun) {
        eff();
      }
    }
  }
}

export interface PersistOptions<T> {
  storage?: 'local' | 'session';
  serialize?: (val: T) => string;
  deserialize?: (raw: string) => T;
  syncCrossTab?: boolean;
}

/**
 * Create a persistent signal stored in localStorage/sessionStorage with optional cross-tab sync
 */
export function persistedSignal<T>(
  key: string,
  initialValue: T,
  options: PersistOptions<T> = {}
): Signal<T> {
  const storageType = options.storage || 'local';
  const serialize = options.serialize || JSON.stringify;
  const deserialize = options.deserialize || JSON.parse;
  const syncCrossTab = options.syncCrossTab !== false;

  const getStorage = () => {
    if (typeof window === 'undefined') return null;
    try {
      return storageType === 'session' ? window.sessionStorage : window.localStorage;
    } catch {
      return null;
    }
  };

  // 1. Read existing value from storage if present
  let resolvedInitial = initialValue;
  const store = getStorage();
  if (store) {
    try {
      const storedItem = store.getItem(key);
      if (storedItem !== null) {
        resolvedInitial = deserialize(storedItem);
      }
    } catch (e) {
      console.warn(`[Centaury Signals] Failed to read persisted signal "${key}":`, e);
    }
  }

  const sig = new Signal<T>(resolvedInitial);

  // 2. Persist upon changes
  sig.subscribe((val) => {
    const s = getStorage();
    if (!s) return;
    try {
      s.setItem(key, serialize(val));
    } catch (e) {
      console.warn(`[Centaury Signals] Failed to persist signal "${key}":`, e);
    }
  });

  // 3. Multi-tab synchronization via window storage event
  if (syncCrossTab && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === key && event.newValue !== null) {
        try {
          const newVal = deserialize(event.newValue);
          sig.set(newVal);
        } catch (e) {
          console.warn(`[Centaury Signals] Failed to sync cross-tab storage for "${key}":`, e);
        }
      }
    });
  }

  return sig;
}
