/**
 * @file a2a.ts
 * @description Agent-to-Agent (A2A) Protocol Agent Card & Task Lifecycle Server for Centaury
 */

import type { CentauryPlugin } from '@rudyrustam/core';

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
  serverInstance?: CentauryA2AServer;
}

export interface SendA2ATaskInput {
  id?: string;
  skillId: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Manages A2A Agent Card discovery and asynchronous/synchronous task execution.
 */
export class CentauryA2AServer {
  private readonly name: string;
  private readonly description: string;
  private readonly version: string;
  private readonly defaultUrl: string;
  private readonly skills = new Map<string, A2ARegisteredSkill>();
  private readonly tasks = new Map<string, A2ATask>();

  constructor(options: A2AServerOptions) {
    this.name = options.name;
    this.description = options.description;
    this.version = options.version ?? '1.1.0-alpha';
    this.defaultUrl = options.url ?? 'http://localhost:3000';

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

    this.tasks.set(task.id, task);
    task.status = 'working';
    task.updatedAt = new Date().toISOString();

    try {
      const output = await registered.handler(task.input, task);
      if (this.isTaskCanceled(task.id)) {
        return task;
      }
      task.status = 'completed';
      task.output = output;
      task.updatedAt = new Date().toISOString();
      return task;
    } catch (err) {
      if (!this.isTaskCanceled(task.id)) {
        task.status = 'failed';
        task.error = (err as Error).message;
        task.updatedAt = new Date().toISOString();
      }
      return task;
    }
  }

  private isTaskCanceled(id: string): boolean {
    return this.tasks.get(id)?.status === 'canceled';
  }

  /**
   * Retrieve task status and result by ID.
   */
  public getTask(id: string): A2ATask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Cancel a pending or active task if it has not finalized yet.
   */
  public cancelTask(id: string): A2ATask | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    if (task.status === 'submitted' || task.status === 'working') {
      task.status = 'canceled';
      task.updatedAt = new Date().toISOString();
    }
    return task;
  }
}

/**
 * Installs A2A discovery and task lifecycle HTTP endpoints on a CentauryServer.
 */
export function a2aPlugin(options: A2AServerOptions): CentauryPlugin {
  const a2a = options.serverInstance ?? new CentauryA2AServer(options);

  return {
    name: 'centaury:a2a-protocol',
    version: '1.1.0',
    install(server) {
      server.get('/.well-known/agent.json', (ctx) => {
        return ctx.jsonResponse(a2a.getAgentCard(ctx.url.origin));
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
