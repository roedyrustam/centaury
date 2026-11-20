# Centaury Framework — Technical Blueprint & Architecture Design
**Framework Name**: Centaury (`@rudyrustam/centaury` / `@rudyrustam/core`)  
**Tagline**: *The Autonomous Fullstack Engine for Super-Intelligent Systems*  
**Document Status**: Official Architecture Specification (11-Package Monorepo)  
**Version**: 1.2.0-alpha  

---

## 1. Architectural Philosophy: The Dual-Citizen Engine

Legacy web frameworks treat AI agents as external code generators that push git commits. Centaury inverts this paradigm:
* **Human Developers** write high-level intent, domain models, and core system constraints.
* **Autonomous AI Agents (Google Gemini 4 Pro / Project Astra)** observe runtime events, query the live AST graph, execute type-safe tools via native MCP v1.x, and stream **Ephemeral UI** components directly to connected browsers.
* **Zero-Hydration Client**: Rather than shipping monolithic component bundles that hydrate on load, Centaury streams semantic HTML/SVG/CSS with micro-signals (<5KB), guaranteeing zero hydration mismatch and sub-50ms INP.

---

## 2. Framework Architecture & Module Topography

```
c:\centaury/
├── packages/
│   ├── core/                  # Centaury Micro-Kernel (Bun HTTP/WS, Router, RPC)
│   │   ├── src/
│   │   │   ├── server.ts      # Ultra-fast Bun server with native WebSocket upgrade & safe serveStatic
│   │   │   ├── router.ts      # Trie-based route matcher & middleware pipeline
│   │   │   ├── rpc.ts         # Type-safe RPC dispatcher & zodToJsonSchema MCP metadata
│   │   │   ├── client.ts      # Lightweight browser/server RPC client (createRpcClient)
│   │   │   ├── context.ts     # Request context, KV-cache prefix tracker
│   │   │   ├── version.ts     # Single source of truth for CENTAURY_VERSION
│   │   │   └── index.ts
│   │   └── package.json
│   ├── signals/               # Zero-Hydration Client Reactive Core (<1.5KB)
│   │   ├── src/
│   │   │   ├── signal.ts      # Reactive primitives: signal, effect, computed
│   │   │   ├── dom.ts         # Direct DOM mutation without VDOM
│   │   │   └── index.ts
│   │   └── package.json
│   ├── ephemeral/             # Ephemeral UI & Synthetic Token Streamer
│   │   ├── src/
│   │   │   ├── parser.ts      # Streaming token parser for dynamic LLM UI
│   │   │   ├── sanitizer.ts   # Zero-eval AST-based HTML/SVG sanitizer
│   │   │   ├── mount.ts       # Incremental mounting engine
│   │   │   └── index.ts
│   │   └── package.json
│   ├── astra/                 # Multimodal Astra Gateway
│   │   ├── src/
│   │   │   ├── audio.ts       # Sub-150ms bidirectional PCM audio pipeline
│   │   │   ├── vision.ts      # Continuous video/canvas frame grounding
│   │   │   ├── live.ts        # Gemini Multimodal Live API connector
│   │   │   └── index.ts
│   │   └── package.json
│   ├── agent/                 # Dual-Citizen MCP v1.x, AST Reflector, Prompt Firewall & Self-Healer
│   │   ├── src/
│   │   │   ├── mcp.ts         # Model Context Protocol server endpoints & tools
│   │   │   ├── inspector.ts   # Live route & schema reflection
│   │   │   ├── memory.ts      # Episodic vector memory connector
│   │   │   ├── firewall.ts    # Prompt injection, SSRF & PII sanitization firewall
│   │   │   ├── self-heal.ts   # Autonomous crash diagnostics, workspace sourceContext & recovery
│   │   │   ├── ai-gateway.ts  # Frontier AI Gateway (Gemini / OpenAI-compatible / Mock + fallback)
│   │   │   └── index.ts
│   │   └── package.json
│   ├── sse/                   # Native Bun SSE Event Bus & Browser Client
│   ├── db/                    # Native bun:sqlite WAL Engine, Migrations, Vector Store & Repository
│   ├── auth/                  # Zero-Dependency Web Crypto Auth, RBAC/ReBAC, Passkeys & Legal Trio
│   │   ├── src/
│   │   │   ├── tokens.ts      # HS256 JWT tokens & PBKDF2-SHA256 hashing
│   │   │   ├── rbac.ts        # RBAC + ReBAC access control & auth middleware
│   │   │   ├── webauthn.ts    # FIDO2 / Passkey challenge lifecycle
│   │   │   ├── compliance.ts  # Mandatory Legal & Privacy Trio (/privacy, /terms, /delete-account)
│   │   │   └── index.ts
│   │   └── package.json
│   ├── workflow/              # A2A Agent Interoperability & Durable SQLite Saga Engine
│   │   ├── src/
│   │   │   ├── a2a.ts         # /.well-known/agent.json Agent Card & /a2a/tasks/* endpoints
│   │   │   ├── saga.ts        # Durable step replay, retries & reverse Saga compensation
│   │   │   └── index.ts
│   │   └── package.json
│   ├── centaury/              # Umbrella Framework Meta-Package (@rudyrustam/centaury)
│   └── cli/                   # Centaury Developer CLI ("centaury")
│       ├── src/
│       │   ├── cli.ts         # "centaury dev", "centaury build", "centaury agent"
│       │   └── index.ts
│       └── package.json
├── examples/
│   └── showcase-app/          # Live demonstrator app using all Centaury capabilities
├── PRD.md
├── BLUEPRINT.md
├── ERD.md
├── DOKUMENTASI.md
└── ROADMAP.md
```

