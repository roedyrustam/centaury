/**
 * @file memory.ts
 * @description Episodic Memory & Vector Context Cache for Centaury Autonomous Agents.
 * Supports both high-speed in-memory session tracking and persistent SQLite + Vector Store RAG.
 */

import { CentauryDatabase, CentauryVectorStore, type ScoredVectorRecord } from '@centaury-ai/db';

export interface EpisodicRecord {
  id: string;
  sessionId: string;
  role: 'user' | 'agent' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface AgentMemoryOptions {
  /** Optional SQLite database for persistent episodic storage */
  db?: CentauryDatabase;
  /** Table name for episodic turns. Default: '_centaury_agent_turns' */
  tableName?: string;
  /** Enable vector embedding search. Default: true if db is provided */
  enableVectorStore?: boolean;
}

export class CentauryAgentMemory {
  private sessions = new Map<string, EpisodicRecord[]>();
  private globalPrefixContext = '';
  private db?: CentauryDatabase;
  private vectorStore?: CentauryVectorStore;
  private tableName: string;

  constructor(options: AgentMemoryOptions = {}) {
    this.db = options.db;
    this.tableName = options.tableName ?? '_centaury_agent_turns';

    if (this.db) {
      this.ensureDatabaseSchema();
      if (options.enableVectorStore !== false) {
        this.vectorStore = new CentauryVectorStore(this.db, `${this.tableName}_vectors`);
      }
    }
  }

  private ensureDatabaseSchema(): void {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_sess ON ${this.tableName} (sessionId);
    `);
  }

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
   * Store a conversation or reasoning turn, with optional vector embedding for RAG recall
   */
  public storeTurn(
    record: Omit<EpisodicRecord, 'id' | 'timestamp'>,
    embedding?: Float32Array | number[]
  ): EpisodicRecord {
    const id = crypto.randomUUID();
    const entry: EpisodicRecord = {
      ...record,
      id,
      timestamp: Date.now(),
    };

    // 1. In-memory session tracking
    if (!this.sessions.has(record.sessionId)) {
      this.sessions.set(record.sessionId, []);
    }
    this.sessions.get(record.sessionId)!.push(entry);

    // 2. Persistent SQLite storage
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO ${this.tableName} (id, sessionId, role, content, metadata, timestamp)
        VALUES (?, ?, ?, ?, ?, ?);
      `);
      stmt.run(
        entry.id,
        entry.sessionId,
        entry.role,
        entry.content,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.timestamp
      );

      // 3. Vector embedding storage for semantic recall
      if (embedding && this.vectorStore) {
        this.vectorStore.upsert({
          id: entry.id,
          collection: `agent-turns:${entry.sessionId}`,
          embedding,
          metadata: {
            role: entry.role,
            content: entry.content,
            timestamp: entry.timestamp,
            ...entry.metadata,
          },
        });
      }
    }

    return entry;
  }

  /**
   * Recall the most relevant reasoning turns for a session using vector cosine similarity
   */
  public recallRelevantTurns(
    sessionId: string,
    queryVector: Float32Array | number[],
    topK = 5,
    minScore = 0.5
  ): ScoredVectorRecord[] {
    if (!this.vectorStore) {
      return [];
    }

    return this.vectorStore.search({
      collection: `agent-turns:${sessionId}`,
      vector: queryVector,
      topK,
      minScore,
    });
  }

  /**
   * Retrieve conversation history for a session
   */
  public getSessionHistory(sessionId: string, limit = 20): EpisodicRecord[] {
    // If in memory, return recent turns
    if (this.sessions.has(sessionId)) {
      const history = this.sessions.get(sessionId) ?? [];
      return history.slice(-limit);
    }

    // Fallback to SQLite persistent storage
    if (this.db) {
      const stmt = this.db.prepare<{
        id: string;
        sessionId: string;
        role: 'user' | 'agent' | 'system' | 'tool';
        content: string;
        metadata: string | null;
        timestamp: number;
      }>(`
        SELECT id, sessionId, role, content, metadata, timestamp
        FROM ${this.tableName}
        WHERE sessionId = ?
        ORDER BY timestamp ASC
        LIMIT ?;
      `);

      const rows = stmt.all(sessionId, limit);
      return rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        role: r.role,
        content: r.content,
        metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
        timestamp: r.timestamp,
      }));
    }

    return [];
  }

  /**
   * Clear session history from memory and persistent store
   */
  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);

    if (this.db) {
      const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE sessionId = ?;`);
      stmt.run(sessionId);
    }
  }
}
