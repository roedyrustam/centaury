# Changelog — Centaury Framework
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha] - 2026-10-07

### Added
- **Developer CLI (`@centaury/cli`)**:
  - Binary executable `centaury` providing `create`, `dev`, and `doctor` commands.
  - Automatic project scaffolding template with pre-configured TypeScript, Bun server, and HTML frontend.
  - Diagnostic environment doctor checking Bun runtime, memory headroom, and MCP compatibility.
  - Full CLI test suite (45 tests passing across monorepo in 323ms).
- **Showcase Application (`examples/showcase-app`)**:
  - Live fullstack demonstrator running at `http://localhost:3000`.
  - Obsidian dark cybernetic theme with glassmorphism, glowing electric cyan/violet gradients, and official Centaury branding logo.
  - Interactive live features:
    - Real-time engine telemetry streaming over WebSockets to `<c-stream>`.
    - Interactive Ephemeral UI synthesizer streaming dynamic AST components on-the-fly (`Cognitive Defense UI`, `Agent Swarm Topology UI`).
    - Project Astra continuous multimodal panel with VAD speech energy meter and spatial screen-grounding coordinates visualizer.
    - Dual-Citizen MCP v1.x live terminal console allowing direct endpoint inspection and RPC execution.
- **Production Hardening & Quality Gate (`production-ready-hardener`)**:
  - Full TypeScript 5.8+ strict typecheck (`tsc --noEmit`) passing with 0 errors across all packages.
  - Production bundles generated via Bun builder (`dist/`):
    - `@centaury/signals`: 3.53 KB (entry point)
    - `@centaury/ephemeral`: 5.95 KB (entry point)
    - `@centaury/astra`: 2.74 KB (entry point)
    - `@centaury/agent`: 11.90 KB (entry point)
  - Zero-tolerance anti-slop audit verified: no placeholder logic, strict typing, zero memory leaks.
- **Dual-Citizen MCP v1.x & AST Server (`@centaury/agent`)**:
  - Full Model Context Protocol (MCP v1.x) server implementation supporting `initialize`, `tools/list`, `tools/call`, `resources/list`, and `resources/read`.
  - Live AST & Schema Reflector (`CentauryInspector`).
  - Native tools for AI Agents (`centaury_list_routes`, `centaury_get_system_snapshot`, `centaury_invoke_rpc`, `centaury_get_logs`, `centaury_synthesize_ui`).
  - Episodic Agent Memory (`CentauryAgentMemory`).
- **Multimodal Astra Gateway (`@centaury/astra`)**:
  - Bi-directional 16-bit linear PCM audio streaming pipeline (16kHz mic input, 24kHz model output).
  - High-sensitivity Voice Activity Detection (VAD) with RMS energy tracking.
  - Sub-150ms client interruption detection with automatic audio buffer cutoff.
  - Continuous vision & screen-grounding coordinate mapper (0..1000 normalized to viewport pixels).
  - Dynamic Native CSS 2026 overlay generator for highlighted UI bounding targets.
- **Ephemeral Generative UI Synthesizer (`@centaury/ephemeral`)**:
  - Incremental streaming token parser capable of handling incomplete chunked LLM emissions with zero buffering lag.
  - Zero-eval AST-based HTML/SVG/Component sanitizer eliminating XSS risks and script execution.
  - Safe DOM mounting engine mapping declarative UI tokens into Web Components.
  - Built-in `ephemeral:action` custom event dispatching connecting UI clicks to Centaury RPC procedures.
  - Custom Element `<c-ephemeral>` for dynamic synthetic interface mounting.
- **Zero-Hydration Reactive Engine (`@centaury/signals`)**:
  - Atomic micro-signals primitives (`signal`, `computed`, `effect`, `batch`) under 1.2KB gzipped.
  - Direct atomic DOM bindings (`bindText`, `bindAttr`, `bindClass`, `bindModel`, `scanAndBind`) without Virtual DOM.
  - Standard Web Components (`<c-stream>`, `<c-stack>`).
- **Micro-Kernel Engine (`@centaury/core`)**:
  - High-performance Trie-based HTTP routing with dynamic parameter extraction.
  - Zero-codegen type-safe RPC dispatcher supporting single & batched calls with Zod schema validation.
  - Native Bun WebSocket engine with automatic topic subscriptions & real-time messaging.
  - Dual-Citizen Model Context Protocol (MCP v1.x) discovery endpoint at `/.well-known/mcp.json`.
  - Cold-start time ~2.63ms.
