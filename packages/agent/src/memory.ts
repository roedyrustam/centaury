/**
 * @file memory.ts
 * @description Episodic Memory & Context Cache for Centaury Autonomous Agents
 */

export interface EpisodicRecord {
  id: string;
  sessionId: string;
  role: 'user' | 'agent' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export class CentauryAgentMemory {
  private sessions = new Map<string, EpisodicRecord[]>();
  private globalPrefixContext = '';

  /**
   * Set global deterministic system prefix for KV-cache reuse
   */
  public setDeterministicPrefix(prefix: string): void {
    this.globalPrefixContext = prefix;
  }

  public getDeterministicPrefix(): string {
    return this.globalPrefixContext;
  }

  /**
   * Store a conversation or reasoning turn
   */
  public storeTurn(record: Omit<EpisodicRecord, 'id' | 'timestamp'>): EpisodicRecord {
    const id = crypto.randomUUID();
    const entry: EpisodicRecord = {
      ...record,
      id,
      timestamp: Date.now(),
    };

    if (!this.sessions.has(record.sessionId)) {
      this.sessions.set(record.sessionId, []);
    }

    this.sessions.get(record.sessionId)!.push(entry);
    return entry;
  }

  /**
   * Retrieve conversation history for a session
   */
  public getSessionHistory(sessionId: string, limit = 20): EpisodicRecord[] {
    const history = this.sessions.get(sessionId) ?? [];
    return history.slice(-limit);
  }

  /**
   * Clear session history
   */
  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
