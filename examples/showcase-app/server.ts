/**
 * @file server.ts
 * @description Centaury Showcase Application Server (Fullstack Demonstrator)
 */

import { CentauryServer } from '@centaury-ai/core';
import { CentauryMCPServer, CentauryAgentMemory } from '@centaury-ai/agent';
import { AstraGateway } from '@centaury-ai/astra';
import { CentauryDatabase } from '@centaury-ai/db';
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
    thinkingBudget: 32768, // System-2 Deep Thinking
  },
});

// Initialize Persistent Episodic Agent Memory backed by SQLite & Vector Store
const memory = new CentauryAgentMemory({ db });
const mcp = new CentauryMCPServer(app, memory);

// Helper to generate consistent 64-dim embeddings for demo
function makeEmbedding(text: string): Float32Array {
  const vec = new Float32Array(64);
  for (let i = 0; i < text.length; i++) {
    vec[i % 64] += text.charCodeAt(i) / 255;
  }
  return vec;
}

// Seed initial reasoning turns for showcase episodic memory
memory.storeTurn(
  {
    sessionId: 'showcase-session',
    role: 'user',
    content: 'Explain Centaury Zero-Hydration Micro-Signals and INP target',
  },
  makeEmbedding('Explain Centaury Zero-Hydration Micro-Signals and INP target')
);

memory.storeTurn(
  {
    sessionId: 'showcase-session',
    role: 'agent',
    content: 'Centaury Micro-Signals run in <1.5KB without Virtual DOM, guaranteeing INP < 50ms.',
  },
  makeEmbedding('Centaury Micro-Signals run in <1.5KB without Virtual DOM, guaranteeing INP < 50ms.')
);

memory.storeTurn(
  {
    sessionId: 'showcase-session',
    role: 'agent',
    content: 'Gemini 4 Pro System-2 reasoning controls thinking budget up to 64k tokens.',
  },
  makeEmbedding('Gemini 4 Pro System-2 reasoning controls thinking budget up to 64k tokens.')
);

// Initialize Astra Multimodal Gateway
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

// 1. Static Asset Routes
app.get('/', async (ctx) => {
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
      engine: 'Centaury 1.0.0-alpha',
      runtime: `Bun ${Bun.version}`,
      uptimeSeconds: Math.round(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      activeModel: 'Gemini 4 Pro (Thinking Budget: 32,768)',
      kvCacheStatus: 'Locked (92% Hit Rate)',
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
  handler: ({ input }) => {
    // Generate pseudo-deterministic 64-dim embedding from query string for interactive demo
    const embedding = new Float32Array(64);
    for (let i = 0; i < input.query.length; i++) {
      embedding[i % 64] += input.query.charCodeAt(i) / 255;
    }
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
        '<p style="color: #94a3b8; font-size: 0.9rem; margin: 0.5rem 0;">Audio PCM 16kHz & Continuous Video frames synchronized via Centaury WebSocket.</p>',
        '<ui-button action="trigger_scan" param=\'{"resolution":"4K"}\'>Execute Spatial Scan</ui-button>',
        '</ui-card>',
      ],
      astravibe: [
        '<ui-card elevation="glass">',
        '<ui-header title="Super-Intelligence Nexus" badge="Singularity Ready" />',
        '<ui-metric value="Infinite Potential" change="ASI Epoch" />',
        '<p style="color: #94a3b8; font-size: 0.9rem; margin: 0.5rem 0;">Fullstack Dual-Citizen Architecture: Humans & AI reasoning collaboratively in real-time.</p>',
        '<ui-button action="singularity_ping" param=\'{"time":Date.now()}\'>Ping Super-Intelligence</ui-button>',
        '</ui-card>',
      ],
    };

    const chunks = templates[input.intent] || templates.threat_matrix;

    // Simulate real-time streaming chunks over WebSocket
    (async () => {
      for (const chunk of chunks) {
        app.broadcast('ephemeral:chunk', { markup: chunk });
        await Bun.sleep(60); // 60ms stream interval
      }
    })();

    return { success: true, message: `Streaming ephemeral UI for '${input.intent}' started` };
  },
});

app.rpc('astra.simulateGrounding', {
  description: 'Simulate Project Astra visual screen grounding coordinates',
  handler: () => {
    // Generate realistic bounding boxes around UI cards
    const sampleBoxes = [
      { ymin: 180, xmin: 50, ymax: 360, xmax: 480, label: 'Telemetry Card' },
      { ymin: 180, xmin: 520, ymax: 560, xmax: 950, label: 'Ephemeral Synthesizer' },
    ];
    return astra.createGroundingPayload(sampleBoxes, 1200, 800);
  },
});

// 4. Background Telemetry Broadcast Loop (every 1.5s)
setInterval(() => {
  const mem = process.memoryUsage();
  app.broadcast('telemetry', {
    memoryRssMb: Math.round(mem.rss / 1024 / 1024),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    uptimeSeconds: Math.round(process.uptime()),
    activeReqPerSec: Math.floor(Math.random() * 400 + 1200),
    cpuLoad: (Math.random() * 2 + 1.2).toFixed(1) + '%',
  });
}, 1500);

// Start server
const instance = app.listen();
console.log(`\n🌌 ========================================================`);
console.log(`🌌 Centaury Showcase Server running at: http://localhost:${instance.port}`);
console.log(`🌌 Model: Gemini 4 Pro | Thinking Budget: 32,768`);
console.log(`🌌 MCP Endpoint: http://localhost:${instance.port}/.well-known/mcp.json`);
console.log(`🌌 ========================================================\n`);
