#!/usr/bin/env bun

import { existsSync } from 'fs';
import { join } from 'path';

const distPath = join(import.meta.dir, '../dist/index.js');
let cliModule;

if (existsSync(distPath)) {
  cliModule = await import(distPath);
} else {
  cliModule = await import('../src/index.ts');
}

cliModule.runCLI(process.argv.slice(2)).then((code) => {
  if (code !== 0) process.exit(code);
}).catch((err) => {
  console.error('\x1b[31m[Centaury CLI Error]\x1b[0m', err.message);
  process.exit(1);
});
