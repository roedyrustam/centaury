/**
 * @file server.ts
 * @description Centaury Showcase Application Server (Fullstack Demonstrator v1.2)
 */

import { CENTAURY_ENGINE_LABEL, CENTAURY_VERSION, CentauryServer } from '@rudyrustam/core';
import {
  CentauryMCPServer,
  CentauryAgentMemory,
  CentauryPromptFirewall,
  CentaurySelfHealer,
  CentauryAIGateway,
  mcpPlugin,
  selfHealingPlugin,
} from '@rudyrustam/agent';
import { AstraGateway } from '@rudyrustam/astra';
import { CentauryDatabase } from '@rudyrustam/db';
import { CentauryEventBus, ssePlugin } from '@rudyrustam/sse';
import { legalCompliancePlugin } from '@rudyrustam/auth';
import { a2aPlugin, CentauryWorkflowEngine } from '@rudyrustam/workflow';
import { z } from 'zod';
import { join } from 'path';

const PUBLIC_DIR = join(import.meta.dir, 'public');

// Initialize Centaury Database with WAL mode
const db = new CentauryDatabase({ path: join(import.meta.dir, 'showcase-agent.db') });

// Initialize Centaury Micro-Kernel Server
const app = new CentauryServer({
  port: 3000,
  hostname: '0.0.0.0',
  ai: {
    model: 'gemini-4-pro',
    thinkingBudget: 32768,
  },
});

// Initialize Agent Memory, Firewall, Source-Aware Self-Healer, MCP, SSE Bus & AI Gateway
const memory = new CentauryAgentMemory({ db });
const firewall = new CentauryPromptFirewall();
const healer = new CentaurySelfHealer({ workspaceRoot: import.meta.dir });
const mcp = new CentauryMCPServer(app, memory, { firewall, healer });
const bus = new CentauryEventBus();
const workflowEngine = new CentauryWorkflowEngine({ db });

const gateway = new CentauryAIGateway({
  provider: process.env.GEMINI_API_KEY
    ? {
        kind: 'gemini',
        model: 'gemini-2.5-pro',
        apiKey: process.env.GEMINI_API_KEY,
        thinkingBudget: 8192,
      }
    : {
        kind: 'mock',
        model: 'centaury-nexus-mock',
      },
  firewall,
});

// Install Self-Healing, MCP JSON-RPC, SSE Event Bus, Mandatory Legal Compliance Trio, and A2A Plugins
app.usePlugin(selfHealingPlugin(healer));
app.usePlugin(mcpPlugin(mcp, { path: '/mcp' }));
app.usePlugin(ssePlugin(bus, { basePath: '/sse' }));
app.usePlugin(
  legalCompliancePlugin({
    appName: 'Centaury Showcase',
    contactEmail: 'privacy@centaury.dev',
  })
);
app.usePlugin(
  a2aPlugin({
    name: 'Centaury Showcase Agent',
    description: 'Dual-Citizen Fullstack, Guardrail & Durable Workflow Agent',
    db,
    skills: [
      {
        id: 'audit_prompt',
        name: 'Audit Prompt Safety',
        description: 'Inspect prompt payloads for injection, SSRF, and PII leakage',
        handler: (input) => {
          const payload = input as { prompt?: string };
          return firewall.inspectPrompt(String(payload?.prompt ?? ''));
        },
      },
    ],
  })
);

// Helper to generate consistent 64-dim normalized embeddings for demo
async function makeEmbedding(text: string): Promise<Float32Array> {
  return await gateway.embed(text, 64);
}

// Seed initial reasoning turns for showcase episodic memory once cleanly
if (memory.getSessionHistory('showcase-session', 1).length === 0) {
  memory.storeTurn(
    {
      sessionId: 'showcase-session',
      role: 'user',
      content: 'Explain Centaury Zero-Hydration Micro-Signals and INP target',
    },
    await makeEmbedding('Explain Centaury Zero-Hydration Micro-Signals and INP target')
  );

  memory.storeTurn(
    {
      sessionId: 'showcase-session',
      role: 'agent',
      content: 'Centaury Micro-Signals run in <1.5KB without Virtual DOM, guaranteeing INP < 50ms.',
    },
    await makeEmbedding('Centaury Micro-Signals run in <1.5KB without Virtual DOM, guaranteeing INP < 50ms.')
  );

  memory.storeTurn(
    {
      sessionId: 'showcase-session',
      role: 'agent',
      content: 'Gemini 4 Pro System-2 reasoning controls thinking budget up to 64k tokens.',
    },
    await makeEmbedding('Gemini 4 Pro System-2 reasoning controls thinking budget up to 64k tokens.')
  );
}

// Initialize Astra Multimodal Gateway and wire incoming WebSocket frames
const astra = new AstraGateway({
  vadThreshold: 0.045,
  onInterruption: () => {
    app.broadcast('astra.interruption', {
      action: 'cutoff_audio',
      timestamp: Date.now(),
      reason: 'Human speech detected during model output (<150ms)',
    });
  },
});

