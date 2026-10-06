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

## 2. Struktur Proyek & Inisialisasi

Untuk memulai proyek baru dengan Centaury:

```bash
bun create centaury-app ./my-app
cd ./my-app
bun run dev
```

Struktur direktori:
```
my-app/
├── src/
│   ├── routes/
│   │   ├── index.html       # Entrypoint UI dengan Native Web Components
│   │   └── api/
│   │       └── live.ts      # Bi-directional WebSocket & RPC handlers
│   ├── server.ts            # Micro-Kernel Bun Server
│   └── centaury.config.ts   # Konfigurasi AI thinking budget & model
├── public/                  # Aset statis & logo
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
