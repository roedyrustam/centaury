/**
 * @file query-builder.ts
 * @description Type-safe, parameterized SQL query builder for CentauryDatabase (bun:sqlite).
 * Prevents SQL injection via strict parameterized query formulation.
 */

import type { SQLQueryBindings } from 'bun:sqlite';
import type { CentauryDatabase } from './database';

export type OrderDirection = 'ASC' | 'DESC';

export class CentauryQueryBuilder<T = Record<string, unknown>> {
  private db?: CentauryDatabase;
  private mode: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' = 'SELECT';
  private table = '';
  private selectedFields: string[] = ['*'];
  private whereClauses: { type: 'AND' | 'OR'; clause: string; params: unknown[] }[] = [];
  private orderByClause?: { column: string; direction: OrderDirection };
  private limitValue?: number;
  private offsetValue?: number;
  private insertData?: Record<string, unknown>[];
  private updateData?: Record<string, unknown>;

  constructor(db?: CentauryDatabase) {
    this.db = db;
  }

  /**
   * Set target database instance for direct execution
   */
  public using(db: CentauryDatabase): this {
    this.db = db;
    return this;
  }

  /**
   * Specify fields to select
   */
  public select(fields: string | string[]): this {
    this.mode = 'SELECT';
    this.selectedFields = Array.isArray(fields) ? fields : [fields];
    return this;
  }

  /**
   * Specify the primary table
   */
  public from(table: string): this {
    this.table = table;
    return this;
  }

  /**
   * Add a WHERE condition
   */
  public where(clause: string, ...params: unknown[]): this {
    this.whereClauses = [{ type: 'AND', clause, params }];
    return this;
  }

  /**
   * Add an AND WHERE condition
   */
  public andWhere(clause: string, ...params: unknown[]): this {
    this.whereClauses.push({ type: 'AND', clause, params });
    return this;
  }

  /**
   * Add an OR WHERE condition
   */
  public orWhere(clause: string, ...params: unknown[]): this {
    this.whereClauses.push({ type: 'OR', clause, params });
    return this;
  }

  /**
   * Add ORDER BY sorting
   */
  public orderBy(column: string, direction: OrderDirection = 'ASC'): this {
    this.orderByClause = { column, direction };
    return this;
  }

  /**
   * Limit result count
   */
  public limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  /**
   * Offset result start index
   */
  public offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  /**
   * Configure an INSERT query
   */
  public insertInto(table: string, data: Record<string, unknown> | Record<string, unknown>[]): this {
    this.mode = 'INSERT';
    this.table = table;
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  /**
   * Configure an UPDATE query
   */
  public update(table: string, data: Record<string, unknown>): this {
    this.mode = 'UPDATE';
    this.table = table;
    this.updateData = data;
    return this;
  }

  /**
   * Configure a DELETE query
   */
  public deleteFrom(table: string): this {
    this.mode = 'DELETE';
    this.table = table;
    return this;
  }

  /**
   * Compile the query into parameterized SQL and parameter values
   */
  public toSql(): { sql: string; params: unknown[] } {
    if (!this.table) {
      throw new Error('QueryBuilder: table name is required');
    }

    const params: unknown[] = [];
    let sql = '';

    if (this.mode === 'SELECT') {
      sql = `SELECT ${this.selectedFields.join(', ')} FROM ${this.table}`;

      if (this.whereClauses.length > 0) {
        const whereParts: string[] = [];
        this.whereClauses.forEach((item, idx) => {
          const prefix = idx === 0 ? '' : ` ${item.type} `;
          whereParts.push(`${prefix}(${item.clause})`);
          params.push(...item.params);
        });
        sql += ` WHERE ${whereParts.join('')}`;
      }

      if (this.orderByClause) {
        sql += ` ORDER BY ${this.orderByClause.column} ${this.orderByClause.direction}`;
      }

      if (typeof this.limitValue === 'number') {
        sql += ` LIMIT ${this.limitValue}`;
      }

      if (typeof this.offsetValue === 'number') {
        sql += ` OFFSET ${this.offsetValue}`;
      }
    } else if (this.mode === 'INSERT') {
      if (!this.insertData || this.insertData.length === 0) {
        throw new Error('QueryBuilder: No data provided for INSERT');
      }

      const columns = Object.keys(this.insertData[0]);
      if (columns.length === 0) {
        throw new Error('QueryBuilder: INSERT data contains no columns');
      }

      const rowsPlaceholders: string[] = [];
      for (const row of this.insertData) {
        const placeholders = columns.map(() => '?');
        rowsPlaceholders.push(`(${placeholders.join(', ')})`);
        for (const col of columns) {
          params.push(row[col]);
        }
      }

      sql = `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES ${rowsPlaceholders.join(', ')}`;
    } else if (this.mode === 'UPDATE') {
      if (!this.updateData || Object.keys(this.updateData).length === 0) {
        throw new Error('QueryBuilder: No data provided for UPDATE');
      }

      const setClauses: string[] = [];
      for (const [key, val] of Object.entries(this.updateData)) {
        setClauses.push(`${key} = ?`);
        params.push(val);
      }

      sql = `UPDATE ${this.table} SET ${setClauses.join(', ')}`;

      if (this.whereClauses.length > 0) {
        const whereParts: string[] = [];
        this.whereClauses.forEach((item, idx) => {
          const prefix = idx === 0 ? '' : ` ${item.type} `;
          whereParts.push(`${prefix}(${item.clause})`);
          params.push(...item.params);
        });
        sql += ` WHERE ${whereParts.join('')}`;
      }
    } else if (this.mode === 'DELETE') {
      sql = `DELETE FROM ${this.table}`;

      if (this.whereClauses.length > 0) {
        const whereParts: string[] = [];
        this.whereClauses.forEach((item, idx) => {
          const prefix = idx === 0 ? '' : ` ${item.type} `;
          whereParts.push(`${prefix}(${item.clause})`);
          params.push(...item.params);
        });
        sql += ` WHERE ${whereParts.join('')}`;
      }
    }

    return { sql: `${sql};`, params };
  }

  /**
   * Execute SELECT query and return all matching records
   */
  public all<R = T>(): R[] {
    this.assertDb();
    const { sql, params } = this.toSql();
    const stmt = this.db!.prepare<R>(sql);
    return stmt.all(...(params as SQLQueryBindings[])) as R[];
  }

  /**
   * Execute SELECT query and return first record or null
   */
  public get<R = T>(): R | null {
    this.assertDb();
    const { sql, params } = this.toSql();
    const stmt = this.db!.prepare<R>(sql);
    const result = stmt.get(...(params as SQLQueryBindings[]));
    return (result ?? null) as R | null;
  }

  /**
   * Execute INSERT, UPDATE, or DELETE query and return result stats
   */
  public run(): { changes: number; lastInsertRowid: number | bigint } {
    this.assertDb();
    const { sql, params } = this.toSql();
    const stmt = this.db!.prepare(sql);
    return stmt.run(...(params as SQLQueryBindings[]));
  }

  private assertDb(): void {
    if (!this.db) {
      throw new Error('QueryBuilder: No CentauryDatabase provided. Call .using(db) or pass db to constructor.');
    }
  }
}

/**
 * Convenient query builder helper function
 */
export function query<T = Record<string, unknown>>(db?: CentauryDatabase): CentauryQueryBuilder<T> {
  return new CentauryQueryBuilder<T>(db);
}
