# Centaury Framework — Development Roadmap & Phase Progression
**Framework**: Centaury (`@rudyrustam/centaury` / `@rudyrustam/core`)  
**Version**: `1.2.0-alpha`  
**Lifecycle Pipeline**: Autonomous Multi-Phase Protocol (`zero-to-prod-orchestrator`)  

---

## Roadmap Phases Overview

```
[Phase 1-3: Core / Signals / Ephemeral] ──> [Phase 4-5: Astra & MCP v1.x] ──> [Phase 6-8: Hardening, Showcase, CLI]
                                                                                         │
[Phase 13: @rudyrustam/workflow] <── [Phase 12: @rudyrustam/auth] <── [Phase 11: Self-Heal & Firewall] <── [Phase 9-10: SSE & DB]
         │
         v
[Phase 14: 11-Package Sync & Showcase v2] ──> [Phase 15-17: v1.2.0-alpha Deep Hardening, AI Gateway & Parallel Saga] ──> [Phase 18: Frontier LLM Orchestration]
```

---

## Phase Breakdown & Milestones

### 🚀 Phase 1: Core Micro-Kernel & Server Engine (`@centaury/core`)
- [x] Inisialisasi monorepo Bun workspaces (`package.json`, `tsconfig.json`).
- [x] Server HTTP/WebSocket berkecepatan tinggi dengan routing Trie native Bun.
- [x] Type-safe RPC router terpadu tanpa build step.
- [x] Request context dengan pelacakan deterministic KV-cache prefix.

### ⚡ Phase 2: Zero-Hydration Client Reactive Engine (`@centaury/signals`)
- [x] Implementasi Micro-Signals primitif (`signal`, `computed`, `effect`) dalam <1.5KB.
- [x] Direct DOM mutation binding tanpa Virtual DOM.
- [x] Custom Elements bawaan: `<c-stream>`, `<c-bind>`, `<c-stack>`.

### 🌌 Phase 3: Ephemeral Generative UI Synthesizer (`@centaury/ephemeral`)
- [x] Streaming token parser untuk token UI yang dipancarkan LLM.
- [x] Zero-eval HTML/SVG sanitizer untuk mencegah eksekusi skrip sembarangan.
- [x] Sandboxed component mount engine `<c-ephemeral>`.

### 🎙️ Phase 4: Multimodal Astra Gateway (`@centaury/astra`)
- [x] WebSockets bi-directional PCM audio streaming (16kHz in / 24kHz out).
- [x] Continuous video frame screen-grounding coordinates mapper.
- [x] Sub-150ms client interruption detector and audio cutoff buffer.

### 🤖 Phase 5: Dual-Citizen MCP v1.x & AST Server (`@centaury/agent`)
- [x] Endpoint resmi MCP v1.x (`/.well-known/mcp.json`).
- [x] Route & schema reflector untuk inspeksi AI Agent.
- [x] Secure action invocation tool protocol.

### 🛡️ Phase 6: Pre-Launch Hardening & Security Audit (`production-ready-hardener`)
- [x] Formal invariant validation & input sanitization.
- [x] Zero-tolerance anti-slop audit (Knip dead code eradication, strict TS).
- [x] Core Web Vitals benchmark (LCP < 0.6s, INP < 50ms).

### 🌟 Phase 7: Centaury Showcase Application (`examples/showcase-app`)
- [x] Implementasi aplikasi demonstrator lengkap yang mendemonstrasikan:
  - Zero-Hydration Micro-Signals
  - Live Gemini 4 Pro Ephemeral UI generation
  - Astra multimodal voice & screen grounding
  - Native MCP tool calling

### 📦 Phase 8: Package Distribution & CLI (`@centaury/cli`)
- [x] CLI developer tool `centaury create`, `centaury dev`, dan `centaury doctor`.
- [x] Dokumentasi publik & lisensi MIT.

### 📡 Phase 9: Native SSE Event Bus (`@centaury-ai/sse`)
- [x] High-performance O(1) in-memory Event Bus dengan wildcard and ring-buffer history replay.
- [x] RFC 8895 compliant SSE formatter dengan Bun native ReadableStream generator.
- [x] Plugin server SSE (`GET /sse/:topic`, `GET /sse`, `GET /sse/_stats`).
- [x] Typed browser SSE client dengan reconnect back-off otomatis.

### 💾 Phase 10: Bun SQLite & Vector Memory Engine (`@rudyrustam/db`)
- [x] Native Bun SQLite connection manager dengan WAL mode dan LRU statement caching.
- [x] Parameterized SQL query builder pencegah SQL injection (`query()`).
- [x] Migration runner dengan atomic transactional execution (`_centaury_migrations`).
- [x] Vector Store dengan cosine similarity search Float32Array SIMD (7.5M+ ops/sec).
- [x] Type-safe Generic Repository pattern (`CentauryRepository<T>`).
- [x] Integrasi persistent episodic memory & vector search ke AI Agent (`CentauryAgentMemory`).

### 🛡️ Phase 11: Autonomous Self-Healing Runtime & Prompt Firewall (`@rudyrustam/agent`)
- [x] `CentauryPromptFirewall` untuk deteksi prompt injection, jailbreak tokens, SSRF metadata targets, serta redaksi PII & validasi output JSON terstruktur.
- [x] `CentaurySelfHealer` + `selfHealingPlugin` dengan parsing stack frame Windows/POSIX, pemetaan `astTarget`, fallback recovery, dan endpoint `GET /_heal/diagnostics`.
- [x] Tool MCP v1.x baru: `centaury_audit_prompt` dan `centaury_get_healing_diagnostics`.

