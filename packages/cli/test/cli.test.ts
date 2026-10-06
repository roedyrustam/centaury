/**
 * @file cli.test.ts
 * @description Test suite for @centaury/cli
 */

import { describe, it, expect, afterAll } from 'bun:test';
import { runCLI } from '../src/cli';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

describe('@centaury/cli Developer Tools', () => {
  const dummyProject = join(process.cwd(), 'temp-test-centaury-app');

  afterAll(() => {
    if (existsSync(dummyProject)) {
      rmSync(dummyProject, { recursive: true, force: true });
    }
  });

  it('prints version with code 0', async () => {
    const code = await runCLI(['--version']);
    expect(code).toBe(0);
  });

  it('prints help guide with code 0', async () => {
    const code = await runCLI(['--help']);
    expect(code).toBe(0);
  });

  it('runs doctor diagnostics with code 0', async () => {
    const code = await runCLI(['doctor']);
    expect(code).toBe(0);
  });

  it('rejects unknown command with code 1', async () => {
    const code = await runCLI(['non-existent-cmd']);
    expect(code).toBe(1);
  });

  it('rejects create command without project name with code 1', async () => {
    const code = await runCLI(['create']);
    expect(code).toBe(1);
  });

  it('scaffolds a new project with valid structure', async () => {
    const code = await runCLI(['create', 'temp-test-centaury-app']);
    expect(code).toBe(0);

    expect(existsSync(join(dummyProject, 'package.json'))).toBe(true);
    expect(existsSync(join(dummyProject, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(dummyProject, 'src', 'server.ts'))).toBe(true);
    expect(existsSync(join(dummyProject, 'public', 'index.html'))).toBe(true);
  });

  it('rejects unknown template with code 1', async () => {
    const code = await runCLI(['create', 'temp-bad-app', '--template', 'non-existent']);
    expect(code).toBe(1);
  });

  it('scaffolds an agentic template project correctly', async () => {
    const agenticProject = join(process.cwd(), 'temp-agentic-app');
    try {
      const code = await runCLI(['create', 'temp-agentic-app', '--template', 'agentic']);
      expect(code).toBe(0);
      expect(existsSync(join(agenticProject, 'package.json'))).toBe(true);
      const pkg = JSON.parse(await Bun.file(join(agenticProject, 'package.json')).text());
      expect(pkg.dependencies['@centaury/agent']).toBeDefined();
      expect(pkg.dependencies['@centaury/astra']).toBeDefined();
    } finally {
      if (existsSync(agenticProject)) {
        rmSync(agenticProject, { recursive: true, force: true });
      }
    }
  });
});

