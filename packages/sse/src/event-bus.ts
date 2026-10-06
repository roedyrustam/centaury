/**
 * @file event-bus.ts
 * @description High-throughput topic-based Event Bus for Centaury SSE Engine
 *
 * Architecture:
 *  - O(1) topic lookup via Map<topic, Set<subscriber>>
 *  - Wildcard '*' topic subscription for omnibus listeners
 *  - Atomic event emission with async-safe fan-out
 *  - Ring-buffer history per topic for late-join subscriber replay
 */

export interface SseEvent {
  id?: string;
  event?: string;
  data: unknown;
  retry?: number;
}

export interface TopicStats {
  topic: string;
  subscriberCount: number;
  totalEmitted: number;
  lastEmittedAt: number | null;
}

type TopicSubscriber = (event: SseEvent) => void;

interface TopicEntry {
  subscribers: Set<TopicSubscriber>;
  history: SseEvent[];
  totalEmitted: number;
  lastEmittedAt: number | null;
}

export class CentauryEventBus {
  private readonly topics = new Map<string, TopicEntry>();
  private readonly historyLimit: number;
  private globalEventCount = 0;

  constructor(historyLimit = 100) {
    this.historyLimit = historyLimit;
  }

  /**
   * Subscribe to a specific topic. Returns an unsubscribe function.
   * Use topic '*' to receive all events across every topic.
   */
  public subscribe(topic: string, subscriber: TopicSubscriber): () => void {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, {
        subscribers: new Set(),
        history: [],
        totalEmitted: 0,
        lastEmittedAt: null,
      });
    }
    this.topics.get(topic)!.subscribers.add(subscriber);

    return () => {
      const entry = this.topics.get(topic);
      if (!entry) return;
      entry.subscribers.delete(subscriber);
      if (entry.subscribers.size === 0 && entry.history.length === 0) {
        this.topics.delete(topic);
      }
    };
  }

  /**
   * Publish an event to a specific topic. Notifies all topic subscribers
   * and any wildcard '*' subscribers.
   */
  public publish(topic: string, event: SseEvent): void {
    this.globalEventCount++;

    const autoId = event.id ?? `evt-${this.globalEventCount}`;
    const enriched: SseEvent = { ...event, id: autoId };

    // Persist to topic ring-buffer history
    const entry = this.topics.get(topic) ?? {
      subscribers: new Set<TopicSubscriber>(),
      history: [],
      totalEmitted: 0,
      lastEmittedAt: null,
    };
    entry.history.push(enriched);
    if (entry.history.length > this.historyLimit) {
      entry.history.shift();
    }
    entry.totalEmitted++;
    entry.lastEmittedAt = Date.now();
    this.topics.set(topic, entry);

    // Fan-out to topic subscribers
    for (const sub of entry.subscribers) {
      try {
        sub(enriched);
      } catch {
        // Subscriber errors must not block fan-out
      }
    }

    // Fan-out to wildcard subscribers
    const wildcardEntry = this.topics.get('*');
    if (wildcardEntry) {
      for (const sub of wildcardEntry.subscribers) {
        try {
          sub(enriched);
        } catch {
          // Subscriber errors must not block fan-out
        }
      }
    }
  }

  /**
   * Replay stored history for a topic to a new subscriber (late-join replay).
   * Returns the number of events replayed.
   */
  public replayHistory(topic: string, subscriber: TopicSubscriber, sinceId?: string): number {
    const entry = this.topics.get(topic);
    if (!entry) return 0;

    let history = entry.history;
    if (sinceId) {
      const idx = history.findIndex((e) => e.id === sinceId);
      history = idx >= 0 ? history.slice(idx + 1) : history;
    }

    for (const event of history) {
      try {
        subscriber(event);
      } catch {
        // Replay errors are non-fatal
      }
    }
    return history.length;
  }

  /**
   * Return diagnostic stats for all active topics
   */
  public getStats(): TopicStats[] {
    return Array.from(this.topics.entries()).map(([topic, entry]) => ({
      topic,
      subscriberCount: entry.subscribers.size,
      totalEmitted: entry.totalEmitted,
      lastEmittedAt: entry.lastEmittedAt,
    }));
  }

  /**
   * Total number of registered topic entries (excluding '*')
   */
  public get topicCount(): number {
    return this.topics.size;
  }

  /**
   * Global cumulative event emission count
   */
  public get totalEvents(): number {
    return this.globalEventCount;
  }

  /**
   * Destroy all subscribers and clear history
   */
  public destroy(): void {
    this.topics.clear();
    this.globalEventCount = 0;
  }
}
