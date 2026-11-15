/**
 * @file workflow.test.ts
 * @description Test suite for @rudyrustam/workflow (A2A Protocol Server & Durable Saga Engine)
 */

import { describe, it, expect } from 'bun:test';
import { CentauryServer } from '@rudyrustam/core';
import { CentauryDatabase } from '@rudyrustam/db';
import { CentauryA2AServer, a2aPlugin, CentauryWorkflowEngine } from '../src/index';

describe('@rudyrustam/workflow A2A Protocol & Durable Saga Engine', () => {
  it('exposes /.well-known/agent.json and handles A2A send, get, and cancel lifecycle', async () => {
    const a2a = new CentauryA2AServer({
      name: 'Centaury Coordinator Agent',
      description: 'Swarm agent exposing research & code verification skills',
      skills: [
        {
          id: 'summarize',
          name: 'Summarize Text',
          description: 'Summarizes an incoming text payload',
          tags: ['nlp'],
        },
        {
          id: 'slow_task',
          name: 'Slow Task',
          description: 'Simulates an interruptible long-running skill',
        },
      ],
    });

    a2a.registerSkill(
      { id: 'summarize', name: 'Summarize Text', description: 'Summarizes an incoming text payload' },
      (input) => {
        const data = input as { text: string };
        return { summary: data.text.slice(0, 12), wordCount: data.text.split(/\s+/).length };
      }
    );

    const server = new CentauryServer({ port: 0 });
    server.usePlugin(
      a2aPlugin({
        name: 'Centaury Coordinator Agent',
        description: 'A2A enabled node',
        serverInstance: a2a,
      })
    );

    const listener = server.listen();
    try {
      const cardRes = await fetch(`http://localhost:${listener.port}/.well-known/agent.json`);
      expect(cardRes.status).toBe(200);
      const card: any = await cardRes.json();
      expect(card.name).toBe('Centaury Coordinator Agent');
      expect(card.skills.some((s: any) => s.id === 'summarize')).toBe(true);

      const sendRes = await fetch(`http://localhost:${listener.port}/a2a/tasks/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'task-a2a-1',
          skillId: 'summarize',
          input: { text: 'Centaury A2A interoperability test payload' },
        }),
      });
      expect(sendRes.status).toBe(200);
      const task: any = await sendRes.json();
      expect(task.status).toBe('completed');
      expect(task.output.wordCount).toBe(5);

      const getRes = await fetch(`http://localhost:${listener.port}/a2a/tasks/task-a2a-1`);
      expect(getRes.status).toBe(200);
      expect(((await getRes.json()) as any).id).toBe('task-a2a-1');

      // Direct unit check on canceling a working task
      let resolvePending!: () => void;
      const pendingPromise = new Promise<void>((r) => {
        resolvePending = r;
      });
      a2a.registerSkill(
        { id: 'blocking_skill', name: 'Blocking', description: 'Waits for signal' },
        async () => {
          await pendingPromise;
          return { done: true };
        }
      );
      const runPromise = a2a.sendTask({ id: 'task-cancel-1', skillId: 'blocking_skill' });
      const cancelRes = await fetch(`http://localhost:${listener.port}/a2a/tasks/task-cancel-1/cancel`, {
        method: 'POST',
      });
      expect(cancelRes.status).toBe(200);
      expect(((await cancelRes.json()) as any).status).toBe('canceled');
      resolvePending();
      expect((await runPromise).status).toBe('canceled');
    } finally {
      server.stop();
    }
  });

  it('persists SQLite workflow checkpoints, replays completed steps, and runs Saga compensations in reverse order', async () => {
    const db = new CentauryDatabase({ path: ':memory:' });
    const engine = new CentauryWorkflowEngine({ db });

    try {
      // 1. Simulate interrupted workflow that completes step 1 + step 2, then resumes with step 3 added
      let step1Executions = 0;
      let step2Attempts = 0;

      const partialFlow = engine
        .createWorkflow<{ amount: number; stepsDone: string[] }>('order-fulfillment')
        .step('reserve_inventory', (ctx) => {
          step1Executions++;
          return { ...ctx, stepsDone: [...ctx.stepsDone, 'inventory'] };
        })
        .step(
          'charge_payment',
          (ctx) => {
            step2Attempts++;
            if (step2Attempts === 1) {
              throw new Error('Transient gateway timeout');
            }
            return { ...ctx, stepsDone: [...ctx.stepsDone, 'payment'] };
          },
          undefined,
          { retries: 1, backoffMs: 5 }
        );

      const firstRun = await partialFlow.run('run-001', { amount: 150, stepsDone: [] });
      expect(firstRun.status).toBe('completed');
      expect(firstRun.executedSteps).toEqual(['reserve_inventory', 'charge_payment']);
      expect(step1Executions).toBe(1);
      expect(step2Attempts).toBe(2);

      // Resume same runId with step 3 appended -> step 1 & 2 must replay without re-executing
      const resumedFlow = partialFlow.step('dispatch_shipment', (ctx) => ({
        ...ctx,
        stepsDone: [...ctx.stepsDone, 'shipped'],
      }));

      const secondRun = await resumedFlow.run('run-001', { amount: 150, stepsDone: [] });
      expect(secondRun.status).toBe('completed');
      expect(secondRun.replayedSteps).toEqual(['reserve_inventory', 'charge_payment']);
      expect(secondRun.executedSteps).toEqual(['dispatch_shipment']);
      expect(step1Executions).toBe(1);
      expect(secondRun.context.stepsDone).toEqual(['inventory', 'payment', 'shipped']);

      // 2. Verify reverse-order Saga compensation when a later step fails permanently
      const rollbackLog: string[] = [];
      const sagaFlow = engine
        .createWorkflow<{ txId: string }>('payment-saga')
        .step(
          'lock_funds',
          (ctx) => ctx,
          () => {
            rollbackLog.push('unlock_funds');
          }
        )
        .step(
          'allocate_gpu',
          (ctx) => ctx,
          () => {
            rollbackLog.push('release_gpu');
          }
        )
        .step('finalize_settlement', () => {
          throw new Error('Downstream bank rejected settlement');
        });

      const failedRun = await sagaFlow.run('run-saga-err', { txId: 'tx-99' });
      expect(failedRun.status).toBe('compensated');
      expect(failedRun.failedStep).toBe('finalize_settlement');
      expect(failedRun.error).toContain('Downstream bank rejected settlement');
      expect(failedRun.compensatedSteps).toEqual(['allocate_gpu', 'lock_funds']);
      expect(rollbackLog).toEqual(['release_gpu', 'unlock_funds']);
    } finally {
      db.close();
    }
  });
});