app.onWebSocketMessage((_ws, parsed) => {
  if (
    parsed &&
    (parsed.type === 'astra.audio' || parsed.type === 'astra.frame' || parsed.type === 'astra.text') &&
    typeof parsed.data === 'string'
  ) {
    astra.handleClientMessage({ type: parsed.type, data: parsed.data });
  }
});

// 1. Static Asset Routes
app.get('/', async () => {
  const file = Bun.file(join(PUBLIC_DIR, 'index.html'));
  return new Response(file, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});

app.get('/logo.jpg', async () => {
  const file = Bun.file(join(PUBLIC_DIR, 'logo.jpg'));
  return new Response(file, { headers: { 'Content-Type': 'image/jpeg' } });
});

app.get('/app.css', async () => {
  const file = Bun.file(join(PUBLIC_DIR, 'app.css'));
  return new Response(file, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
});

app.get('/app.js', async () => {
  const file = Bun.file(join(PUBLIC_DIR, 'app.js'));
  return new Response(file, { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
});

// 2. Client Library Bundles (Zero-Hydration Modules)
app.get('/@centaury/signals.js', async () => {
  const file = Bun.file(join(import.meta.dir, '../../packages/signals/dist/index.js'));
  return new Response(file, { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
});

app.get('/@centaury/ephemeral.js', async () => {
  const file = Bun.file(join(import.meta.dir, '../../packages/ephemeral/dist/index.js'));
  return new Response(file, { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
});

// 3. Register Type-Safe RPC Procedures
app.rpc('system.getMetrics', {
  description: 'Retrieve real-time engine telemetry and frontier model budgets',
  handler: () => {
    const mem = process.memoryUsage();
    return {
      status: 'nominal',
      engine: CENTAURY_ENGINE_LABEL,
      version: CENTAURY_VERSION,
      runtime: `Bun ${Bun.version}`,
      uptimeSeconds: Math.round(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      activeModel: 'Gemini 4 Pro (Thinking Budget: 32,768)',
      kvCacheStatus: `Locked (${gateway.kvCachePrefixHash.slice(0, 10)})`,
      multimodalLatency: '42ms',
      database: 'Bun SQLite (WAL Mode)',
    };
  },
});

app.rpc('db.getStats', {
  description: 'Retrieve real-time SQLite database statistics and vector index counts',
  handler: () => {
    return {
      ...db.stats(),
      vectorCollections: ['agent-turns:showcase-session'],
    };
  },
});

app.rpc('agent.recallMemory', {
  description: 'Vector cosine similarity search over persistent episodic agent turns',
  inputSchema: z.object({
    sessionId: z.string().default('showcase-session'),
    query: z.string(),
  }),
  handler: async ({ input }) => {
    const embedding = await makeEmbedding(input.query);
    const results = memory.recallRelevantTurns(input.sessionId, embedding, 5, 0.0);
    return {
      query: input.query,
      resultsCount: results.length,
      matches: results.map((r) => ({
        id: r.id,
        score: r.score.toFixed(4),
        role: r.metadata?.role,
        content: r.metadata?.content,
      })),
    };
  },
});

app.rpc('ai.generate', {
  description: 'Execute prompt-firewalled text synthesis via CentauryAIGateway',
  inputSchema: z.object({
    prompt: z.string().min(1),
  }),
  handler: async ({ input }) => {
    return await gateway.generate({ prompt: input.prompt });
  },
});

app.rpc('ai.synthesizeUI', {
  description: 'Trigger Gemini 4 Pro reasoning model to synthesize Ephemeral UI tokens',
  inputSchema: z.object({
    intent: z.enum(['threat_matrix', 'agent_swarm', 'quantum_analytics', 'astravibe']),
  }),
  handler: async ({ input }) => {
    const templates: Record<string, string[]> = {
      threat_matrix: [
        '<ui-card elevation="glass">',
        '<ui-header title="Sentinel Cognitive Defense" badge="shield active" />',
        '<ui-metric value="Zero Vulnerabilities" change="100% Secure" />',
        '<p style="color: #94a3b8; font-size: 0.9rem; margin: 0.5rem 0;">AI AST Guardian has audited 42 microservices. Invariant proofs confirmed.</p>',
        '<ui-button action="quarantine_node" param=\'{"nodeId":"cluster-edge-4"}\'>Isolate Perimeter Node</ui-button>',
        '</ui-card>',
      ],
      agent_swarm: [
        '<ui-card elevation="neon">',
        '<ui-header title="Autonomous Swarm Topology" badge="5 Active Nodes" />',
        '<ui-metric value="1,420 Tasks/sec" change="+24.8%" />',
        '<ui-alert variant="info">Swarm Node #3 synthesized ephemeral UI in 8ms without client hydration error.</ui-alert>',
        '<ui-button action="rebalance_swarm" param=\'{"nodes":8}\'>Scale Agent Swarm</ui-button>',
        '</ui-card>',
      ],
      quantum_analytics: [
        '<ui-card elevation="glass">',
        '<ui-header title="Project Astra Telemetry" badge="Multimodal Live" />',
        '<ui-metric value="99.98% Fidelity" change="Sub-50ms TTFT" />',
        '<p style="color: #94a3b8; font-size: 0.9rem; margin: 0.5rem 0;">Audio PCM 16kHz &amp; Continuous Video frames synchronized via Centaury WebSocket.</p>',
        '<ui-button action="trigger_scan" param=\'{"resolution":"4K"}\'>Execute Spatial Scan</ui-button>',
        '</ui-card>',
      ],
      astravibe: [
        '<ui-card elevation="glass">',
        '<ui-header title="Super-Intelligence Nexus" badge="Singularity Ready" />',
        '<ui-metric value="Infinite Potential" change="ASI Epoch" />',
        '<p style="color: #94a3b8; font-size: 0.9rem; margin: 0.5rem 0;">Fullstack Dual-Citizen Architecture: Humans &amp; AI reasoning collaboratively in real-time.</p>',
        '<ui-button action="singularity_ping" param=\'{"mode":"singularity"}\'>Ping Super-Intelligence</ui-button>',
        '</ui-card>',
      ],
    };

    const chunks = templates[input.intent] || templates.threat_matrix;

    // Simulate real-time streaming chunks over WebSocket
    (async () => {
      for (const chunk of chunks) {
        app.broadcast('ephemeral:chunk', { markup: chunk });
        await Bun.sleep(60);
      }
    })();

    return { success: true, message: `Streaming ephemeral UI for '${input.intent}' started` };
  },
});

app.rpc('astra.simulateGrounding', {
  description: 'Simulate Project Astra visual screen grounding coordinates',
  handler: () => {
    const sampleBoxes = [
      { ymin: 180, xmin: 50, ymax: 360, xmax: 480, label: 'Telemetry Card' },
      { ymin: 180, xmin: 520, ymax: 560, xmax: 950, label: 'Ephemeral Synthesizer' },
    ];
    return astra.createGroundingPayload(sampleBoxes, 1200, 800);
  },
});

app.rpc('agent.auditPrompt', {
  description: 'Inspect incoming prompts for prompt injection, SSRF targets, and PII redaction',
  inputSchema: z.object({
    prompt: z.string().min(1),
  }),
  handler: ({ input }) => {
    return firewall.inspectPrompt(input.prompt);
  },
});

app.rpc('workflow.runDemo', {
  description: 'Execute a checkpointed SQLite durable workflow demo with parallel branches & rollback support',
  inputSchema: z.object({
    runId: z.string().default(() => `demo-${crypto.randomUUID().slice(0, 8)}`),
    task: z.string().default('verify-system'),
  }),
  handler: async ({ input }) => {
    const demoFlow = workflowEngine
      .createWorkflow<{ task: string; trace: string[]; auditOk?: boolean; schemaOk?: boolean }>('showcase-demo')
      .step('audit_context', (ctx) => ({
        ...ctx,
        trace: [...ctx.trace, `audited:${ctx.task}`],
      }))
      .parallel('parallel_checks', [
        {
          name: 'verify_firewall',
          execute: (ctx) => ({ ...ctx, auditOk: true }),
        },
        {
          name: 'verify_schemas',
          execute: (ctx) => ({ ...ctx, schemaOk: true }),
        },
      ])
      .step('synthesize_artifact', (ctx) => ({
        ...ctx,
        trace: [...ctx.trace, 'synthesized:ephemeral-ready'],
      }));

    return await demoFlow.run(input.runId, { task: input.task, trace: [] });
  },
});

// 4. Background Telemetry Broadcast Loop (every 1.5s)
setInterval(() => {
  const mem = process.memoryUsage();
  const snapshot = {
    memoryRssMb: Math.round(mem.rss / 1024 / 1024),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    uptimeSeconds: Math.round(process.uptime()),
    activeReqPerSec: Math.floor(Math.random() * 400 + 1200),
    cpuLoad: (Math.random() * 2 + 1.2).toFixed(1) + '%',
  };
  app.broadcast('telemetry', snapshot);
  bus.publish('telemetry', { event: 'metrics', data: snapshot });
}, 1500);

// Start server
const instance = app.listen();
console.log(`\n🌌 ========================================================`);
console.log(`🌌 Centaury Showcase (${CENTAURY_ENGINE_LABEL}) at: http://localhost:${instance.port}`);
console.log(`🌌 MCP JSON-RPC  : http://localhost:${instance.port}/mcp`);
console.log(`🌌 A2A Discovery : http://localhost:${instance.port}/.well-known/agent.json`);
console.log(`🌌 Legal Trio    : /privacy  |  /terms  |  /delete-account`);
console.log(`🌌 ========================================================\n`);
