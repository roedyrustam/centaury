# Centaury Framework — Technical Blueprint & Architecture Design
**Framework Name**: Centaury (`@centaury/core`)  
**Tagline**: *The Autonomous Fullstack Engine for Super-Intelligent Systems*  
**Document Status**: Official Architecture Specification  
**Version**: 1.0.0-alpha  

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
│   │   │   ├── server.ts      # Ultra-fast Bun server with native WebSocket upgrade
│   │   │   ├── router.ts      # Trie-based route matcher & middleware pipeline
│   │   │   ├── rpc.ts         # Type-safe RPC dispatcher without codegen
│   │   │   ├── context.ts     # Request context, KV-cache prefix tracker
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
│   ├── agent/                 # Dual-Citizen MCP v1.x & AST Server
│   │   ├── src/
│   │   │   ├── mcp.ts         # Model Context Protocol server endpoints
│   │   │   ├── inspector.ts   # Live route & schema reflection
│   │   │   ├── memory.ts      # Episodic vector memory connector
│   │   │   └── index.ts
│   │   └── package.json
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

---

## 6. Risk Assessment & Mitigation

1. **Risk: Malicious Ephemeral UI Injection**
   * *Mitigation*: The `@centaury/ephemeral` parser strictly maps tokens to pre-registered Custom Elements. Raw `<script>` tags, inline `javascript:` URIs, and `onclick` attributes are mathematically stripped before mounting.
2. **Risk: Network Latency Spikes on Multimodal Audio**
   * *Mitigation*: Astra Gateway implements local audio jitter buffers and automatic fallbacks to compact text streaming if WebSocket packet loss exceeds 5%.
3. **Risk: High Frontier LLM Token Costs**
   * *Mitigation*: Aggressive Prefix KV-Caching (`kv-cache-prefix-optimizer`) locks static prompt prefixes across turns, securing 75-90% cost discounts.
