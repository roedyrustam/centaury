/**
 * @file build.ts
 * @description Monorepo Production Build Pipeline for Centaury
 */

import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { join } from 'path';

interface BuildConfig {
  name: string;
  entry: string;
  pkgDir: string;
  outdir: string;
  target: 'browser' | 'bun' | 'node';
  format?: 'esm';
}

const builds: BuildConfig[] = [
  {
    name: 'core',
    entry: 'packages/core/src/index.ts',
    pkgDir: 'packages/core',
    outdir: 'packages/core/dist',
    target: 'bun',
  },
  {
    name: 'signals',
    entry: 'packages/signals/src/index.ts',
    pkgDir: 'packages/signals',
    outdir: 'packages/signals/dist',
    target: 'browser',
  },
  {
    name: 'ephemeral',
    entry: 'packages/ephemeral/src/index.ts',
    pkgDir: 'packages/ephemeral',
    outdir: 'packages/ephemeral/dist',
    target: 'browser',
  },
  {
    name: 'astra',
    entry: 'packages/astra/src/index.ts',
    pkgDir: 'packages/astra',
    outdir: 'packages/astra/dist',
    target: 'browser',
  },
  {
    name: 'agent',
    entry: 'packages/agent/src/index.ts',
    pkgDir: 'packages/agent',
    outdir: 'packages/agent/dist',
    target: 'bun',
  },
  {
    name: 'cli',
    entry: 'packages/cli/src/index.ts',
    pkgDir: 'packages/cli',
    outdir: 'packages/cli/dist',
    target: 'bun',
  },
  {
    name: 'centaury',
    entry: 'packages/centaury/src/index.ts',
    pkgDir: 'packages/centaury',
    outdir: 'packages/centaury/dist',
    target: 'bun',
  },
];

async function runBuild() {
  console.log('\n\x1b[36m🌌 BUILDING CENTAURY MONOREPO PACKAGES...\x1b[0m\n');
  const t0 = performance.now();

  // 1. Compile JavaScript Bundles
  for (const b of builds) {
    if (!existsSync(b.outdir)) {
      mkdirSync(b.outdir, { recursive: true });
    }

    const result = await Bun.build({
      entrypoints: [b.entry],
      outdir: b.outdir,
      target: b.target,
      minify: true,
      sourcemap: 'external',
    });

    if (!result.success) {
      console.error(`\x1b[31m✗ Failed to build ${b.entry}\x1b[0m:`, result.logs);
      process.exit(1);
    }

    const artifact = result.outputs[0];
    const sizeKb = artifact ? (artifact.size / 1024).toFixed(2) : '0';
    console.log(`  \x1b[32m✓\x1b[0m [JS] ${b.entry} → \x1b[33m${sizeKb} KB\x1b[0m (${b.target})`);
  }

  // 2. Generate TypeScript Declaration Files (.d.ts)
  console.log('\n📝 Generating TypeScript Type Declarations (.d.ts)...');
  const tempDeclarationsDir = join(process.cwd(), 'dist-declarations-temp');

  const tscProc = Bun.spawn([
    'bun', 'x', 'tsc',
    '--declaration',
    '--emitDeclarationOnly',
    '--outDir', tempDeclarationsDir,
  ], {
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  const tscExitCode = await tscProc.exited;
  if (tscExitCode !== 0) {
    const stderr = await new Response(tscProc.stderr).text();
    console.error('\x1b[31m✗ Failed to emit TypeScript declarations:\x1b[0m', stderr);
    process.exit(1);
  }

  // 3. Move declarations into respective package dist/ directories
  for (const b of builds) {
    const pkgDeclarationsSrc = join(tempDeclarationsDir, b.pkgDir, 'src');
    if (existsSync(pkgDeclarationsSrc)) {
      cpSync(pkgDeclarationsSrc, b.outdir, { recursive: true });
      console.log(`  \x1b[32m✓\x1b[0m [DTS] @centaury/${b.name} declarations mapped to ${b.outdir}`);
    }
  }

  // 4. Clean up temporary declarations directory
  if (existsSync(tempDeclarationsDir)) {
    rmSync(tempDeclarationsDir, { recursive: true, force: true });
  }

  const duration = (performance.now() - t0).toFixed(2);
  console.log(`\n\x1b[32m✨ All packages built successfully with complete TypeScript definitions in ${duration} ms!\x1b[0m\n`);
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