### 🔐 Phase 12: Zero-Trust Auth, Passkeys & Compliance Pack (`@rudyrustam/auth`)
- [x] Token HS256 JWT stateless & PBKDF2-SHA256 salted password hashing berbasis native Web Crypto (`crypto.subtle`).
- [x] `CentauryAccessControl` gabungan RBAC (termasuk wildcard `*`) dan ReBAC tuples (`grantRelation`, `checkRelation`, `revokeRelation`) + `createAuthMiddleware`.
- [x] `CentauryPasskeyManager` WebAuthn challenge registration/authentication sekali pakai dengan TTL.
- [x] `legalCompliancePlugin` menyediakan rute wajib Trio Privasi & Legal: `/privacy`, `/terms`, `/delete-account`, dan `POST /api/compliance/delete-account`.

### 🔄 Phase 13: A2A Multi-Agent Swarm & Durable Workflows (`@rudyrustam/workflow`)
- [x] `CentauryA2AServer` & `a2aPlugin` dengan endpoint Discovery `GET /.well-known/agent.json`, `POST /a2a/tasks/send`, `GET /a2a/tasks/:id`, dan `POST /a2a/tasks/:id/cancel`.
- [x] `CentauryWorkflowEngine` dengan checkpoint persisten SQLite (`_centaury_workflow_steps`), step retries, deterministic replay, dan reverse-order Saga compensation.

### 📦 Phase 14: Monorepo 11-Package Synchronization & Showcase App v2 (`@rudyrustam/centaury`)
- [x] Sinkronisasi nama paket `@rudyrustam/*` di seluruh 11 paket monorepo menuju `1.1.0-alpha`.
- [x] Re-export `@rudyrustam/auth` dan `@rudyrustam/workflow` via umbrella `@rudyrustam/centaury`.
- [x] Integrasi plugin firewall/self-heal/compliance/A2A + RPC workflow demo ke `examples/showcase-app/server.ts`.

### 🧠 Phase 15–17: v1.2.0-alpha Deep Hardening, AI Gateway, Parallel Saga & DX Upgrade
- [x] **Phase 15 (Security & Correctness Hardening)**: Router backtracking/middleware fix, `zodToJsonSchema` di `/.well-known/mcp.json`, `createRpcClient()`, confinement-safe `serveStatic()`, `effect()` dependency cleanup, XSS hardening pada `<c-devtools>`, `@rudyrustam/ephemeral`, & `legalCompliancePlugin`, validasi identifier SQL & async migration transactions pada `@rudyrustam/db`, serta `alg === 'HS256'` & WebAuthn origin/pruning checks pada `@rudyrustam/auth`.
- [x] **Phase 16 (Autonomous AI & Durable Orchestration)**: `CentauryAIGateway` (Gemini/OpenAI-compatible/Mock + fallback cascade + KV-cache hash), `mcpPlugin(mcp)` HTTP JSON-RPC `/mcp`, source-aware `CentaurySelfHealer` snippet context, SQLite-backed A2A persistence & SSE `/a2a/tasks/:id/events`, dan `.parallel()` workflow Saga fan-out.
- [x] **Phase 17 (CLI v1.2, Umbrella Sync & Showcase v3)**: `centaury inspect [url]`, template `agentic`/`fullstack` tersinkronisasi v1.2, normalisasi `bin` path bebas warning npm, umbrella `@rudyrustam/centaury` mencakup seluruh 10 modul library, Showcase App v3, dan E2E check ganda (`fullstack` + `agentic`).

### 🌐 Phase 18: Frontier LLM Parity & Multi-Provider Orchestration (`@rudyrustam/agent`, `@rudyrustam/core`, `@rudyrustam/astra`)
- [x] **4-Tier Model Registry & Availability Fallback Invariant**: `FRONTIER_MODEL_REGISTRY` (Gemini 4 Argon/Neon/Carbon/Pro, Claude 5.5/5.1/4.6, Grok 4.7/4.6, GPT-5.6 Sol, Muse Wonder), `scoreComplexity()`, `evaluateQualityGate()` (<50ms heuristic escalation), serta fallback otomatis `404`/`429`/`503` (`Gemini 4 → Gemini 3.8 Flash`, `Claude 5.x → Claude Opus 4.6`).
- [x] **Native Multi-Provider Gateway, Thinking Budgets & Strict Contracts**: Native Anthropic Messages (`cache_control: ephemeral`, extended thinking, forced `tool_use`), Gemini (`thinkingConfig`, `cachedContent`, `responseSchema`, SSE `:streamGenerateContent`), xAI/OpenAI (`reasoning_effort`, `json_schema strict: true`, SSE), `resolveThinkingBudget()` dengan batas minimum `>=32,768` pada tugas mission-critical, `zodToJsonSchema(..., { strict: true })`, `generateStructured<T>()`, dan audit KV-cache kanonis (`compileCanonicalPrefix`, `auditKvCachePrefix`).
- [x] **Gemini Live Wire Protocol & MCP Frontier Tools**: Bi-directional wire frames pada `AstraGateway`, sorting alat MCP kanonis (`centaury_route_frontier_model`, `centaury_compile_kv_prefix`, `centaury_list_frontier_models`), dan Showcase/CLI integrasi penuh.
