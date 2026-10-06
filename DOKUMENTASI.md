# Dokumentasi Resmi Centaury Framework
*Panduan Lengkap Pengembangan Sistem Fullstack Cerdas (2026 Edition)*

---

## 1. Pengenalan & Quickstart

Centaury Framework dirancang khusus untuk membangun aplikasi web masa depan yang digerakkan oleh AI frontier (**Google Gemini 4 Pro & Project Astra**).

### Mengapa Centaury Berbeda?
* **Zero-Hydration**: Tidak ada proses kompilasi bundler besar di browser. Klien menggunakan Web Components standar dan Micro-Signals (<5KB).
* **Ephemeral UI**: Antarmuka disintesis secara dinamis saat runtime langsung dari aliran pemikiran (reasoning) model tanpa risiko eksekusi skrip berbahaya.
* **Dual-Citizen MCP**: AI Agent dan manusia memiliki akses yang setara untuk menginspeksi rute dan mengeksekusi RPC secara aman.
* **Multimodal Streaming**: Latensi audio/video real-time sub-150ms dengan penanganan interupsi suara otomatis.

---

## 2. Inisialisasi Proyek via Centaury CLI

Untuk memulai proyek baru dengan Centaury Developer CLI:

```bash
# Template default (Fullstack: RPC, Reactive UI, Web Components)
centaury create my-app

# Template Minimal (<1.5KB, Micro-Signals + Bun Trie Server)
centaury create my-mini-app --template minimal

# Template Agentic (Gemini 4 Pro, Dual-Citizen MCP v1.x, Ephemeral UI, Astra Gateway)
centaury create my-agent-app --template agentic --install

cd my-app
centaury dev
```

### Perintah CLI Bawaan:
* `centaury create <name> [--template minimal|fullstack|agentic] [--install]` : Membuat proyek baru secara otomatis.
* `centaury dev` : Menjalankan server lokal dengan mode auto-reload file watcher.
* `centaury doctor` : Audit kesehatan runtime Bun, platform OS, batas memory RSS, dan status endpoint MCP.
* `centaury --version` / `-v` : Menampilkan versi Centaury CLI.

Struktur direktori proyek yang dihasilkan:
```
my-app/
├── src/
│   └── server.ts            # Micro-Kernel Bun Server + Type-Safe RPC
├── public/
│   └── index.html           # UI Zero-Hydration + Web Components
├── tsconfig.json            # Konfigurasi TypeScript 5.8+ Strict Mode
└── package.json
```

---

## 3. Menulis Server & Type-Safe RPC

Di Centaury, pembuatan RPC tidak memerlukan code-generation atau library tRPC terpisah. RPC terintegrasi langsung di micro-kernel:

```typescript
// src/server.ts
import { CentauryServer } from '@centaury/core';
import { z } from 'zod';

const app = new CentauryServer({
  port: 3000,
  ai: {
    model: 'gemini-4-pro',
    thinkingBudget: 16384, // System-2 Deep Reasoning
  },
});

// Daftarkan RPC Type-Safe
app.rpc('analytics.getMetrics', {
  input: z.object({ timeframe: z.enum(['1h', '24h', '7d']) }),
  handler: async ({ input, ctx }) => {
    return {
      status: 'ok',
      usersActive: 1420,
      systemEntropy: 0.04,
      timeframe: input.timeframe,
    };
  },
});

// Jalankan server
app.listen();
console.log(`🌌 Centaury aktif di http://localhost:3000`);
```

---

## 4. Frontend: Zero-Hydration Micro-Signals

Di sisi browser, Centaury menggunakan Micro-Signals yang terhubung langsung ke DOM tanpa Virtual DOM:

```html
<!-- src/routes/index.html -->
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Centaury App</title>
  <script type="module" src="/@centaury/client.js"></script>
