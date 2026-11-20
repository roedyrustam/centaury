/**
 * @file e2e-release-test.ts
 * @description Comprehensive End-to-End Release & Developer Workflow Verification (Fullstack + Agentic)
 */

import { existsSync, rmSync } from 'fs';
import { join } from 'path';

interface TemplateVerificationSpec {
  appName: string;
  template: 'fullstack' | 'agentic';
  rpcProcedure: string;
  rpcInput?: unknown;
  verifyAgenticEndpoints: boolean;
}

async function waitForHealth(baseUrl: string, serverProc: any, port: number): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const res = await fetch(`${baseUrl}/_health`);
      if (res.status === 200) {
        return;
      }
    } catch {
      // waiting for socket bind
    }
  }
  const err = await new Response(serverProc.stderr).text();
  serverProc.kill();
  throw new Error(`Scaffolded server failed to start on port ${port}: ${err}`);
}

function createMonorepoTsconfigPaths(rootDir: string): Record<string, string[]> {
  return {
    '@rudyrustam/core': [join(rootDir, 'packages/core/src/index.ts')],
    '@rudyrustam/signals': [join(rootDir, 'packages/signals/src/index.ts')],
    '@rudyrustam/ephemeral': [join(rootDir, 'packages/ephemeral/src/index.ts')],
    '@rudyrustam/astra': [join(rootDir, 'packages/astra/src/index.ts')],
    '@rudyrustam/agent': [join(rootDir, 'packages/agent/src/index.ts')],
    '@rudyrustam/sse': [join(rootDir, 'packages/sse/src/index.ts')],
    '@rudyrustam/db': [join(rootDir, 'packages/db/src/index.ts')],
    '@rudyrustam/auth': [join(rootDir, 'packages/auth/src/index.ts')],
    '@rudyrustam/workflow': [join(rootDir, 'packages/workflow/src/index.ts')],
    '@rudyrustam/centaury': [join(rootDir, 'packages/centaury/src/index.ts')],
  };
}

