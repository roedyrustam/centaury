/**
 * @file build.ts
 * @description Monorepo Production Build Pipeline for Centaury
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface BuildConfig {
  entry: string;
  outdir: string;
  target: 'browser' | 'bun' | 'node';
  format?: 'esm';
}

const builds: BuildConfig[] = [
  {
    entry: 'packages/core/src/index.ts',
    outdir: 'packages/core/dist',
    target: 'bun',
  },
  {
    entry: 'packages/signals/src/index.ts',
    outdir: 'packages/signals/dist',
    target: 'browser',
  },
  {
    entry: 'packages/ephemeral/src/index.ts',
    outdir: 'packages/ephemeral/dist',
    target: 'browser',
  },
  {
    entry: 'packages/astra/src/index.ts',
    outdir: 'packages/astra/dist',
    target: 'browser',
  },
  {
    entry: 'packages/agent/src/index.ts',
    outdir: 'packages/agent/dist',
    target: 'bun',
  },
  {
    entry: 'packages/cli/src/index.ts',
    outdir: 'packages/cli/dist',
    target: 'bun',
  },
];

async function runBuild() {
  console.log('\n\x1b[36m🌌 BUILDING CENTAURY MONOREPO PACKAGES...\x1b[0m\n');
  const t0 = performance.now();

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
    console.log(`  \x1b[32m✓\x1b[0m ${b.entry} → \x1b[33m${sizeKb} KB\x1b[0m (${b.target})`);
  }

  const duration = (performance.now() - t0).toFixed(2);
  console.log(`\n\x1b[32m✨ All packages built successfully in ${duration} ms!\x1b[0m\n`);
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
