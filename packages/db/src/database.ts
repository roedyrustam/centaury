/**
 * @file database.ts
 * @description Core database connection manager using native bun:sqlite.
 * Handles connection lifecycle, WAL mode, foreign keys, and statement caching.
 */

import { Database as BunDatabase, type Statement, type SQLQueryBindings } from 'bun:sqlite';

export interface DatabaseOptions {
  /** Path to SQLite file. Use ':memory:' for in-memory DB. Default: './centaury.db' */
  path?: string;
  /** Enable WAL mode for concurrent reads. Default: true */
  wal?: boolean;
  /** Enable foreign key constraints. Default: true */
  foreignKeys?: boolean;
  /** Max statement cache size. Default: 128 */
  statementCacheSize?: number;
}

export class CentauryDatabase {
  public readonly db: BunDatabase;
  private readonly statementCache = new Map<string, Statement<any, any>>();
  private readonly maxCacheSize: number;
  private _closed = false;

  constructor(options: DatabaseOptions = {}) {
    const path = options.path ?? './centaury.db';
    this.maxCacheSize = options.statementCacheSize ?? 128;

    this.db = new BunDatabase(path, { create: true });

    if (options.wal !== false) {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
    if (options.foreignKeys !== false) {
      this.db.exec('PRAGMA foreign_keys = ON;');
    }
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA temp_store = MEMORY;');
    this.db.exec('PRAGMA cache_size = -16000;'); // 16MB page cache
  }

  /**
   * Prepare and cache a SQL statement for repeated execution.
   * Evicts oldest entry when cache is full (LRU-lite via Map insertion order).
   */
  public prepare<T = Record<string, unknown>>(sql: string): Statement<T, any> {
    const cached = this.statementCache.get(sql);
    if (cached) return cached as Statement<T, any>;

    if (this.statementCache.size >= this.maxCacheSize) {
      const firstKey = this.statementCache.keys().next().value!;
      this.statementCache.get(firstKey)?.finalize();
      this.statementCache.delete(firstKey);
    }

    const stmt = this.db.prepare<T, any>(sql);
    this.statementCache.set(sql, stmt as Statement<any, any>);
    return stmt as Statement<T, any>;
  }

  /**
   * Execute a SQL string with no return value (DDL, PRAGMA, etc.)
   */
  public exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Run a function inside a synchronous SQLite transaction.
   * Automatically commits on success, rolls back on throw.
   */
  public transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  /**
   * Return a snapshot of runtime database statistics
   */
  public stats(): Record<string, unknown> {
    const pageCount = (this.db.prepare('PRAGMA page_count').get() as Record<string, number>)?.page_count ?? 0;
    const pageSize = (this.db.prepare('PRAGMA page_size').get() as Record<string, number>)?.page_size ?? 4096;
    return {
      path: this.db.filename,
      sizeBytes: pageCount * pageSize,
      statementCacheSize: this.statementCache.size,
      closed: this._closed,
    };
  }

  /**
   * Close the database and finalize all cached statements
   */
  public close(): void {
    if (this._closed) return;
    for (const stmt of this.statementCache.values()) {
      stmt.finalize();
    }
    this.statementCache.clear();
    this.db.close();
    this._closed = true;
  }
}
