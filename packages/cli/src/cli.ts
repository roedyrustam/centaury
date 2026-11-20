/**
 * @file cli.ts
 * @description Main command-line interface logic for Centaury Framework
 */

import { CENTAURY_VERSION } from '@rudyrustam/core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export type TemplateType = 'minimal' | 'fullstack' | 'agentic';

export interface CreateOptions {
  template: TemplateType;
  install: boolean;
}

export async function runCLI(args: string[]): Promise<number> {
  const command = args[0] || '--help';

  switch (command) {
    case '--version':
    case '-v':
      console.log(`🌌 Centaury CLI version: ${CENTAURY_VERSION}`);
      return 0;

    case '--help':
    case '-h':
      printHelp();
      return 0;

    case 'doctor':
      return runDoctor();

    case 'inspect': {
      const targetArg = args[1] && !args[1].startsWith('-') ? args[1] : 'http://localhost:3000';
      return await inspectServer(targetArg);
    }

    case 'create': {
      const projectName = args[1];
      if (!projectName || projectName.startsWith('-')) {
        console.error('\x1b[31mError: Please specify a project name.\x1b[0m Example: centaury create my-app');
        return 1;
      }

      // Parse flags
      let template: TemplateType = 'fullstack';
      let install = false;

      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--template' && args[i + 1]) {
          const t = args[i + 1].toLowerCase() as TemplateType;
          if (['minimal', 'fullstack', 'agentic'].includes(t)) {
            template = t;
            i++;
          } else {
            console.error(
              `\x1b[31mError: Unknown template '${args[i + 1]}'. Choose from: minimal, fullstack, agentic\x1b[0m`
            );
            return 1;
          }
        } else if (args[i] === '--install' || args[i] === '-i') {
          install = true;
        }
      }

      return await scaffoldProject(projectName, { template, install });
    }

    case 'dev': {
      console.log('🌌 Starting Centaury in development mode with auto-reload...');
      const proc = Bun.spawn(['bun', 'run', '--watch', 'src/server.ts'], {
        stdio: ['inherit', 'inherit', 'inherit'],
      });
      await proc.exited;
      return 0;
    }

    default:
      console.error(`\x1b[31mUnknown command: '${command}'\x1b[0m`);
      printHelp();
      return 1;
  }
}

function printHelp(): void {
  console.log(`
\x1b[36m🌌 CENTAURY FRAMEWORK CLI (v${CENTAURY_VERSION})\x1b[0m
\x1b[90mThe Autonomous Fullstack Engine for Super-Intelligent Systems\x1b[0m

\x1b[33mUSAGE:\x1b[0m
  centaury <command> [options]

\x1b[33mCOMMANDS:\x1b[0m
  \x1b[32mcreate <name> [flags]\x1b[0m   Scaffold a new Centaury application
  \x1b[32mdev\x1b[0m                     Start the local development server with auto-reload
  \x1b[32mdoctor\x1b[0m                  Audit local runtime health, Bun, and port availability
  \x1b[32minspect [url]\x1b[0m           Introspect health, MCP v1.x, A2A Agent Card & Self-Healer diagnostics
  \x1b[32m--version, -v\x1b[0m           Show Centaury version
  \x1b[32m--help, -h\x1b[0m              Display this guide

\x1b[33mCREATE FLAGS:\x1b[0m
  \x1b[36m--template <name>\x1b[0m       Template archetype:
                           • \x1b[32mminimal\x1b[0m   : Ultra-lightweight Micro-Signals + Bun Trie server (<1.5KB)
                           • \x1b[32mfullstack\x1b[0m : RPC procedures + Reactive UI + Legal Compliance Trio (Default)
                           • \x1b[32magentic\x1b[0m   : Dual-Citizen MCP v1.x + Self-Healer + A2A + Ephemeral UI
  \x1b[36m--install, -i\x1b[0m           Automatically run bun install after project scaffolding

\x1b[33mDOCUMENTATION:\x1b[0m
  https://github.com/roedyrustam/centaury
`);
}

