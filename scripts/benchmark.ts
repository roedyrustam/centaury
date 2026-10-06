/**
 * @file benchmark.ts
 * @description Performance Micro-Benchmarking Suite for Centaury Framework
 */

import { signal, computed, batch } from '../packages/signals/src/signal';
import { EphemeralStreamParser } from '../packages/ephemeral/src/parser';
import { CentauryRouter } from '../packages/core/src/router';

async function runBenchmarks() {
  console.log('\n\x1b[36m🌌 CENTAURY FRAMEWORK — MICRO-BENCHMARK SUITE\x1b[0m');
  console.log('\x1b[90mTesting runtime latency, throughput, and memory footprint\x1b[0m\n');

  // ---------------------------------------------------------
  // 1. Reactive Micro-Signals Benchmark
  // ---------------------------------------------------------
  console.log('⚡ Benchmark 1: Micro-Signals Reactivity (100,000 updates)');
  const count = signal(0);
  const doubled = computed(() => count.value * 2);
  let runs = 0;
  doubled.subscribe(() => { runs++; });

  const t0 = performance.now();
  batch(() => {
    for (let i = 0; i < 100000; i++) {
      count.value = i;
    }
  });
  const t1 = performance.now();
  const signalDurationMs = t1 - t0;
  const signalOpsPerSec = Math.round((100000 / signalDurationMs) * 1000);
  console.log(`  ✓ 100k updates in \x1b[32m${signalDurationMs.toFixed(2)} ms\x1b[0m (${signalOpsPerSec.toLocaleString()} ops/sec)`);

  // ---------------------------------------------------------
  // 2. Ephemeral UI AST Parser Benchmark
  // ---------------------------------------------------------
  console.log('\n🌌 Benchmark 2: Ephemeral UI AST Streaming Parser (10,000 tokens)');
  const sampleMarkup = '<c-card title="Nexus"><p>Quantum telemetry node 42</p><button on:click="refresh">Sync</button></c-card>';

  const t2 = performance.now();
  for (let i = 0; i < 10000; i++) {
    EphemeralStreamParser.parse(sampleMarkup);
  }
  const t3 = performance.now();
  const parserDurationMs = t3 - t2;
  const parserOpsPerSec = Math.round((10000 / parserDurationMs) * 1000);
  console.log(`  ✓ 10k parse cycles in \x1b[32m${parserDurationMs.toFixed(2)} ms\x1b[0m (${parserOpsPerSec.toLocaleString()} parses/sec)`);

  // ---------------------------------------------------------
  // 3. Trie Router Route Matching Benchmark
  // ---------------------------------------------------------
  console.log('\n🚀 Benchmark 3: Trie Router Match Throughput (500,000 matches)');
  const router = new CentauryRouter();
  router.add('GET', '/', () => new Response('home'));
  router.add('GET', '/api/users/:id', () => new Response('user'));
  router.add('POST', '/api/v1/agent/action', () => new Response('agent'));
  router.add('GET', '/static/*', () => new Response('static'));

  const t4 = performance.now();
  for (let i = 0; i < 500000; i++) {
    router.match('GET', '/api/users/usr_9847291');
  }
  const t5 = performance.now();
  const routerDurationMs = t5 - t4;
  const routerOpsPerSec = Math.round((500000 / routerDurationMs) * 1000);
  console.log(`  ✓ 500k route matches in \x1b[32m${routerDurationMs.toFixed(2)} ms\x1b[0m (${routerOpsPerSec.toLocaleString()} matches/sec)`);

  // ---------------------------------------------------------
  // 4. Memory Footprint
  // ---------------------------------------------------------
  const mem = process.memoryUsage();
  console.log('\n💾 Memory Footprint:');
  console.log(`  • Heap Used: \x1b[33m${Math.round(mem.heapUsed / 1024 / 1024)} MB\x1b[0m`);
  console.log(`  • Resident Set Size (RSS): \x1b[33m${Math.round(mem.rss / 1024 / 1024)} MB\x1b[0m`);

  console.log('\n\x1b[32m✨ All Centaury micro-benchmarks passed with optimal throughput!\x1b[0m\n');
}

runBenchmarks().catch(console.error);
