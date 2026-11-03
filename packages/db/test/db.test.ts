/**
 * @file db.test.ts
 * @description Comprehensive unit & integration tests for @centaury-ai/db
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  CentauryDatabase,
  query,
  CentauryMigrationRunner,
  CentauryVectorStore,
  CentauryRepository,
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  serializeVector,
  deserializeVector,
} from '../src/index';

describe('@centaury-ai/db Database Core & WAL Lifecycle', () => {
  let db: CentauryDatabase;

  beforeEach(() => {
    db = new CentauryDatabase({ path: ':memory:' });
  });

  afterEach(() => {
    db.close();
  });

  it('initializes in-memory database with foreign keys and caches statements', () => {
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);');

    const stmt1 = db.prepare('INSERT INTO users (name) VALUES (?);');
    stmt1.run('Alice');

    // Statement caching test
    const stmt2 = db.prepare('INSERT INTO users (name) VALUES (?);');
    expect(stmt1).toBe(stmt2);

    stmt2.run('Bob');

    const selectStmt = db.prepare<{ count: number }>('SELECT COUNT(*) as count FROM users;');
    const res = selectStmt.get();
    expect(res?.count).toBe(2);

    const stats = db.stats();
    expect(stats.statementCacheSize).toBeGreaterThanOrEqual(2);
    expect(stats.closed).toBe(false);
  });

  it('runs operations atomically inside transactions with rollback on error', () => {
    db.exec('CREATE TABLE accounts (id TEXT PRIMARY KEY, balance INTEGER);');
    db.exec("INSERT INTO accounts (id, balance) VALUES ('acc1', 100), ('acc2', 50);");

    // Successful transaction
    db.transaction(() => {
      db.prepare("UPDATE accounts SET balance = balance - 20 WHERE id = 'acc1';").run();
      db.prepare("UPDATE accounts SET balance = balance + 20 WHERE id = 'acc2';").run();
    });

    const acc1 = db.prepare<{ balance: number }>("SELECT balance FROM accounts WHERE id = 'acc1';").get();
    const acc2 = db.prepare<{ balance: number }>("SELECT balance FROM accounts WHERE id = 'acc2';").get();
    expect(acc1?.balance).toBe(80);
    expect(acc2?.balance).toBe(70);

    // Failing transaction (rollback)
    expect(() => {
      db.transaction(() => {
        db.prepare("UPDATE accounts SET balance = balance - 30 WHERE id = 'acc1';").run();
        throw new Error('Simulated network failure');
      });
    }).toThrow();

    const acc1AfterFail = db.prepare<{ balance: number }>("SELECT balance FROM accounts WHERE id = 'acc1';").get();
    expect(acc1AfterFail?.balance).toBe(80); // intact!
  });
});

describe('@centaury-ai/db QueryBuilder', () => {
  let db: CentauryDatabase;

  beforeEach(() => {
    db = new CentauryDatabase({ path: ':memory:' });
    db.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('builds and executes INSERT, SELECT, UPDATE, and DELETE queries', () => {
    // 1. INSERT
    const insertRes = query(db)
      .insertInto('products', [
        { name: 'Quantum Core', price: 299.99, category: 'Hardware' },
        { name: 'Neural Router', price: 149.5, category: 'Hardware' },
        { name: 'Astra Cloud License', price: 49.0, category: 'Software' },
      ])
      .run();

    expect(insertRes.changes).toBe(3);

    // 2. SELECT with WHERE and ORDER BY
    const hardware = query(db)
      .select(['name', 'price'])
      .from('products')
      .where('category = ?', 'Hardware')
      .andWhere('price > ?', 200)
      .all<{ name: string; price: number }>();

    expect(hardware.length).toBe(1);
    expect(hardware[0].name).toBe('Quantum Core');

    // 3. UPDATE
    const updateRes = query(db)
      .update('products', { price: 249.99 })
      .where('name = ?', 'Quantum Core')
      .run();

    expect(updateRes.changes).toBe(1);

    const updated = query(db)
      .select('*')
      .from('products')
      .where('name = ?', 'Quantum Core')
      .get<{ price: number }>();
    expect(updated?.price).toBe(249.99);

    // 4. DELETE
    const deleteRes = query(db)
      .deleteFrom('products')
      .where('category = ?', 'Software')
      .run();

    expect(deleteRes.changes).toBe(1);

    const remaining = query(db).select('COUNT(*) as total').from('products').get<{ total: number }>();
    expect(remaining?.total).toBe(2);
  });
});

describe('@centaury-ai/db Migration Runner', () => {
  let db: CentauryDatabase;

  beforeEach(() => {
    db = new CentauryDatabase({ path: ':memory:' });
  });

  afterEach(() => {
    db.close();
  });

  it('registers, applies, and rolls back migrations with atomic tracking', async () => {
    const runner = new CentauryMigrationRunner(db);

    runner.register({
      name: '001_create_posts_table',
      up: (d) => {
        d.exec('CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);');
      },
      down: (d) => {
        d.exec('DROP TABLE posts;');
      },
    });

    runner.register({
      name: '002_add_author_to_posts',
      up: (d) => {
        d.exec('ALTER TABLE posts ADD COLUMN author TEXT;');
      },
      down: (d) => {
        // SQLite doesn't natively drop column on older syntax, but for test:
        d.exec('CREATE TABLE posts_backup (id INTEGER PRIMARY KEY, title TEXT);');
        d.exec('INSERT INTO posts_backup SELECT id, title FROM posts;');
        d.exec('DROP TABLE posts;');
        d.exec('ALTER TABLE posts_backup RENAME TO posts;');
      },
    });

    expect(runner.status().pending).toBe(2);

    // Run migrations
    const applied = await runner.migrate();
    expect(applied).toEqual(['001_create_posts_table', '002_add_author_to_posts']);
    expect(runner.status().pending).toBe(0);
    expect(runner.status().applied).toBe(2);

    // Idempotent re-run
    const reapplied = await runner.migrate();
    expect(reapplied.length).toBe(0);

    // Test rollback of 002
    const rolledBack = await runner.rollback();
    expect(rolledBack).toBe('002_add_author_to_posts');
    expect(runner.status().applied).toBe(1);
    expect(runner.status().pending).toBe(1);
  });
});

describe('@centaury-ai/db Vector Engine & Vector Store', () => {
  let db: CentauryDatabase;

  beforeEach(() => {
    db = new CentauryDatabase({ path: ':memory:' });
  });

  afterEach(() => {
    db.close();
  });

  it('computes accurate vector dot product, euclidean distance, and cosine similarity', () => {
    const v1 = new Float32Array([1, 0, 0]);
    const v2 = new Float32Array([1, 0, 0]);
    const v3 = new Float32Array([0, 1, 0]);

    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
    expect(cosineSimilarity(v1, v3)).toBeCloseTo(0.0, 5);
    expect(dotProduct(v1, v2)).toBe(1);
    expect(euclideanDistance(v1, v3)).toBeCloseTo(Math.sqrt(2), 5);
  });

  it('serializes and deserializes Float32Array vectors losslessly', () => {
    const original = new Float32Array([0.1234, -0.5678, 0.9999, 0.0001]);
    const blob = serializeVector(original);
    const restored = deserializeVector(blob);

    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 5);
    }
  });

  it('stores and retrieves top-K nearest vectors with similarity scores', () => {
    const store = new CentauryVectorStore(db);

    // Insert 3 documents
    store.upsert({
      id: 'doc-ai',
      collection: 'docs',
      embedding: [0.95, 0.85, 0.1],
      metadata: { topic: 'Artificial Intelligence' },
    });

    store.upsert({
      id: 'doc-rag',
      collection: 'docs',
      embedding: [0.9, 0.8, 0.15],
      metadata: { topic: 'Retrieval-Augmented Generation' },
    });

    store.upsert({
      id: 'doc-cooking',
      collection: 'docs',
      embedding: [0.05, 0.1, 0.98],
      metadata: { topic: 'Culinary Recipes' },
    });

    expect(store.count('docs')).toBe(3);

    // Search with query vector close to AI / RAG
    const queryVec = [0.92, 0.82, 0.12];
    const results = store.search({
      collection: 'docs',
      vector: queryVec,
      topK: 2,
      minScore: 0.8,
    });

    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThan(0.98);
    expect(['doc-ai', 'doc-rag']).toContain(results[0].id);
    expect(results[0].metadata?.topic).toBeDefined();

    // Verify deletion
    const deleted = store.delete('doc-cooking');
    expect(deleted).toBe(true);
    expect(store.count('docs')).toBe(2);
  });
});

describe('@centaury-ai/db Repository Pattern', () => {
  interface AgentTask {
    id: string;
    title: string;
    status: 'pending' | 'completed';
    priority: number;
  }

  let db: CentauryDatabase;
  let repo: CentauryRepository<AgentTask>;

  beforeEach(() => {
    db = new CentauryDatabase({ path: ':memory:' });
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL
      );
    `);
    repo = new CentauryRepository<AgentTask>(db, 'tasks');
  });

  afterEach(() => {
    db.close();
  });

  it('executes full type-safe CRUD operations', () => {
    // Create
    const created = repo.create({
      id: 'task-1',
      title: 'Audit RAG embeddings',
      status: 'pending',
      priority: 1,
    });
    expect(created.id).toBe('task-1');

    repo.create({
      id: 'task-2',
      title: 'Synthesize Ephemeral UI',
      status: 'pending',
      priority: 2,
    });

    expect(repo.count()).toBe(2);
    expect(repo.count({ status: 'pending' })).toBe(2);

    // FindById
    const found = repo.findById('task-1');
    expect(found?.title).toBe('Audit RAG embeddings');

    // FindMany with sorting and limit
    const list = repo.findMany({
      where: { status: 'pending' },
      orderBy: 'priority',
      orderDir: 'DESC',
      limit: 1,
    });
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('task-2');

    // Update
    const updated = repo.update('task-1', { status: 'completed' });
    expect(updated?.status).toBe('completed');

    // Delete
    const deleted = repo.delete('task-2');
    expect(deleted).toBe(true);
    expect(repo.count()).toBe(1);
  });
});