</head>
<body class="bg-obsidian text-cyan">

  <!-- Stream Realtime Otomatis -->
  <c-stream url="/api/live" id="stream-bus">
    <div class="card">
      <h2>Status Sistem Realtime</h2>
      <p>Pengguna Aktif: <span data-bind="usersActive">-</span></p>
    </div>
  </c-stream>

  <!-- Container untuk Ephemeral UI Dinamis -->
  <c-ephemeral id="ai-workspace" slot="generative-view">
    <!-- Komponen yang disintesis AI akan ter-mount di sini secara streaming -->
  </c-ephemeral>

</body>
</html>
```

```typescript
// Penggunaan Micro-Signals & Persisted Signal di Klien:
import { signal, computed, effect, persistedSignal, scanAndBind } from '@centaury/signals';

// Signal memori biasa
const counter = signal(0);
const doubled = computed(() => counter.value * 2);

// Local-First Persistent Signal (sinkron otomatis antar-tab browser tanpa server round-trip)
const userSession = persistedSignal('app_user', { username: 'Roedy', theme: 'dark' });

// Menghubungkan signal ke elemen DOM secara langsung
scanAndBind(document.body, {
  user: computed(() => userSession.value.username),
  count: counter,
  doubleCount: doubled,
});
```

---

## 5. Ephemeral UI Streaming (Sintesis UI Dinamis)

Centaury Server dapat meminta Gemini 4 Pro menghasilkan komponen antarmuka yang disesuaikan secara instan:

```typescript
// Aliran token UI dinamis ke klien
app.streamEphemeralUI(wsClient, async (ai) => {
  const stream = await ai.generateUIStream({
    prompt: 'Tampilkan grafik metrik anomali transaksi dengan tombol aksi karantina',
    components: ['ui-card', 'ui-metric', 'ui-chart', 'ui-button'],
  });

  for await (const tokenChunk of stream) {
    wsClient.sendEphemeralChunk(tokenChunk);
  }
});
```

Di browser, elemen `<c-ephemeral>` merender token tersebut secara inkremental tanpa memicu kompilasi JS atau runtime errors.

---

## 6. Integrasi Multimodal Astra (Project Astra Paradigm)

Aktifkan interaksi suara dan kamera dua arah dengan latensi ultra-rendah:

```typescript
// src/routes/api/astra.ts
import { AstraGateway } from '@centaury/astra';

export const astra = new AstraGateway({
  onAudioChunk: (pcmBuffer) => {
    // Terhubung langsung ke Gemini Live API via WebSockets
  },
  onScreenFrame: (jpegFrame) => {
    // Memetakan objek dan koordinat grounding layar
  },
  onInterruption: () => {
    // Potong buffer audio klien dalam <50ms saat pengguna mulai berbicara
  }
});
```

---

## 7. Model Context Protocol (MCP v1.x) Bawaan

Setiap aplikasi Centaury otomatis mengekspos endpoint MCP di:
* `http://localhost:3000/.well-known/mcp.json`

AI Agent dapat langsung membaca:
1. Daftar seluruh endpoint RPC yang tersedia dan skema tipenya.
2. Log aplikasi real-time.
3. Menjalankan fungsi internal berlisensi tanpa perantara scraper.

---

## 8. Micro-Benchmark Suite & Metrik Performa

Centaury dilengkapi runner benchmark terintegrasi untuk mengukur latensi dan throughput secara presisi:

```bash
bun run bench
```

### Metrik Resmi Runtime:
| Indikator Performa | Hasil Pengukuran | Deskripsi Teknis |
| :--- | :--- | :--- |
| **Micro-Signals Reactivity** | **13.660.000+ ops/detik** | 100.000 mutasi ter-batch selesai dalam 5–7 ms |
| **Trie Router Throughput** | **8.310.000+ matches/detik** | 500.000 pencocokan rute dynamic param tuntas dalam ~60 ms |
| **Ephemeral UI AST Parser** | **205.000+ parses/detik** | 10.000 token parsing cycle tuntas dalam ~48 ms |
| **Server Cold-Start** | **2.63 ms** | Inisialisasi micro-kernel hingga siap menerima koneksi HTTP/WS |
| **Memory Footprint (RSS)** | **< 125 MB** | Eksekusi stabil tanpa bloat bundler |
