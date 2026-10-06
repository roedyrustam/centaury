# Centaury Framework — Development Roadmap & Phase Progression
**Framework**: Centaury (`@centaury/core`)  
**Lifecycle Pipeline**: 8-Phase Production Protocol (`zero-to-prod-orchestrator`)  

---

## Roadmap Phases Overview

```
[Phase 1: Micro-Kernel] ────> [Phase 2: Micro-Signals] ────> [Phase 3: Ephemeral UI]
                                                                    │
[Phase 6: Hardening]    <──── [Phase 5: MCP & AST]     <──── [Phase 4: Astra Gateway]
         │
         v
[Phase 7: Showcase App] ────> [Phase 8: Production Release]
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