---

## 3. Detailed Component & Protocol Specifications

### 3.1 Zero-Hydration Micro-Signals (`@centaury/signals`)
* **Atomic Reactivity**:
  ```typescript
  import { signal, effect } from '@centaury/signals';

  const count = signal(0);
  effect(() => {
    document.querySelector('#counter-val')!.textContent = String(count.value);
  });
  ```
* **Native Custom Elements**:
  * `<c-stream url="/api/live">`: Automatically binds incoming WebSocket/SSE data to local reactive signals without re-rendering enclosing trees.
  * `<c-ephemeral slot="ai-view">`: Dedicated isolated rendering target for AI-generated dynamic components.
  * `<c-astra active audio video>`: Connects mic/camera directly to the Centaury Astra gateway.

### 3.2 Ephemeral Generative UI Protocol (`@centaury/ephemeral`)
* Models stream semantic UI tokens in a lightweight declarative DSL:
  ```xml
  <ui-card elevation="glass">
    <ui-header title="Live Market Pulse" badge="realtime" />
    <ui-metric value="$42,850" change="+4.2%" />
    <ui-button action="trigger_order" param='{"symbol":"BTC"}'>Execute</ui-button>
  </ui-card>
  ```
* The parser converts these tokens into native Web Components in real time with sub-1ms rendering and zero risk of arbitrary script execution.

### 3.3 Gemini Multimodal Live & Project Astra Protocol (`@centaury/astra`)
* Bi-directional binary streaming over WebSockets:
  * Upstream: Raw 16kHz PCM audio chunks + JPEG/WebP screen capture frames.
  * Downstream: 24kHz audio chunks + text delta tokens + bounding box coordinates (`[ymin, xmin, ymax, xmax]`).
* Seamless client-side interruption: If the user begins speaking while the model is outputting audio, the gateway dispatches an immediate `interruption_signal`, cutting client audio playback in under 50ms.

### 3.4 Native Model Context Protocol (MCP v1.x) (`@centaury/agent`)
* Automatically exposes tools and resources for AI agents:
  * `centaury://routes`: Lists all available HTTP and RPC routes.
  * `centaury://inspect?route=/order`: Returns schema types and parameters.
  * `centaury://logs/tail`: Real-time streaming log output for autonomous debugging.
  * `tool_call: invoke_action`: Allows AI agents to execute internal server functions directly with authorized scopes.

---

## 4. Specialized Skill Orchestration Matrix

| Skill | Role in Centaury Implementation |
|---|---|
| `gemini-agent-booster` | Implements System-2 deep reasoning thinking budget configuration and Gemini 4 Pro context caching. |
| `frontier-ai-models-expert` | Establishes Project Astra continuous multimodal audio/video streaming specs. |
| `ephemeral-generative-ui-architect` | Designs the zero-eval streaming UI token parser and sandboxed component mounter. |
| `bun-runtime-expert` | Optimizes the Bun 1.2+ server, WebSocket upgrade handling, and static asset streaming. |
| `modern-css-native-expert` | Crafts the Native CSS 2026 design system (OKLCH color space, CSS Anchor Positioning, View Transitions Level 2). |
| `mcp-server-architect` | Implements the MCP v1.x specification for agentic introspection. |
| `anti-slop` | Enforces zero placeholder code, high-density modular logic, and pristine developer ergonomics. |
| `database-orm-expert` | Integrates lightweight SQLite/Turso and vector memory for episodic session persistence. |

