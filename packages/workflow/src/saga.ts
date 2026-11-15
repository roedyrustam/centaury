/**
 * @file saga.ts
 * @description SQLite-backed Durable Workflow Execution & Reverse-Order Saga Compensation Engine
 */

import type { CentauryDatabase } from '@rudyrustam/db';

export interface WorkflowEngineOptions {
  db?: CentauryDatabase;
}

export interface WorkflowStepOptions {
  retries?: number;
  backoffMs?: number;
}

export type StepExecutor<TContext> = (ctx: TContext) => TContext | void | Promise<TContext | void>;
export type StepCompensator<TContext> = (ctx: TContext) => void | Promise<void>;

export interface WorkflowStepDefinition<TContext> {
  name: string;
  execute: StepExecutor<TContext>;
  compensate?: StepCompensator<TContext>;
  options: WorkflowStepOptions;
}

export interface WorkflowRunResult<TContext> {
  status: 'completed' | 'compensated';
  runId: string;
  workflowName: string;
  context: TContext;
  completedSteps: string[];
  replayedSteps: string[];
  executedSteps: string[];
  compensatedSteps: string[];
  failedStep?: string;
  error?: string;
}

interface StoredStepCheckpoint {
  step_name: string;
  status: string;
  context_json: string;
}

/**
 * Fluent builder for durable, checkpointed, compensatable multi-step workflows.
 */
export class CentauryWorkflowBuilder<TContext extends Record<string, unknown>> {
  private readonly steps: Array<WorkflowStepDefinition<TContext>> = [];

  constructor(
    private readonly engine: CentauryWorkflowEngine,
    public readonly workflowName: string
  ) {}

  /**
   * Append a durable workflow step with optional compensation callback and retry policy.
   */
  public step(
    name: string,
    execute: StepExecutor<TContext>,
    compensate?: StepCompensator<TContext>,
    options: WorkflowStepOptions = {}
  ): this {
    this.steps.push({ name, execute, compensate, options });
    return this;
  }

  /**
   * Execute or deterministically resume a workflow instance for a given runId.
   */
  public async run(runId: string, initialContext: TContext): Promise<WorkflowRunResult<TContext>> {
    return await this.engine.executeWorkflow(this.workflowName, this.steps, runId, initialContext);
  }
}

/**
 * Orchestrates durable workflow runs with SQLite checkpoint replay and Saga rollback.
 */
export class CentauryWorkflowEngine {
  private readonly db?: CentauryDatabase;
  private readonly memoryCheckpoints = new Map<string, Map<string, StoredStepCheckpoint>>();

  constructor(options: WorkflowEngineOptions = {}) {
    this.db = options.db;
    if (this.db) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS _centaury_workflow_steps (
          run_id TEXT NOT NULL,
          workflow_name TEXT NOT NULL,
          step_name TEXT NOT NULL,
          status TEXT NOT NULL,
          context_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (run_id, workflow_name, step_name)
        );
      `);
    }
  }

  /**
   * Create a new workflow definition bound to this durable engine.
   */
  public createWorkflow<TContext extends Record<string, unknown>>(
    workflowName: string
  ): CentauryWorkflowBuilder<TContext> {
    return new CentauryWorkflowBuilder<TContext>(this, workflowName);
  }

  private loadCheckpoints(runId: string, workflowName: string): Map<string, StoredStepCheckpoint> {
    if (this.db) {
      const rows = this.db
        .prepare<StoredStepCheckpoint>(
          'SELECT step_name, status, context_json FROM _centaury_workflow_steps WHERE run_id = ? AND workflow_name = ?'
        )
        .all(runId, workflowName);
      return new Map(rows.map((r) => [r.step_name, r]));
    }

    const key = `${workflowName}::${runId}`;
    return new Map(this.memoryCheckpoints.get(key) ?? []);
  }

  private saveCheckpoint(
    runId: string,
    workflowName: string,
    stepName: string,
    status: string,
    context: unknown
  ): void {
    const contextJson = JSON.stringify(context);
    const updatedAt = new Date().toISOString();

    if (this.db) {
      this.db
        .prepare(
          `INSERT INTO _centaury_workflow_steps (run_id, workflow_name, step_name, status, context_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(run_id, workflow_name, step_name) DO UPDATE SET
             status = excluded.status,
             context_json = excluded.context_json,
             updated_at = excluded.updated_at`
        )
        .run(runId, workflowName, stepName, status, contextJson, updatedAt);
      return;
    }

    const key = `${workflowName}::${runId}`;
    let runMap = this.memoryCheckpoints.get(key);
    if (!runMap) {
      runMap = new Map();
      this.memoryCheckpoints.set(key, runMap);
    }
    runMap.set(stepName, { step_name: stepName, status, context_json: contextJson });
  }

  /**
   * Execute workflow steps with checkpoint replay, retries, and reverse Saga compensation.
   */
  public async executeWorkflow<TContext extends Record<string, unknown>>(
    workflowName: string,
    steps: Array<WorkflowStepDefinition<TContext>>,
    runId: string,
    initialContext: TContext
  ): Promise<WorkflowRunResult<TContext>> {
    const checkpoints = this.loadCheckpoints(runId, workflowName);
    let currentContext: TContext = { ...initialContext };

    const completedSteps: string[] = [];
    const replayedSteps: string[] = [];
    const executedSteps: string[] = [];
    const compensatedSteps: string[] = [];
    const compensatableStack: Array<WorkflowStepDefinition<TContext>> = [];

    for (const step of steps) {
      const existing = checkpoints.get(step.name);
      if (existing?.status === 'completed') {
        const saved = JSON.parse(existing.context_json) as Partial<TContext>;
        currentContext = { ...currentContext, ...saved };
        completedSteps.push(step.name);
        replayedSteps.push(step.name);
        compensatableStack.push(step);
        continue;
      }

      const maxAttempts = 1 + Math.max(0, step.options.retries ?? 0);
      const backoffMs = step.options.backoffMs ?? 10;
      let lastError: Error | null = null;
      let succeeded = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const updated = await step.execute(currentContext);
          if (updated && typeof updated === 'object') {
            currentContext = { ...updated };
          }
          succeeded = true;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxAttempts && backoffMs > 0) {
            await Bun.sleep(backoffMs * attempt);
          }
        }
      }

      if (succeeded) {
        this.saveCheckpoint(runId, workflowName, step.name, 'completed', currentContext);
        completedSteps.push(step.name);
        executedSteps.push(step.name);
        compensatableStack.push(step);
      } else {
        this.saveCheckpoint(runId, workflowName, step.name, 'failed', currentContext);

        for (let i = compensatableStack.length - 1; i >= 0; i--) {
          const completedStep = compensatableStack[i];
          if (completedStep.compensate) {
            await completedStep.compensate(currentContext);
            compensatedSteps.push(completedStep.name);
          }
          this.saveCheckpoint(runId, workflowName, completedStep.name, 'compensated', currentContext);
        }

        return {
          status: 'compensated',
          runId,
          workflowName,
          context: currentContext,
          completedSteps,
          replayedSteps,
          executedSteps,
          compensatedSteps,
          failedStep: step.name,
          error: lastError?.message ?? 'Workflow step failed',
        };
      }
    }

    return {
      status: 'completed',
      runId,
      workflowName,
      context: currentContext,
      completedSteps,
      replayedSteps,
      executedSteps,
      compensatedSteps,
    };
  }
}
