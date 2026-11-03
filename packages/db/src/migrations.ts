/**
 * @file migrations.ts
 * @description Schema migration engine for Centaury Framework with atomic transactions and version tracking.
 */

import type { CentauryDatabase } from './database';

export interface Migration {
  name: string;
  up: (db: CentauryDatabase) => void | Promise<void>;
  down?: (db: CentauryDatabase) => void | Promise<void>;
}

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: number;
}

export class CentauryMigrationRunner {
  private db: CentauryDatabase;
  private migrations: Migration[] = [];
  private tableName = '_centaury_migrations';

  constructor(db: CentauryDatabase, tableName?: string) {
    this.db = db;
    if (tableName) this.tableName = tableName;
    this.ensureMigrationTable();
  }

  /**
   * Ensure migration tracking table exists
   */
  private ensureMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);
  }

  /**
   * Register a migration
   */
  public register(migration: Migration): this {
    if (this.migrations.some((m) => m.name === migration.name)) {
      throw new Error(`Migration with name '${migration.name}' is already registered.`);
    }
    this.migrations.push(migration);
    return this;
  }

  /**
   * Get all applied migrations from tracking table
   */
  public getAppliedMigrations(): MigrationRecord[] {
    const stmt = this.db.prepare<MigrationRecord>(
      `SELECT id, name, applied_at FROM ${this.tableName} ORDER BY id ASC;`
    );
    return stmt.all() as MigrationRecord[];
  }

  /**
   * Run all pending migrations in registered order inside transactions
   */
  public async migrate(): Promise<string[]> {
    const applied = new Set(this.getAppliedMigrations().map((m) => m.name));
    const newlyApplied: string[] = [];

    for (const migration of this.migrations) {
      if (!applied.has(migration.name)) {
        await this.db.transaction(async () => {
          await migration.up(this.db);
          const stmt = this.db.prepare(
            `INSERT INTO ${this.tableName} (name, applied_at) VALUES (?, ?);`
          );
          stmt.run(migration.name, Date.now());
        });
        newlyApplied.push(migration.name);
      }
    }

    return newlyApplied;
  }

  /**
   * Rollback the most recently applied migration
   */
  public async rollback(): Promise<string | null> {
    const applied = this.getAppliedMigrations();
    if (applied.length === 0) return null;

    const last = applied[applied.length - 1];
    const migration = this.migrations.find((m) => m.name === last.name);

    if (!migration) {
      throw new Error(`Cannot rollback '${last.name}': definition not found in registered migrations.`);
    }

    if (!migration.down) {
      throw new Error(`Cannot rollback '${last.name}': down migration not implemented.`);
    }

    await this.db.transaction(async () => {
      await migration.down!(this.db);
      const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE name = ?;`);
      stmt.run(last.name);
    });

    return last.name;
  }

  /**
   * Retrieve migration status
   */
  public status(): { total: number; applied: number; pending: number; pendingNames: string[] } {
    const appliedSet = new Set(this.getAppliedMigrations().map((m) => m.name));
    const pendingNames = this.migrations.filter((m) => !appliedSet.has(m.name)).map((m) => m.name);

    return {
      total: this.migrations.length,
      applied: appliedSet.size,
      pending: pendingNames.length,
      pendingNames,
    };
  }
}