async function verifyTemplateLifecycle(spec: TemplateVerificationSpec): Promise<void> {
  const rootDir = process.cwd();
  const testAppRelPath = join('examples', spec.appName);
  const testAppDir = join(rootDir, testAppRelPath);

  if (existsSync(testAppDir)) {
    rmSync(testAppDir, { recursive: true, force: true });
  }

  let serverProc: any = null;

  try {
    console.log(`\n📦 [${spec.template}] Step 1: Scaffolding ${spec.appName} via Centaury CLI...`);
    const cliPath = join(rootDir, 'packages/cli/bin/centaury.js');
    const scaffoldProc = Bun.spawn(['bun', cliPath, 'create', testAppRelPath, '--template', spec.template, '--install'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const scaffoldExit = await scaffoldProc.exited;
    if (scaffoldExit !== 0) {
      const err = await new Response(scaffoldProc.stderr).text();
      throw new Error(`Scaffolding (${spec.template}) failed with code ${scaffoldExit}: ${err}`);
    }

    if (!existsSync(join(testAppDir, 'src/server.ts')) || !existsSync(join(testAppDir, 'public/index.html'))) {
      throw new Error(`Scaffolded ${spec.template} project is missing required files!`);
    }
    console.log(`  \x1b[32m✓\x1b[0m [${spec.template}] Scaffolding completed cleanly.`);

    console.log(`🚀 [${spec.template}] Step 2: Booting scaffolded Micro-Kernel...`);
    const serverFile = join(testAppDir, 'src/server.ts');
    let serverContent = await Bun.file(serverFile).text();
    const testPort = 58000 + Math.floor(Math.random() * 1500);
    serverContent = serverContent.replace('port: 3000', `port: ${testPort}`);
    await Bun.write(serverFile, serverContent);

    const tsConfigFile = join(testAppDir, 'tsconfig.json');
    const tsConfig = JSON.parse(await Bun.file(tsConfigFile).text());
    tsConfig.compilerOptions.baseUrl = '.';
    tsConfig.compilerOptions.paths = createMonorepoTsconfigPaths(rootDir);
    await Bun.write(tsConfigFile, JSON.stringify(tsConfig, null, 2));

    serverProc = Bun.spawn(['bun', 'run', 'src/server.ts'], {
      cwd: testAppDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const baseUrl = `http://localhost:${testPort}`;
    await waitForHealth(baseUrl, serverProc, testPort);
    console.log(`  \x1b[32m✓\x1b[0m [${spec.template}] Server booted cleanly on port ${testPort}.`);

    // Step 3: HTML UI & Legal Trio
    const htmlRes = await fetch(`${baseUrl}/`);
    if (htmlRes.status !== 200 || !(await htmlRes.text()).includes(spec.appName)) {
      throw new Error(`[${spec.template}] Invalid HTML index response`);
    }
    const privacyRes = await fetch(`${baseUrl}/privacy`);
    if (privacyRes.status !== 200) {
      throw new Error(`[${spec.template}] Expected Legal Trio /privacy route HTTP 200, got ${privacyRes.status}`);
    }
    console.log(`  \x1b[32m✓\x1b[0m [${spec.template}] HTML UI & Legal Privacy Trio verified.`);

    // Step 4: Type-Safe RPC
    const rpcRes = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ procedure: spec.rpcProcedure, input: spec.rpcInput }),
    });
    if (rpcRes.status !== 200) {
      throw new Error(`[${spec.template}] RPC '${spec.rpcProcedure}' failed with HTTP ${rpcRes.status}`);
    }
    const rpcData = (await rpcRes.json()) as { success?: boolean; data?: Record<string, any> };
    if (!rpcData.success || !rpcData.data) {
      throw new Error(`[${spec.template}] Unexpected RPC payload: ${JSON.stringify(rpcData)}`);
    }
    console.log(`  \x1b[32m✓\x1b[0m [${spec.template}] RPC '${spec.rpcProcedure}' verified.`);

    // Step 5: MCP Discovery & Optional Agentic Endpoints
    const mcpRes = await fetch(`${baseUrl}/.well-known/mcp.json`);
    const mcpData = (await mcpRes.json()) as { mcpVersion?: string; tools?: unknown[] };
    if (mcpRes.status !== 200 || mcpData.mcpVersion !== '1.0.0' || !Array.isArray(mcpData.tools)) {
      throw new Error(`[${spec.template}] Invalid /.well-known/mcp.json payload`);
    }

    if (spec.verifyAgenticEndpoints) {
      const mcpPostRes = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'e2e-1', method: 'tools/list' }),
      });
      if (mcpPostRes.status !== 200) {
        throw new Error(`[${spec.template}] POST /mcp failed with HTTP ${mcpPostRes.status}`);
      }
      const mcpRpc = (await mcpPostRes.json()) as { result?: { tools?: unknown[] } };
      if (!Array.isArray(mcpRpc.result?.tools) || mcpRpc.result.tools.length === 0) {
        throw new Error(`[${spec.template}] POST /mcp tools/list returned empty tools`);
      }

      const agentCardRes = await fetch(`${baseUrl}/.well-known/agent.json`);
      if (agentCardRes.status !== 200) {
        throw new Error(`[${spec.template}] /.well-known/agent.json failed with HTTP ${agentCardRes.status}`);
      }

      const healRes = await fetch(`${baseUrl}/_heal/diagnostics`);
      if (healRes.status !== 200) {
        throw new Error(`[${spec.template}] /_heal/diagnostics failed with HTTP ${healRes.status}`);
      }
    }
    console.log(`  \x1b[32m✓\x1b[0m [${spec.template}] MCP v1.x${spec.verifyAgenticEndpoints ? ' + POST /mcp + A2A + Self-Healer' : ''} verified.`);
  } finally {
    if (serverProc) {
      serverProc.kill();
      await serverProc.exited.catch(() => {});
      await new Promise((r) => setTimeout(r, 600));
    }
    if (existsSync(testAppDir)) {
      try {
        rmSync(testAppDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
      } catch (e) {
        console.warn(`Note: Temporary test directory cleanup deferred: ${e}`);
      }
    }
  }
}

async function verifyRelease() {
  console.log('\n\x1b[36m🌌 CENTAURY FRAMEWORK — END-TO-END RELEASE VERIFICATION\x1b[0m');
  console.log('\x1b[90mTesting fullstack & agentic CLI scaffolding, server boot, RPC execution, MCP & A2A\x1b[0m');

  await verifyTemplateLifecycle({
    appName: 'temp-e2e-fullstack-app',
    template: 'fullstack',
    rpcProcedure: 'systemMetrics',
    verifyAgenticEndpoints: false,
  });

  await verifyTemplateLifecycle({
    appName: 'temp-e2e-agentic-app',
    template: 'agentic',
    rpcProcedure: 'analyzeAgentState',
    rpcInput: { query: 'system-e2e-check' },
    verifyAgenticEndpoints: true,
  });

  console.log('\n\x1b[32m✨ ALL RELEASE & E2E INTEGRATION CHECKS (FULLSTACK + AGENTIC) PASSED!\x1b[0m\n');
}

verifyRelease().catch((err) => {
  console.error('\x1b[31m✗ Release Verification Failed:\x1b[0m', err);
  process.exit(1);
});
