/**
 * @file saga.ts
 * @description SQLite-backed Durable Workflow Execution, Parallel Fan-Out & Reverse-Order Saga Compensation Engine
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

export interface ParallelBranchDefinition<TContext> {
  name: string;
  execute: StepExecutor<TContext>;
  compensate?: StepCompensator<TContext>;
  options?: WorkflowStepOptions;
}

export type WorkflowExecutionItem<TContext> =
  | { kind: 'step'; step: WorkflowStepDefinition<TContext> }
  | { kind: 'parallel'; groupName: string; branches: Array<WorkflowStepDefinition<TContext>> };

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

export interface WorkflowCheckpointRecord {
  runId: string;
  workflowName: string;
  stepName: string;
  status: string;
  updatedAt: string;
}

interface StoredStepCheckpoint {
  step_name: string;
  status: string;
  context_json: string;
  updated_at?: string;
}

/**
 * Fluent builder for durable, checkpointed, parallel-capable, compensatable multi-step workflows.
 */
export class CentauryWorkflowBuilder<TContext extends Record<string, unknown>> {
  private readonly items: Array<WorkflowExecutionItem<TContext>> = [];

  constructor(
    private readonly engine: CentauryWorkflowEngine,
    public readonly workflowName: string
  ) {}

  /**
   * Append a sequential durable workflow step with optional compensation callback and retry policy.
   */
  public step(
    name: string,
    execute: StepExecutor<TContext>,
    compensate?: StepCompensator<TContext>,
    options: WorkflowStepOptions = {}
  ): this {
    this.items.push({
      kind: 'step',
      step: { name, execute, compensate, options },
    });
    return this;
  }

  /**
   * Append a concurrent fan-out group of durable branches with independent checkpoints and Saga rollback.
   */
  public parallel(groupName: string, branches: Array<ParallelBranchDefinition<TContext>>): this {
    this.items.push({
      kind: 'parallel',
      groupName,
      branches: branches.map((b) => ({
        name: b.name,
        execute: b.execute,
        compensate: b.compensate,
        options: b.options ?? {},
      })),
    });
    return this;
  }

  /**
   * Execute or deterministically resume a workflow instance for a given runId.
   */
  public async run(runId: string, initialContext: TContext): Promise<WorkflowRunResult<TContext>> {
    return await this.engine.executeWorkflow(this.workflowName, this.items, runId, initialContext);
  }
}