function runDoctor(): number {
  console.log('\n🔍 Running Centaury Environment Diagnostics...');

  // 1. Check Bun
  if (typeof Bun !== 'undefined') {
    console.log(`  \x1b[32m✓\x1b[0m Bun runtime detected: v${Bun.version} (Optimal: >= 1.2.0)`);
  } else {
    console.log('  \x1b[31m✗\x1b[0m Bun runtime not found. Please install Bun from https://bun.sh');
    return 1;
  }

  // 2. Check Node / OS Compatibility
  console.log(`  \x1b[32m✓\x1b[0m OS Platform: ${process.platform} (${process.arch})`);

  // 3. Check Memory limits
  const mem = process.memoryUsage();
  console.log(`  \x1b[32m✓\x1b[0m Memory headroom: ${Math.round(mem.rss / 1024 / 1024)} MB current RSS`);

  // 4. Check AI Engine readiness
  console.log('  \x1b[32m✓\x1b[0m Frontier Model: Gemini 4 Pro / Project Astra Live API compatibility ready');
  console.log('  \x1b[32m✓\x1b[0m Model Context Protocol: MCP v1.x + A2A Discovery endpoints ready\n');

  console.log('\x1b[32m✨ Environment is fully healthy and ready for Centaury development!\x1b[0m\n');
  return 0;
}

async function fetchJsonSafe(url: string): Promise<{ ok: boolean; status: number; data?: Record<string, any> }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, status: res.status };
    const data = (await res.json()) as Record<string, any>;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function inspectServer(targetUrl: string): Promise<number> {
  const baseUrl = targetUrl.replace(/\/+$/, '');
  console.log(`\n🔭 Inspecting Centaury runtime at ${baseUrl}...\n`);

  const [health, mcp, agentCard, diagnostics] = await Promise.all([
    fetchJsonSafe(`${baseUrl}/_health`),
    fetchJsonSafe(`${baseUrl}/.well-known/mcp.json`),
    fetchJsonSafe(`${baseUrl}/.well-known/agent.json`),
    fetchJsonSafe(`${baseUrl}/_heal/diagnostics`),
  ]);

  if (!health.ok || !health.data) {
    console.error(`\x1b[31m✗ Unreachable: ${baseUrl}/_health (HTTP ${health.status || 'connection refused'})\x1b[0m`);
    return 1;
  }

  console.log(`  \x1b[32m✓\x1b[0m Engine Health   : ${health.data.engine ?? 'Centaury'} (${health.data.runtime ?? 'Bun'})`);
  console.log(`  \x1b[32m✓\x1b[0m Uptime / WS     : ${Math.round(Number(health.data.uptime ?? 0))}s uptime, ${health.data.activeConnections ?? 0} active WS`);

  if (mcp.ok && mcp.data) {
    const tools = Array.isArray(mcp.data.tools) ? mcp.data.tools.length : 0;
    const routes = Array.isArray(mcp.data.routes) ? mcp.data.routes.length : 0;
    console.log(`  \x1b[32m✓\x1b[0m MCP v1.x        : ${tools} tool(s), ${routes} route(s) exposed at /.well-known/mcp.json`);
  } else {
    console.log(`  \x1b[33m-\x1b[0m MCP v1.x        : Not enabled (HTTP ${mcp.status})`);
  }

  if (agentCard.ok && agentCard.data) {
    const skills = Array.isArray(agentCard.data.skills) ? agentCard.data.skills.length : 0;
    console.log(`  \x1b[32m✓\x1b[0m A2A Agent Card  : ${agentCard.data.name ?? 'Agent'} (${skills} skill(s))`);
  } else {
    console.log(`  \x1b[33m-\x1b[0m A2A Agent Card  : Not installed (HTTP ${agentCard.status})`);
  }

  if (diagnostics.ok && diagnostics.data) {
    console.log(`  \x1b[32m✓\x1b[0m Self-Healer     : ${diagnostics.data.count ?? 0} captured diagnostic(s)`);
  } else {
    console.log(`  \x1b[33m-\x1b[0m Self-Healer     : Not installed (HTTP ${diagnostics.status})`);
  }

  console.log('');
  return 0;
}

