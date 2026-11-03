/**
 * @file vector.ts
 * @description High-speed vector mathematics and SQLite-backed Vector Store for Centaury Framework.
 * Powers agentic RAG, semantic similarity matching, and episodic memory retrieval.
 */

import type { CentauryDatabase } from './database';

export interface VectorRecord {
  id: string;
  collection: string;
  embedding: Float32Array;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface ScoredVectorRecord extends VectorRecord {
  score: number;
}

/**
 * Calculates dot product between two vectors
 */
export function dotProduct(a: Float32Array | number[], b: Float32Array | number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Calculates cosine similarity between two vectors (-1.0 to 1.0)
 */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dot / denominator;
}

/**
 * Calculates Euclidean distance between two vectors
 */
export function euclideanDistance(a: Float32Array | number[], b: Float32Array | number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Serialize a vector (number[] or Float32Array) to a binary Buffer / Uint8Array for SQLite BLOB storage
 */
export function serializeVector(vec: number[] | Float32Array): Uint8Array {
  const float32 = vec instanceof Float32Array ? vec : new Float32Array(vec);
  return new Uint8Array(float32.buffer, float32.byteOffset, float32.byteLength);
}

/**
 * Deserialize a binary BLOB back into a Float32Array
 */
export function deserializeVector(bytes: Uint8Array | ArrayBuffer): Float32Array {
  if (bytes instanceof Uint8Array) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Float32Array(buffer);
  }
  return new Float32Array(bytes);
}

/**
 * CentauryVectorStore: High-performance SQLite-backed vector storage with cosine search
 */
export class CentauryVectorStore {
  private db: CentauryDatabase;
  private tableName: string;

  constructor(db: CentauryDatabase, tableName = '_centaury_vectors') {
    this.db = db;
    this.tableName = tableName;
    this.ensureVectorTable();
  }

  private ensureVectorTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        collection TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_coll ON ${this.tableName} (collection);
    `);
  }

  /**
   * Insert or update a vector record
   */
  public upsert(record: {
    id?: string;
    collection: string;
    embedding: Float32Array | number[];
    metadata?: Record<string, unknown>;
  }): string {
    const id = record.id ?? crypto.randomUUID();
    const blob = serializeVector(record.embedding);
    const metaJson = record.metadata ? JSON.stringify(record.metadata) : null;
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (id, collection, embedding, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        collection = excluded.collection,
        embedding = excluded.embedding,
        metadata = excluded.metadata,
        created_at = excluded.created_at;
    `);

    stmt.run(id, record.collection, blob, metaJson, now);
    return id;
  }

  /**
   * Search for nearest neighbor vectors by cosine similarity
   */
  public search(query: {
    collection: string;
    vector: Float32Array | number[];
    topK?: number;
    minScore?: number;
  }): ScoredVectorRecord[] {
    const topK = query.topK ?? 5;
    const minScore = query.minScore ?? 0.0;
    const queryVec = query.vector instanceof Float32Array ? query.vector : new Float32Array(query.vector);

    const stmt = this.db.prepare<{
      id: string;
      collection: string;
      embedding: Uint8Array;
      metadata: string | null;
      created_at: number;
    }>(`SELECT id, collection, embedding, metadata, created_at FROM ${this.tableName} WHERE collection = ?;`);

    const rows = stmt.all(query.collection);
    const scored: ScoredVectorRecord[] = [];

    for (const row of rows) {
      const storedVec = deserializeVector(row.embedding);
      const score = cosineSimilarity(queryVec, storedVec);

      if (score >= minScore) {
        scored.push({
          id: row.id,
          collection: row.collection,
          embedding: storedVec,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
          createdAt: row.created_at,
          score,
        });
      }
    }

    // Sort descending by score and slice topK
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Delete vector by ID
   */
  public delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?;`);
    const res = stmt.run(id);
    return res.changes > 0;
  }

  /**
   * Count total vectors, optionally filtered by collection
   */
  public count(collection?: string): number {
    if (collection) {
      const stmt = this.db.prepare<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE collection = ?;`
      );
      return stmt.get(collection)?.count ?? 0;
    }
    const stmt = this.db.prepare<{ count: number }>(`SELECT COUNT(*) as count FROM ${this.tableName};`);
    return stmt.get()?.count ?? 0;
  }
}

