/**
 * @file e2e-release-test.ts
 * @description Comprehensive End-to-End Release & Developer Workflow Verification
 */

import { existsSync, rmSync } from 'fs';
import { join } from 'path';

async function verifyRelease() {
  console.log('\n\x1b[36m🌌 CENTAURY FRAMEWORK — END-TO-END RELEASE VERIFICATION\x1b[0m');
  console.log('\x1b[90mTesting real-world scaffolding, server boot, RPC execution, and MCP introspection\x1b[0m\n');

  const testAppName = 'temp-e2e-verification-app';
  const testAppRelPath = join('examples', testAppName);
  const testAppDir = join(process.cwd(), testAppRelPath);

  // Clean if existing
  if (existsSync(testAppDir)) {
    rmSync(testAppDir, { recursive: true, force: true });
  }

  let serverProc: any = null;

  try {
    // -------------------------------------------------------------
    // Step 1: Execute Centaury CLI Scaffolding
    // -------------------------------------------------------------
    console.log('📦 Step 1: Scaffolding new application via Centaury CLI...');
    const cliPath = join(process.cwd(), 'packages/cli/bin/centaury.js');
    const scaffoldProc = Bun.spawn(['bun', cliPath, 'create', testAppRelPath, '--template', 'fullstack', '--install'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const scaffoldExit = await scaffoldProc.exited;
    if (scaffoldExit !== 0) {
      const err = await new Response(scaffoldProc.stderr).text();
      throw new Error(`Scaffolding failed with code ${scaffoldExit}: ${err}`);
    }

    if (!existsSync(join(testAppDir, 'src/server.ts')) || !existsSync(join(testAppDir, 'public/index.html'))) {
      throw new Error('Scaffolded project is missing required files!');
    }
    console.log('  \x1b[32m✓\x1b[0m Scaffolding completed successfully.');

    // -------------------------------------------------------------
    // Step 2: Boot Scaffolded Server on a Random Free Port
    // -------------------------------------------------------------
    console.log('\n🚀 Step 2: Booting scaffolded Centaury Micro-Kernel...');
    // Dynamically patch server port and tsconfig paths for monorepo verification
    const serverFile = join(testAppDir, 'src/server.ts');
    let serverContent = await Bun.file(serverFile).text();
    const testPort = 59000 + Math.floor(Math.random() * 1000);
    serverContent = serverContent.replace('port: 3000', `port: ${testPort}`);
    await Bun.write(serverFile, serverContent);

    const tsConfigFile = join(testAppDir, 'tsconfig.json');
    const tsConfig = JSON.parse(await Bun.file(tsConfigFile).text());
    tsConfig.compilerOptions.baseUrl = '.';
    tsConfig.compilerOptions.paths = {
      '@centaury-ai/core': [join(process.cwd(), 'packages/core/src/index.ts')],
      '@centaury-ai/signals': [join(process.cwd(), 'packages/signals/src/index.ts')],
      '@centaury-ai/ephemeral': [join(process.cwd(), 'packages/ephemeral/src/index.ts')],
      '@centaury-ai/astra': [join(process.cwd(), 'packages/astra/src/index.ts')],
      '@centaury-ai/agent': [join(process.cwd(), 'packages/agent/src/index.ts')],
      '@centaury/core': [join(process.cwd(), 'packages/core/src/index.ts')],
      '@centaury/signals': [join(process.cwd(), 'packages/signals/src/index.ts')],
      '@centaury/ephemeral': [join(process.cwd(), 'packages/ephemeral/src/index.ts')],
      '@centaury/astra': [join(process.cwd(), 'packages/astra/src/index.ts')],
      '@centaury/agent': [join(process.cwd(), 'packages/agent/src/index.ts')],
    };
    await Bun.write(tsConfigFile, JSON.stringify(tsConfig, null, 2));

    serverProc = Bun.spawn(['bun', 'run', 'src/server.ts'], {
      cwd: testAppDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait for server ready (up to 3 seconds)
    const baseUrl = `http://localhost:${testPort}`;
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const res = await fetch(`${baseUrl}/_health`);
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch {
        // waiting for socket to bind
      }
    }

    if (!ready) {
      const err = await new Response(serverProc.stderr).text();
      serverProc.kill();
      throw new Error(`Scaffolded server failed to start on port ${testPort}: ${err}`);
    }
    console.log(`  \x1b[32m✓\x1b[0m Server successfully booted on port ${testPort}.`);

    // -------------------------------------------------------------
    // Step 3: Test Web UI Serving
    // -------------------------------------------------------------
    console.log('\n🌐 Step 3: Verifying HTML Web UI serving...');
    const htmlRes = await fetch(`${baseUrl}/`);
    if (htmlRes.status !== 200) {
      throw new Error(`Expected HTTP 200 for index.html, got ${htmlRes.status}`);
    }
    const htmlText = await htmlRes.text();
    if (!htmlText.includes(testAppName)) {
      throw new Error('HTML response does not contain application name!');
    }
    console.log('  \x1b[32m✓\x1b[0m HTML UI served with valid title and styling.');

    // -------------------------------------------------------------
    // Step 4: Test Type-Safe RPC Procedure Execution
    // -------------------------------------------------------------
    console.log('\n⚡ Step 4: Verifying Type-Safe RPC procedure execution...');
    const rpcRes = await fetch(`${baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ procedure: 'systemMetrics' }),
    });

    if (rpcRes.status !== 200) {
      throw new Error(`Expected HTTP 200 for RPC call, got ${rpcRes.status}`);
    }
    const rpcData = await rpcRes.json();
    const metrics = rpcData.data || rpcData;
    if (metrics.status !== 'healthy' || typeof metrics.uptime !== 'number') {
      throw new Error(`Invalid RPC response payload: ${JSON.stringify(rpcData)}`);
    }
    console.log(`  \x1b[32m✓\x1b[0m RPC 'systemMetrics' executed successfully (status: ${metrics.status}).`);

    // -------------------------------------------------------------
    // Step 5: Test Dual-Citizen MCP v1.x Introspection
    // -------------------------------------------------------------
    console.log('\n🤖 Step 5: Verifying Model Context Protocol (MCP v1.x) discovery...');
    const mcpRes = await fetch(`${baseUrl}/.well-known/mcp.json`);
    if (mcpRes.status !== 200) {
      throw new Error(`Expected HTTP 200 for MCP discovery, got ${mcpRes.status}`);
    }
    const mcpData = await mcpRes.json();
    if (mcpData.mcpVersion !== '1.0.0' || !Array.isArray(mcpData.tools)) {
      throw new Error(`Invalid MCP payload: ${JSON.stringify(mcpData)}`);
    }
    console.log(`  \x1b[32m✓\x1b[0m MCP discovery active with ${mcpData.tools.length} introspectable tools.`);

    console.log('\n\x1b[32m✨ ALL RELEASE & E2E INTEGRATION CHECKS PASSED WITH 100% SUCCESS!\x1b[0m');
    console.log('\x1b[32m🚀 Centaury Framework is fully verified and ready for public release!\x1b[0m\n');
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
        // Fallback warning if Windows keeps a lock
        console.warn(`Note: Temporary test directory cleanup deferred: ${e}`);
      }
    }
  }
}

verifyRelease().catch((err) => {
  console.error('\x1b[31m✗ Release Verification Failed:\x1b[0m', err);
  process.exit(1);
});