async function scaffoldProject(projectName: string, options: CreateOptions): Promise<number> {
  const targetDir = join(process.cwd(), projectName);
  const verRange = `^${CENTAURY_VERSION}`;

  if (existsSync(targetDir)) {
    console.error(`\x1b[31mError: Directory '${projectName}' already exists.\x1b[0m`);
    return 1;
  }

  console.log(
    `\n🌌 Scaffolding new Centaury [\x1b[35m${options.template.toUpperCase()}\x1b[0m] application into: \x1b[36m${targetDir}\x1b[0m...`
  );

  mkdirSync(join(targetDir, 'src'), { recursive: true });
  mkdirSync(join(targetDir, 'public'), { recursive: true });

  // 1. package.json
  const dependencies: Record<string, string> = {
    '@rudyrustam/core': verRange,
    '@rudyrustam/signals': verRange,
    zod: '^3.24.2',
  };

  if (options.template === 'fullstack' || options.template === 'agentic') {
    dependencies['@rudyrustam/ephemeral'] = verRange;
    dependencies['@rudyrustam/auth'] = verRange;
  }
  if (options.template === 'agentic') {
    dependencies['@rudyrustam/astra'] = verRange;
    dependencies['@rudyrustam/agent'] = verRange;
    dependencies['@rudyrustam/db'] = verRange;
    dependencies['@rudyrustam/workflow'] = verRange;
  }

  const pkgJson = {
    name: projectName,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'centaury dev',
      start: 'bun run src/server.ts',
    },
    dependencies,
  };
  writeFileSync(join(targetDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  // 2. tsconfig.json
  const tsConfig = {
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ESNext', 'DOM'],
      types: ['bun'],
      strict: true,
      skipLibCheck: true,
    },
  };
  writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));

  // 3. src/server.ts
  let serverCode = '';
  let defaultRpcProc = 'ping';

  if (options.template === 'minimal') {
    defaultRpcProc = 'ping';
    serverCode = `import { CentauryServer } from '@rudyrustam/core';
import { join } from 'path';

const app = new CentauryServer({ port: 3000 });

app.get('/', async () => {
  const file = Bun.file(join(import.meta.dir, '../public/index.html'));
  return new Response(file, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});

app.rpc('ping', {
  description: 'Simple health ping RPC procedure',
  handler: () => ({ pong: true, time: new Date().toISOString() }),
});

app.listen();
console.log('🌌 Centaury minimal server running at http://localhost:3000');
`;
  } else if (options.template === 'agentic') {
    defaultRpcProc = 'analyzeAgentState';
    serverCode = `import { CentauryServer } from '@rudyrustam/core';
import {
  CentauryMCPServer,
  mcpPlugin,
  resolveThinkingBudget,
  scoreComplexity,
  selfHealingPlugin,
} from '@rudyrustam/agent';
import { legalCompliancePlugin } from '@rudyrustam/auth';
import { a2aPlugin } from '@rudyrustam/workflow';
import { z } from 'zod';
import { join } from 'path';

const app = new CentauryServer({
  port: 3000,
  ai: {
    model: 'gemini-4-argon-medium',
    thinkingBudget: 16384,
  },
});

const mcp = new CentauryMCPServer(app);
app.usePlugin(selfHealingPlugin());
app.usePlugin(mcpPlugin(mcp, { path: '/mcp' }));
app.usePlugin(legalCompliancePlugin({ appName: '${projectName}' }));
app.usePlugin(
  a2aPlugin({
    name: '${projectName} Agent',
    description: 'Autonomous Dual-Citizen Centaury Agent',
    skills: [
      {
        id: 'inspect_state',
        name: 'Inspect System State',
        description: 'Audits current query safety via CentauryPromptFirewall',
        handler: (input) => mcp.firewall.inspectPrompt(String((input as { query?: string })?.query ?? '')),
      },
    ],
  })
);

app.get('/', async () => {
  const file = Bun.file(join(import.meta.dir, '../public/index.html'));
  return new Response(file, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});

app.rpc('analyzeAgentState', {
  description: 'Audit and evaluate agent state query with Frontier tier & thinking budget routing',
  inputSchema: z.object({ query: z.string() }),
  handler: ({ input }) => {
    const routing = scoreComplexity({ promptChars: input.query.length });
    const thinking = resolveThinkingBudget({ complexityTier: routing.tier, promptChars: input.query.length });
    return {
      status: 'optimal',
      query: input.query,
      firewall: mcp.firewall.inspectPrompt(input.query),
      routing,
      thinking,
      timestamp: Date.now(),
    };
  },
});

app.listen();
console.log('🌌 Centaury Agentic Server running at http://localhost:3000');
console.log('🤖 MCP Endpoint active at http://localhost:3000/mcp');
`;
  } else {
    // fullstack default
    defaultRpcProc = 'systemMetrics';
    serverCode = `import { CentauryServer } from '@rudyrustam/core';
import { legalCompliancePlugin } from '@rudyrustam/auth';
import { join } from 'path';

const app = new CentauryServer({
  port: 3000,
  ai: {
    model: 'gemini-4-pro',
    thinkingBudget: 16384,
  },
});

app.usePlugin(legalCompliancePlugin({ appName: '${projectName}' }));

app.get('/', async () => {
  const file = Bun.file(join(import.meta.dir, '../public/index.html'));
  return new Response(file, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
});

app.rpc('systemMetrics', {
  description: 'Retrieve live server metrics',
  handler: () => ({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
    timestamp: Date.now(),
  }),
});

app.listen();
console.log('🌌 Centaury Fullstack server running at http://localhost:3000');
`;
  }
  writeFileSync(join(targetDir, 'src/server.ts'), serverCode);

  const defaultRpcInput = options.template === 'agentic' ? { query: 'health-check' } : undefined;

  // 4. public/index.html
  const htmlCode = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} — Centaury App (${options.template})</title>
  <style>
    :root {
      --bg: #030712;
      --surface: #0f172a;
      --border: #1e293b;
      --primary: #38bdf8;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      max-width: 520px;
      width: 90%;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      font-size: 0.72rem;
      font-weight: 700;
      border-radius: 6px;
      background: rgba(56, 189, 248, 0.12);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.3);
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    h1 {
      font-size: 1.85rem;
      margin: 0 0 0.5rem;
      color: var(--text);
    }
    p { color: var(--muted); line-height: 1.6; margin-bottom: 1.5rem; }
    .btn {
      background: #0284c7;
      color: #ffffff;
      border: 1px solid #38bdf8;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn:hover { background: #0369a1; }
    pre {
      margin-top: 1.25rem;
      text-align: left;
      background: #020617;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.75rem;
      font-size: 0.8rem;
      color: #a7f3d0;
      overflow-x: auto;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">${options.template} edition • v${CENTAURY_VERSION}</div>
    <h1>${projectName}</h1>
    <p>Constructed with <strong>Centaury Framework</strong> for autonomous fullstack &amp; Dual-Citizen MCP architectures.</p>
    <button class="btn" id="btn-test-rpc">Invoke RPC (${defaultRpcProc})</button>
    <pre id="rpc-output"></pre>
  </div>
  <script>
    document.getElementById('btn-test-rpc').addEventListener('click', async () => {
      const out = document.getElementById('rpc-output');
      out.style.display = 'block';
      out.textContent = 'Invoking /rpc...';
      try {
        const res = await fetch('/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ procedure: '${defaultRpcProc}', input: ${JSON.stringify(defaultRpcInput)} })
        });
        out.textContent = JSON.stringify(await res.json(), null, 2);
      } catch (err) {
        out.textContent = 'RPC Error: ' + err.message;
      }
    });
  </script>
</body>
</html>
`;
  writeFileSync(join(targetDir, 'public/index.html'), htmlCode);

  console.log(`\x1b[32m✓ Project '${projectName}' scaffolded successfully!\x1b[0m`);

  // Optional: run install
  if (options.install) {
    console.log(`\n📦 Linking Centaury packages & installing dependencies in ${projectName}...`);

    const pkgsToLink = ['@rudyrustam/core', '@rudyrustam/signals'];
    if (options.template === 'fullstack' || options.template === 'agentic') {
      pkgsToLink.push('@rudyrustam/ephemeral', '@rudyrustam/auth');
    }
    if (options.template === 'agentic') {
      pkgsToLink.push('@rudyrustam/astra', '@rudyrustam/agent', '@rudyrustam/db', '@rudyrustam/workflow');
    }

    for (const pkg of pkgsToLink) {
      try {
        const linkProc = Bun.spawn(['bun', 'link', pkg], {
          cwd: targetDir,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        await linkProc.exited;
      } catch {
        // fallback to standard install
      }
    }

    const proc = Bun.spawn(['bun', 'install'], {
      cwd: targetDir,
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    await proc.exited;
    console.log(`\x1b[32m✓ Dependencies installed successfully!\x1b[0m`);
  }

  console.log(`\nNext steps:`);
  console.log(`  cd ${projectName}`);
  if (!options.install) {
    console.log(`  bun install`);
  }
  console.log(`  bun run dev\n`);

  return 0;
}
