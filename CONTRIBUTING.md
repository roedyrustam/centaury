# Contributing to Centaury Framework 🌌

First off, thank you for considering contributing to **Centaury**! It's people like you that make open source such a fantastic community.

Centaury is designed to be the autonomous fullstack engine for the AI era — fast, type-safe, zero-hydration, and natively integrated with Super-Intelligent AI systems like Google Gemini 4 Pro and Project Astra.

---

## 🛠️ Development Setup

Centaury is structured as a high-performance **Bun monorepo**.

### Prerequisites
* **Bun**: `v1.2.0` or higher ([Install Bun](https://bun.sh))
* **Git**: latest version

### Clone & Install
```bash
git clone https://github.com/roedyrustam/centaury.git
cd centaury
bun install
```

### Useful Commands

```bash
# Run unit & integration test suites
bun test

# Strict TypeScript typechecking
bun run typecheck

# Run performance micro-benchmarks
bun run bench

# Build production bundles & .d.ts declarations
bun run build

# Run end-to-end release verification
bun run release:check

# Start local interactive showcase app
bun run dev
```

---

## 🏗️ Monorepo Architecture

Our monorepo packages are located in `packages/`:

* **[`@centaury/core`](packages/core)**: The high-throughput Bun Micro-Kernel, Trie router, RPC engine, and WebSocket live bus.
* **[`@centaury/signals`](packages/signals)**: Zero-Hydration reactive engine (<1.5KB), atomic primitives, and direct DOM bindings.
* **[`@centaury/ephemeral`](packages/ephemeral)**: Streaming token parser, zero-eval AST sanitizer, and generative UI custom elements.
* **[`@centaury/astra`](packages/astra)**: Project Astra multimodal gateway (VAD speech energy, interruption cutoff, continuous vision grounding).
* **[`@centaury/agent`](packages/agent)**: Dual-Citizen Model Context Protocol (MCP v1.x) server, AST reflection, and episodic agent memory.
* **[`@centaury/cli`](packages/cli)**: Developer CLI tool and project scaffolding archetypes.

---

## 📜 Pull Request Process

1. **Fork the repository** and create your branch from `main`:
   ```bash
   git checkout -b feat/my-killer-feature
   ```
2. **Adhere to Code Standards**:
   - Write clean, modern TypeScript.
   - Maintain zero placeholders, zero dummy code, and 100% strict type safety (`bun run typecheck`).
   - Keep client packages lightweight (<5KB total budget).
3. **Write Unit Tests**:
   - Ensure all new features or bug fixes are covered by tests in the relevant `packages/*/test/` directory.
   - Run `bun test` to ensure all tests pass.
4. **Run Release Check**:
   - Verify `bun run release:check` passes without errors.
5. **Submit your Pull Request** with a descriptive summary of your changes.

---

## 💬 Community & Support

* Report bugs or request features via [GitHub Issues](https://github.com/roedyrustam/centaury/issues).
* Star the repository on GitHub if you find it helpful!

Thank you for building the future of autonomous fullstack engineering with us! 🚀
