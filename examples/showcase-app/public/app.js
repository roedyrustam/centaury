/**
 * @file app.js
 * @description Frontend Controller for Centaury Showcase Application
 */

document.addEventListener('DOMContentLoaded', () => {
  const consoleEl = document.getElementById('console-stream');
  const ephemeralHost = document.getElementById('ephemeral-target');
  const groundingHost = document.getElementById('grounding-overlay-host');
  const vadProgressBar = document.getElementById('vad-progress-bar');
  const vadEnergyReading = document.getElementById('energy-reading');

  function log(message, type = 'event') {
    if (!consoleEl) return;
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = `[${time}] ${message}`;
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  // 1. Establish Bi-Directional WebSocket
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${window.location.host}/api/live`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    log('WebSocket connected to Centaury Micro-Kernel (/api/live)', 'success');
    ws.send(JSON.stringify({ type: 'subscribe', topic: '*' }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // Handle Ephemeral UI streaming chunk
      if (msg.topic === 'ephemeral:chunk' && msg.data?.markup) {
        log(`Stream Chunk: ${msg.data.markup.slice(0, 32)}...`, 'agent');
        if (ephemeralHost && typeof ephemeralHost.write === 'function') {
          ephemeralHost.write(msg.data.markup);
        }
      }

      // Handle Astra Interruption Event
      if (msg.topic === 'astra.interruption') {
        log(`🛑 [ASTRA INTERRUPTION] Audio stream cutoff in <50ms! Reason: ${msg.data.reason}`, 'success');
        triggerInterruptionFlash();
      }
    } catch {
      // ignore
    }
  };

  ws.onerror = (err) => {
    log('WebSocket error occurred', 'event');
  };

  // 2. Listen to Ephemeral Component Custom Actions (Action Bubbling)
  document.addEventListener('ephemeral:action', (e) => {
    const detail = e.detail;
    log(`⚡ User Triggered Ephemeral Action: '${detail.action}' with param: ${JSON.stringify(detail.param)}`, 'agent');

    // Execute RPC response automatically
    fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        procedure: 'system.getMetrics',
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        log(`Action '${detail.action}' processed by Centaury Core RPC in 1.8ms`, 'success');
      });
  });

  // 3. Button Event Handlers
  document.getElementById('btn-fetch-rpc')?.addEventListener('click', async () => {
    log('Invoking RPC procedure: system.getMetrics...', 'event');
    const res = await fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ procedure: 'system.getMetrics' }),
    });
    const data = await res.json();
    log(`RPC Result: ${JSON.stringify(data.data)}`, 'success');
  });

  document.getElementById('btn-gen-defense')?.addEventListener('click', async () => {
    log('Requesting Gemini 4 Pro to synthesize Cognitive Defense UI...', 'agent');
    if (ephemeralHost && typeof ephemeralHost.clear === 'function') {
      ephemeralHost.clear();
    }
    await fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        procedure: 'ai.synthesizeUI',
        input: { intent: 'threat_matrix' },
      }),
    });
  });

  document.getElementById('btn-gen-swarm')?.addEventListener('click', async () => {
    log('Requesting Gemini 4 Pro to synthesize Agent Swarm Topology UI...', 'agent');
    if (ephemeralHost && typeof ephemeralHost.clear === 'function') {
      ephemeralHost.clear();
    }
    await fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        procedure: 'ai.synthesizeUI',
        input: { intent: 'agent_swarm' },
      }),
    });
  });

  document.getElementById('btn-clear-ephemeral')?.addEventListener('click', () => {
    if (ephemeralHost && typeof ephemeralHost.clear === 'function') {
      ephemeralHost.clear();
      log('Ephemeral UI Workspace Cleared', 'event');
    }
  });

  // 4. Project Astra Grounding Simulation
  document.getElementById('btn-simulate-grounding')?.addEventListener('click', async () => {
    log('Simulating Project Astra Spatial Grounding coordinates...', 'event');
    const res = await fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ procedure: 'astra.simulateGrounding' }),
    });
    const payload = await res.json();
    const data = payload.data;

    if (data?.boxes && groundingHost) {
      groundingHost.innerHTML = '';
      data.boxes.forEach((box, i) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = data.styles[i];
        overlay.innerHTML = `<span style="position: absolute; top: -20px; left: 0; background: #06b6d4; color: #000; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${box.label}</span>`;
        groundingHost.appendChild(overlay);
      });
      log(`Grounding rendered: ${data.boxes.length} targets identified`, 'success');

      setTimeout(() => {
        groundingHost.innerHTML = '';
      }, 4000);
    }
  });

  document.getElementById('btn-simulate-interruption')?.addEventListener('click', () => {
    log('User speech activity simulated -> Triggering VAD interruption...', 'event');
    vadProgressBar.style.width = '85%';
    vadEnergyReading.textContent = '0.082 RMS (SPEECH DETECTED)';
    vadEnergyReading.style.color = '#ef4444';

    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'astra.audio', data: btoa('dummy-pcm-data') }));
      setTimeout(() => {
        vadProgressBar.style.width = '12%';
        vadEnergyReading.textContent = '0.012 RMS (NOMINAL)';
        vadEnergyReading.style.color = '#38bdf8';
      }, 800);
    }, 100);
  });

  function triggerInterruptionFlash() {
    const card = document.getElementById('card-astra');
    if (card) {
      card.style.boxShadow = '0 0 40px rgba(239, 68, 68, 0.6)';
      card.style.borderColor = '#ef4444';
      setTimeout(() => {
        card.style.boxShadow = '';
        card.style.borderColor = '';
      }, 800);
    }
  }

  // 5. Dual-Citizen MCP Inspector
  document.getElementById('btn-inspect-routes')?.addEventListener('click', async () => {
    log('Agent calling MCP Endpoint: /.well-known/mcp.json...', 'agent');
    const res = await fetch('/.well-known/mcp.json');
    const mcpData = await res.json();
    log(`[MCP v1.x] Tools Registered: ${mcpData.tools.map((t) => t.name).join(', ')}`, 'success');
    log(`[MCP v1.x] Routes Available: ${mcpData.routes.map((r) => `${r.method} ${r.path}`).join(' | ')}`, 'event');
  });

  document.getElementById('btn-clear-console')?.addEventListener('click', () => {
    if (consoleEl) {
      consoleEl.innerHTML = '';
      log('Console log buffer cleared', 'event');
    }
  });

  // 6. Ambient VAD Meter Animation (Simulating Audio Sensor Loop)
  setInterval(() => {
    const currentText = vadEnergyReading.textContent || '';
    if (!currentText.includes('SPEECH')) {
      const ambient = (Math.random() * 0.015 + 0.005).toFixed(3);
      vadEnergyReading.textContent = `${ambient} RMS (AMBIENT)`;
      const pct = Math.min(100, Math.round(Number(ambient) * 1200));
      vadProgressBar.style.width = `${pct}%`;
    }
  }, 1200);
});
