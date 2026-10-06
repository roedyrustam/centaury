#!/usr/bin/env bun

import { runCLI } from '../src/cli';

runCLI(process.argv.slice(2)).catch((err) => {
  console.error('\x1b[31m[Centaury CLI Error]\x1b[0m', err.message);
  process.exit(1);
});