---

## 5. Architectural Decision Records (ADRs)

| # | Decision | Alternatives Considered | Rationale |
|---|---|---|---|
| **ADR-001** | Bun as Primary Runtime | Node.js, Deno, Rust standalone | Bun provides the fastest TypeScript startup (<5ms), built-in native WebSockets, and zero transpilation configuration. |
| **ADR-002** | Zero-Hydration Micro-Signals | React 19 RSC, Svelte 5 Runes, SolidJS | Keeps the client runtime under 5KB, avoids hydration mismatch errors entirely, and allows streaming dynamic UI directly into the DOM. |
| **ADR-003** | Unified Realtime Stream (WS/SSE) | Traditional REST + Polling | Real-time multimodal voice/screen grounding requires bi-directional low-latency pipes (<150ms). |
| **ADR-004** | Declarative Ephemeral Token DSL | Raw arbitrary JS `eval()`, server-rendered HTML strings | Eliminates XSS vulnerabilities and ensures safe on-the-fly component synthesis by AI reasoning models. |
| **ADR-005** | Native MCP v1.x Protocol | Custom proprietary agent API | Adheres to the global standard for agent tool calling, making Centaury apps immediately controllable by any AI agent. |
| **ADR-006** | Prompt Firewall & Self-Healing Plugin in `@rudyrustam/agent` | Unchecked agent tool strings & uncaught process crashes | Blocks jailbreak/SSRF payloads pre-execution, redacts PII, and maps runtime stack frames deterministically to `astTarget` diagnostics (`/_heal/diagnostics`). |
| **ADR-007** | Zero-Dependency Web Crypto Auth & Legal Trio Plugin (`@rudyrustam/auth`) | Heavy external JWT/Passport libraries & manual compliance pages | Uses native `crypto.subtle` (HS256 + PBKDF2) and ships mandatory `/privacy`, `/terms`, `/delete-account` compliance routes out of the box (UU PDP, GDPR Art. 17, Apple 5.1.1v). |
| **ADR-008** | A2A Discovery & SQLite Durable Saga (`@rudyrustam/workflow`) | Heavy external Temporal clusters for single-node/edge apps | Enables zero-ops durable workflow step replay and reverse-order Saga compensation atop embedded WAL SQLite + standard `/.well-known/agent.json` interop. |

---

## 6. Risk Assessment & Pre-Mortem Mitigation

1. **Risk: Malicious Ephemeral UI Injection**
   * *Mitigation*: The `@rudyrustam/ephemeral` parser strictly maps tokens to pre-registered Custom Elements. Raw `<script>` tags, inline `javascript:` URIs, and `onclick` attributes are mathematically stripped before mounting.
2. **Risk: Network Latency Spikes on Multimodal Audio**
   * *Mitigation*: Astra Gateway implements local audio jitter buffers and automatic fallbacks to compact text streaming if WebSocket packet loss exceeds 5%.
3. **Risk: High Frontier LLM Token Costs**
   * *Mitigation*: Aggressive Prefix KV-Caching (`kv-cache-prefix-optimizer`) locks static prompt prefixes across turns, securing 75-90% cost discounts.
4. **Risk: Prompt Injection, SSRF & PII Leakage via Agent Inputs**
   * *Mitigation*: `CentauryPromptFirewall` scores and blocks injection/loopback/metadata payloads pre-execution while redacting email addresses, API tokens, and card sequences.
5. **Risk: Partial Multi-Step Execution Leaving Inconsistent External State**
   * *Mitigation*: `CentauryWorkflowEngine` persists completed step checkpoints in `_centaury_workflow_steps` for deterministic replay and runs compensating actions in reverse order on permanent step failure.

---

## 7. FinOps Cost Envelope Projection

- **Compute & Persistence Tier**: Embedded Bun runtime + WAL SQLite (`@rudyrustam/db`, `@rudyrustam/workflow`) keeps idle and edge worker cost near \$0–\$5/mo for single-node deployments (eliminating dedicated Redis/Temporal SaaS baselines).
- **Auth & Compliance Tier**: `@rudyrustam/auth` runs natively on Web Crypto (`crypto.subtle`) with zero per-MAU external identity vendor fees.
- **LLM Inference Controls**: Deterministic prefix locking (`registerKVCachePrefix`), firewall pre-filtering (`centaury_audit_prompt`), and bounded MCP context snapshots avoid wasted frontier reasoning tokens.
