/**
 * @file a2a.ts
 * @description Agent-to-Agent (A2A) Protocol Agent Card & Durable Task Lifecycle Server for Centaury
 */

import { CENTAURY_VERSION, type CentauryPlugin } from '@rudyrustam/core';
import type { CentauryDatabase } from '@rudyrustam/db';

export type A2ATaskStatus = 'submitted' | 'working' | 'completed' | 'failed' | 'canceled';

export interface AgentSkillDefinition {
  id: string;
  name: string;
  description: string;
  tags?: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  skills: AgentSkillDefinition[];
}

export interface A2ATask {
  id: string;
  skillId: string;
  status: A2ATaskStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type A2ATaskHandler = (input: unknown, task: A2ATask) => unknown | Promise<unknown>;

export interface A2ARegisteredSkill {
  skill: AgentSkillDefinition;
  handler: A2ATaskHandler;
}

export type A2ASkillOption =
  | A2ARegisteredSkill
  | (AgentSkillDefinition & { handler?: A2ATaskHandler });

export interface A2AServerOptions {
  name: string;
  description: string;
  version?: string;
  url?: string;
  skills?: A2ASkillOption[];
  db?: CentauryDatabase;
  serverInstance?: CentauryA2AServer;
}

export interface SendA2ATaskInput {
  id?: string;
  skillId: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

interface StoredA2ATaskRow {
  id: string;
  skill_id: string;
  status: A2ATaskStatus;
  input_json: string;
  output_json: string | null;
  error: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

function isTerminalA2AStatus(status: A2ATaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled';
}

function rowToTask(row: StoredA2ATaskRow): A2ATask {
  return {
    id: row.id,
    skillId: row.skill_id,
    status: row.status,
    input: JSON.parse(row.input_json),
    ...(row.output_json !== null ? { output: JSON.parse(row.output_json) } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
    ...(row.metadata_json !== null ? { metadata: JSON.parse(row.metadata_json) } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Manages A2A Agent Card discovery, optional SQLite task persistence, SSE streaming, and task execution.
 */
export class CentauryA2AServer {
  private readonly name: string;
  private readonly description: string;
  private readonly version: string;
  private readonly defaultUrl: string;
  private readonly db?: CentauryDatabase;
  private readonly skills = new Map<string, A2ARegisteredSkill>();
  private readonly tasks = new Map<string, A2ATask>();
  private readonly listeners = new Set<(task: A2ATask) => void>();

  constructor(options: A2AServerOptions) {
    this.name = options.name;
    this.description = options.description;
    this.version = options.version ?? CENTAURY_VERSION;
    this.defaultUrl = options.url ?? 'http://localhost:3000';
    this.db = options.db;

    if (this.db) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS _centaury_a2a_tasks (
          id TEXT PRIMARY KEY,
          skill_id TEXT NOT NULL,
          status TEXT NOT NULL,
          input_json TEXT NOT NULL,
          output_json TEXT,
          error TEXT,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    }

    if (options.skills) {
      for (const entry of options.skills) {
        if ('skill' in entry) {
          this.registerSkill(entry.skill, entry.handler);
        } else {
          const { handler, ...skill } = entry;
          this.registerSkill(
            skill,
            handler ??
              (() => {
                throw new Error(`Handler not bound for A2A skill '${skill.id}'`);
              })
          );
        }
      }
    }
  }

  private persistAndNotify(task: A2ATask): void {
    this.tasks.set(task.id, task);

    if (this.db) {
      this.db
        .prepare(
          `INSERT INTO _centaury_a2a_tasks
             (id, skill_id, status, input_json, output_json, error, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             output_json = excluded.output_json,
             error = excluded.error,
             metadata_json = excluded.metadata_json,
             updated_at = excluded.updated_at;`
        )
        .run(
          task.id,
          task.skillId,
          task.status,
          JSON.stringify(task.input ?? {}),
          task.output !== undefined ? JSON.stringify(task.output) : null,
          task.error ?? null,
          task.metadata !== undefined ? JSON.stringify(task.metadata) : null,
          task.createdAt,
          task.updatedAt
        );
    }

    const snapshot: A2ATask = { ...task };
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(snapshot);
      } catch {
        // Ignore faulty stream subscribers
      }
    }
  }

  /**
   * Subscribe to task state transition events. Returns an unsubscribe function.
   */
  public subscribe(listener: (task: A2ATask) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Register a callable A2A skill and handler.
   */
  public registerSkill(skill: AgentSkillDefinition, handler: A2ATaskHandler): this {
    this.skills.set(skill.id, { skill, handler });
    return this;
  }

  /**
   * Build the A2A Agent Card document exposed at /.well-known/agent.json.
   */
  public getAgentCard(baseUrl = this.defaultUrl): AgentCard {
    return {
      name: this.name,
      description: this.description,
      url: baseUrl,
      version: this.version,
      protocolVersion: '0.2.0',
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      skills: Array.from(this.skills.values()).map((s) => s.skill),
    };
  }

  /**
   * Dispatch a task targeting a registered skill ID.
   */
  public async sendTask(req: SendA2ATaskInput): Promise<A2ATask> {
    const registered = this.skills.get(req.skillId);
    if (!registered) {
      throw new Error(`Unknown A2A skill '${req.skillId}'`);
    }

    const now = new Date().toISOString();
    const task: A2ATask = {
      id: req.id ?? `task-${crypto.randomUUID().slice(0, 12)}`,
      skillId: req.skillId,
      status: 'submitted',
      input: req.input ?? {},
      metadata: req.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.persistAndNotify(task);
    task.status = 'working';
    task.updatedAt = new Date().toISOString();
    this.persistAndNotify(task);

    try {
      const output = await registered.handler(task.input, task);
      if (this.isTaskCanceled(task.id)) {
        return this.getTask(task.id) ?? task;
      }
      task.status = 'completed';
      task.output = output;
      task.updatedAt = new Date().toISOString();
      this.persistAndNotify(task);
      return task;
    } catch (err) {
      if (!this.isTaskCanceled(task.id)) {
        task.status = 'failed';
        task.error = (err as Error).message;
        task.updatedAt = new Date().toISOString();
        this.persistAndNotify(task);
      }
      return this.getTask(task.id) ?? task;
    }
  }

  private isTaskCanceled(id: string): boolean {
    return this.tasks.get(id)?.status === 'canceled';
  }

  /**
   * Retrieve task status and result by ID (falls back to SQLite storage when enabled).
   */
  public getTask(id: string): A2ATask | undefined {
    const inMem = this.tasks.get(id);
    if (inMem) return inMem;

    if (this.db) {
      const row = this.db
        .prepare<StoredA2ATaskRow>(
          `SELECT id, skill_id, status, input_json, output_json, error, metadata_json, created_at, updated_at
           FROM _centaury_a2a_tasks WHERE id = ?;`
        )
        .get(id);
      if (row) {
        const hydrated = rowToTask(row);
        this.tasks.set(id, hydrated);
        return hydrated;
      }
    }

    return undefined;
  }

  /**
   * List recent A2A tasks ordered newest first.
   */
  public listTasks(limit = 50): A2ATask[] {
    if (this.db) {
      const rows = this.db
        .prepare<StoredA2ATaskRow>(
          `SELECT id, skill_id, status, input_json, output_json, error, metadata_json, created_at, updated_at
           FROM _centaury_a2a_tasks ORDER BY rowid DESC LIMIT ?;`
        )
        .all(limit);
      return rows.map(rowToTask);
    }

    return Array.from(this.tasks.values()).reverse().slice(0, limit);
  }

  /**
   * Cancel a pending or active task if it has not finalized yet.
   */
  public cancelTask(id: string): A2ATask | null {
    const task = this.getTask(id);
    if (!task) return null;

    if (task.status === 'submitted' || task.status === 'working') {
      task.status = 'canceled';
      task.updatedAt = new Date().toISOString();
      this.persistAndNotify(task);
    }
    return task;
  }
}

/**
 * Installs A2A discovery, task lifecycle, list, and SSE event stream endpoints on a CentauryServer.
 */
export function a2aPlugin(options: A2AServerOptions): CentauryPlugin {
  const a2a = options.serverInstance ?? new CentauryA2AServer(options);

  return {
    name: 'centaury:a2a-protocol',
    version: CENTAURY_VERSION,
    install(server) {
      server.get('/.well-known/agent.json', (ctx) => {
        return ctx.jsonResponse(a2a.getAgentCard(ctx.url.origin));
      });

      server.get('/a2a/tasks', (ctx) => {
        const limitRaw = Number(ctx.url.searchParams.get('limit') || '50');
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50;
        const tasks = a2a.listTasks(limit);
        return ctx.jsonResponse({ count: tasks.length, tasks });
      });

      server.post('/a2a/tasks/send', async (ctx) => {
        const body = await ctx.json<SendA2ATaskInput>();
        if (!body || typeof body.skillId !== 'string' || !body.skillId.trim()) {
          return ctx.errorResponse('Validation Error', 400, "Missing required 'skillId' string");
        }

        try {
          const task = await a2a.sendTask(body);
          return ctx.jsonResponse(task);
        } catch (err) {
          return ctx.errorResponse('Skill Not Found', 404, (err as Error).message);
        }
      });

      server.get('/a2a/tasks/:id/events', (ctx) => {
        const taskId = ctx.params.id;
        const initial = a2a.getTask(taskId);
        if (!initial) {
          return ctx.errorResponse('Task Not Found', 404, `No A2A task with id '${taskId}'`);
        }

        const encoder = new TextEncoder();
        let unsub: (() => void) | null = null;

        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const emit = (task: A2ATask) => {
              controller.enqueue(encoder.encode(`event: task\ndata: ${JSON.stringify(task)}\n\n`));
            };

            emit(initial);
            if (isTerminalA2AStatus(initial.status)) {
              controller.close();
              return;
            }

            unsub = a2a.subscribe((updated) => {
              if (updated.id !== taskId) return;
              try {
                emit(updated);
                if (isTerminalA2AStatus(updated.status)) {
                  unsub?.();
                  unsub = null;
                  controller.close();
                }
              } catch {
                unsub?.();
                unsub = null;
              }
            });
          },
          cancel() {
            unsub?.();
            unsub = null;
          },
        });

        return ctx.sseResponse(stream);
      });

      server.get('/a2a/tasks/:id', (ctx) => {
        const task = a2a.getTask(ctx.params.id);
        if (!task) {
          return ctx.errorResponse('Task Not Found', 404, `No A2A task with id '${ctx.params.id}'`);
        }
        return ctx.jsonResponse(task);
      });

      server.post('/a2a/tasks/:id/cancel', (ctx) => {
        const task = a2a.cancelTask(ctx.params.id);
        if (!task) {
          return ctx.errorResponse('Task Not Found', 404, `No A2A task with id '${ctx.params.id}'`);
        }
        return ctx.jsonResponse(task);
      });
    },
  };
}
