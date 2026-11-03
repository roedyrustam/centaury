/**
 * @file repository.ts
 * @description Type-safe Generic Repository pattern for CentauryDatabase (bun:sqlite).
 * Provides clean data access abstraction for persistent application entities.
 */

import type { CentauryDatabase } from './database';
import { CentauryQueryBuilder, type OrderDirection } from './query-builder';

export interface RepositoryFindOptions<T> {
  where?: Partial<T>;
  limit?: number;
  offset?: number;
  orderBy?: keyof T & string;
  orderDir?: OrderDirection;
}

export class CentauryRepository<T extends { id: string | number }> {
  protected db: CentauryDatabase;
  protected tableName: string;

  constructor(db: CentauryDatabase, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  /**
   * Find entity by primary ID
   */
  public findById(id: string | number): T | null {
    const qb = new CentauryQueryBuilder<T>(this.db);
    return qb.select('*').from(this.tableName).where('id = ?', id).get<T>();
  }

  /**
   * Find entities matching filter criteria with pagination and ordering
   */
  public findMany(options: RepositoryFindOptions<T> = {}): T[] {
    const qb = new CentauryQueryBuilder<T>(this.db);
    qb.select('*').from(this.tableName);

    if (options.where) {
      const entries = Object.entries(options.where).filter(([_, v]) => v !== undefined);
      if (entries.length > 0) {
        entries.forEach(([col, val], idx) => {
          if (idx === 0) {
            qb.where(`${col} = ?`, val);
          } else {
            qb.andWhere(`${col} = ?`, val);
          }
        });
      }
    }

    if (options.orderBy) {
      qb.orderBy(options.orderBy, options.orderDir ?? 'ASC');
    }

    if (typeof options.limit === 'number') {
      qb.limit(options.limit);
    }

    if (typeof options.offset === 'number') {
      qb.offset(options.offset);
    }

    return qb.all<T>();
  }

  /**
   * Insert a new entity
   */
  public create(data: Omit<T, 'id'> & { id?: string | number }): T {
    const qb = new CentauryQueryBuilder(this.db);
    const insertObj = { ...data };

    const res = qb.insertInto(this.tableName, insertObj as Record<string, unknown>).run();
    const id = (data.id ?? res.lastInsertRowid) as string | number;

    const created = this.findById(id);
    if (!created) {
      return { ...insertObj, id } as unknown as T;
    }
    return created;
  }

  /**
   * Update an existing entity by ID
   */
  public update(id: string | number, patch: Partial<Omit<T, 'id'>>): T | null {
    const entries = Object.entries(patch).filter(([_, v]) => v !== undefined);
    if (entries.length === 0) return this.findById(id);

    const qb = new CentauryQueryBuilder(this.db);
    qb.update(this.tableName, patch as Record<string, unknown>)
      .where('id = ?', id)
      .run();

    return this.findById(id);
  }

  /**
   * Delete an entity by ID
   */
  public delete(id: string | number): boolean {
    const qb = new CentauryQueryBuilder(this.db);
    const res = qb.deleteFrom(this.tableName).where('id = ?', id).run();
    return res.changes > 0;
  }

  /**
   * Count total entities matching optional criteria
   */
  public count(where?: Partial<T>): number {
    const qb = new CentauryQueryBuilder<{ count: number }>(this.db);
    qb.select('COUNT(*) as count').from(this.tableName);

    if (where) {
      const entries = Object.entries(where).filter(([_, v]) => v !== undefined);
      if (entries.length > 0) {
        entries.forEach(([col, val], idx) => {
          if (idx === 0) {
            qb.where(`${col} = ?`, val);
          } else {
            qb.andWhere(`${col} = ?`, val);
          }
        });
      }
    }

    const row = qb.get<{ count: number }>();
    return row?.count ?? 0;
  }
}