/**
 * Orchestrates durable workflow runs with SQLite checkpoint replay, parallel fan-out, and Saga rollback.
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
          'SELECT step_name, status, context_json, updated_at FROM _centaury_workflow_steps WHERE run_id = ? AND workflow_name = ?'
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
    runMap.set(stepName, { step_name: stepName, status, context_json: contextJson, updated_at: updatedAt });
  }

  private async runWithRetries<TContext extends Record<string, unknown>>(
    step: WorkflowStepDefinition<TContext>,
    baseContext: TContext
  ): Promise<{ succeeded: boolean; nextContext: TContext; error?: Error }> {
    const maxAttempts = 1 + Math.max(0, step.options.retries ?? 0);
    const backoffMs = step.options.backoffMs ?? 10;
    let lastError: Error | undefined;
    let nextContext: TContext = { ...baseContext };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const updated = await step.execute(nextContext);
        if (updated && typeof updated === 'object') {
          nextContext = { ...updated };
        }
        return { succeeded: true, nextContext };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts && backoffMs > 0) {
          await Bun.sleep(backoffMs * attempt);
        }
      }
    }

    return { succeeded: false, nextContext, error: lastError ?? new Error('Workflow step failed') };
  }

  private async runCompensations<TContext extends Record<string, unknown>>(
    runId: string,
    workflowName: string,
    stack: Array<{ checkpointName: string; step: WorkflowStepDefinition<TContext> }>,
    currentContext: TContext
  ): Promise<string[]> {
    const compensatedSteps: string[] = [];
    for (let i = stack.length - 1; i >= 0; i--) {
      const entry = stack[i];
      if (entry.step.compensate) {
        await entry.step.compensate(currentContext);
        compensatedSteps.push(entry.checkpointName);
      }
      this.saveCheckpoint(runId, workflowName, entry.checkpointName, 'compensated', currentContext);
    }
    return compensatedSteps;
  }

  /**
   * Inspect persisted checkpoint history for a given runId.
   */
  public getRunHistory(runId: string, workflowName?: string): WorkflowCheckpointRecord[] {
    if (this.db) {
      const rows = workflowName
        ? this.db
            .prepare<{ run_id: string; workflow_name: string; step_name: string; status: string; updated_at: string }>(
              'SELECT run_id, workflow_name, step_name, status, updated_at FROM _centaury_workflow_steps WHERE run_id = ? AND workflow_name = ? ORDER BY rowid ASC'
            )
            .all(runId, workflowName)
        : this.db
            .prepare<{ run_id: string; workflow_name: string; step_name: string; status: string; updated_at: string }>(
              'SELECT run_id, workflow_name, step_name, status, updated_at FROM _centaury_workflow_steps WHERE run_id = ? ORDER BY rowid ASC'
            )
            .all(runId);

      return rows.map((r) => ({
        runId: r.run_id,
        workflowName: r.workflow_name,
        stepName: r.step_name,
        status: r.status,
        updatedAt: r.updated_at,
      }));
    }

    const out: WorkflowCheckpointRecord[] = [];
    for (const [key, map] of this.memoryCheckpoints.entries()) {
      const [wf, rId] = key.split('::');
      if (rId !== runId) continue;
      if (workflowName && wf !== workflowName) continue;
      for (const cp of map.values()) {
        out.push({
          runId: rId,
          workflowName: wf,
          stepName: cp.step_name,
          status: cp.status,
          updatedAt: cp.updated_at ?? '',
        });
      }
    }
    return out;
  }

  /**
   * Execute workflow steps & parallel groups with checkpoint replay, retries, and reverse Saga compensation.
   */
  public async executeWorkflow<TContext extends Record<string, unknown>>(
    workflowName: string,
    rawItems: Array<WorkflowStepDefinition<TContext> | WorkflowExecutionItem<TContext>>,
    runId: string,
    initialContext: TContext
  ): Promise<WorkflowRunResult<TContext>> {
    const items: Array<WorkflowExecutionItem<TContext>> = rawItems.map((entry) =>
      'kind' in entry ? entry : { kind: 'step', step: entry }
    );

    const checkpoints = this.loadCheckpoints(runId, workflowName);
    let currentContext: TContext = { ...initialContext };

    const completedSteps: string[] = [];
    const replayedSteps: string[] = [];
    const executedSteps: string[] = [];
    const compensatableStack: Array<{ checkpointName: string; step: WorkflowStepDefinition<TContext> }> = [];

    for (const item of items) {
      if (item.kind === 'step') {
        const step = item.step;
        const existing = checkpoints.get(step.name);
        if (existing?.status === 'completed') {
          const saved = JSON.parse(existing.context_json) as Partial<TContext>;
          currentContext = { ...currentContext, ...saved };
          completedSteps.push(step.name);
          replayedSteps.push(step.name);
          compensatableStack.push({ checkpointName: step.name, step });
          continue;
        }

        const outcome = await this.runWithRetries(step, currentContext);
        currentContext = outcome.nextContext;

        if (outcome.succeeded) {
          this.saveCheckpoint(runId, workflowName, step.name, 'completed', currentContext);
          completedSteps.push(step.name);
          executedSteps.push(step.name);
          compensatableStack.push({ checkpointName: step.name, step });
        } else {
          this.saveCheckpoint(runId, workflowName, step.name, 'failed', currentContext);
          const compensatedSteps = await this.runCompensations(
            runId,
            workflowName,
            compensatableStack,
            currentContext
          );
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
            error: outcome.error?.message ?? 'Workflow step failed',
          };
        }
      } else {
        // Parallel fan-out branch group
        const pendingBranches: Array<{ checkpointName: string; step: WorkflowStepDefinition<TContext> }> = [];
        for (const branch of item.branches) {
          const cpName = `${item.groupName}:${branch.name}`;
          const existing = checkpoints.get(cpName);
          if (existing?.status === 'completed') {
            const saved = JSON.parse(existing.context_json) as Partial<TContext>;
            currentContext = { ...currentContext, ...saved };
            completedSteps.push(cpName);
            replayedSteps.push(cpName);
            compensatableStack.push({ checkpointName: cpName, step: branch });
          } else {
            pendingBranches.push({ checkpointName: cpName, step: branch });
          }
        }

        if (pendingBranches.length > 0) {
          const baseSnapshot: TContext = { ...currentContext };
          const branchResults = await Promise.all(
            pendingBranches.map(async (entry) => ({
              entry,
              outcome: await this.runWithRetries(entry.step, baseSnapshot),
            }))
          );

          let firstFailure: { checkpointName: string; error?: Error } | null = null;
          for (const { entry, outcome } of branchResults) {
            if (outcome.succeeded) {
              const delta: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(outcome.nextContext)) {
                if (v !== baseSnapshot[k]) {
                  delta[k] = v;
                }
              }
              currentContext = { ...currentContext, ...(delta as Partial<TContext>) };
              this.saveCheckpoint(runId, workflowName, entry.checkpointName, 'completed', delta);
              completedSteps.push(entry.checkpointName);
              executedSteps.push(entry.checkpointName);
              compensatableStack.push(entry);
            } else if (!firstFailure) {
              firstFailure = { checkpointName: entry.checkpointName, error: outcome.error };
            }
          }

          if (firstFailure) {
            this.saveCheckpoint(runId, workflowName, firstFailure.checkpointName, 'failed', currentContext);
            const compensatedSteps = await this.runCompensations(
              runId,
              workflowName,
              compensatableStack,
              currentContext
            );
            return {
              status: 'compensated',
              runId,
              workflowName,
              context: currentContext,
              completedSteps,
              replayedSteps,
              executedSteps,
              compensatedSteps,
              failedStep: firstFailure.checkpointName,
              error: firstFailure.error?.message ?? 'Parallel workflow branch failed',
            };
          }
        }
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
      compensatedSteps: [],
    };
  }
}
