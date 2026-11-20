/**
 * @file astra.test.ts
 * @description Test suite for @centaury/astra multimodal audio, vision & gateway
 */

import { describe, it, expect } from 'bun:test';
import { AstraAudioPipeline } from '../src/audio';
import { AstraVisionPipeline } from '../src/vision';
import {
  AstraGateway,
  createGeminiAudioInputFrame,
  createGeminiClientTextFrame,
  createGeminiLiveSetupMessage,
  createGeminiVideoInputFrame,
  parseGeminiLiveServerMessage,
} from '../src/live';

describe('@centaury/astra Audio Pipeline & VAD Interruption', () => {
  it('calculates near-zero RMS energy for silent PCM buffer', () => {
    const pipeline = new AstraAudioPipeline();
    const silent = new Int16Array(1600); // 100ms of silence at 16kHz
    const energy = pipeline.calculateRmsEnergy(silent);
    expect(energy).toBe(0);
  });

  it('detects voice activity when PCM energy exceeds threshold', () => {
    const pipeline = new AstraAudioPipeline({ vadThreshold: 0.05 });
    const loudSpeech = new Int16Array(1600);
    for (let i = 0; i < loudSpeech.length; i++) {
      loudSpeech[i] = Math.sin(i / 10) * 16000; // High amplitude sine wave
    }

    const res = pipeline.processInputChunk(loudSpeech);
    expect(res.hasVoice).toBe(true);
    expect(res.energy).toBeGreaterThan(0.05);
  });

  it('triggers sub-150ms interruption when user speaks while model is speaking', () => {
    let interrupted = false;
    const pipeline = new AstraAudioPipeline({
      vadThreshold: 0.05,
      onInterruption: () => {
        interrupted = true;
      },
    });

    pipeline.setModelSpeaking(true);

    const loudSpeech = new Int16Array(1600);
    for (let i = 0; i < loudSpeech.length; i++) {
      loudSpeech[i] = Math.sin(i / 10) * 16000;
    }

    const res = pipeline.processInputChunk(loudSpeech);
    expect(res.interrupted).toBe(true);
    expect(interrupted).toBe(true);
  });

  it('converts Web Audio Float32Array to 16-bit linear PCM correctly', () => {
    const floats = new Float32Array([0.0, 1.0, -1.0, 0.5]);
    const pcm = AstraAudioPipeline.floatTo16BitPCM(floats);
    expect(pcm.byteLength).toBe(8); // 4 samples * 2 bytes
  });
});

describe('@centaury/astra Vision Pipeline & Screen Grounding', () => {
  it('converts normalized 0..1000 box coordinates to viewport pixels accurately', () => {
    const normalizedBox = {
      ymin: 100, // 10%
      xmin: 200, // 20%
      ymax: 400, // 40%
      xmax: 700, // 70%
      label: 'Submit Order Button',
    };

    const viewportW = 1920;
    const viewportH = 1080;

    const pixelBox = AstraVisionPipeline.normalizeToPixels(normalizedBox, viewportW, viewportH);

    expect(pixelBox.top).toBe(108); // 10% of 1080
    expect(pixelBox.left).toBe(384); // 20% of 1920
    expect(pixelBox.height).toBe(324); // 30% of 1080
    expect(pixelBox.width).toBe(960); // 50% of 1920
    expect(pixelBox.label).toBe('Submit Order Button');
  });

  it('generates valid CSS overlay style string with visual effects', () => {
    const pixelBox = { top: 100, left: 150, width: 200, height: 80 };
    const style = AstraVisionPipeline.toOverlayStyle(pixelBox);

    expect(style).toContain('position: absolute;');
    expect(style).toContain('top: 100px;');
    expect(style).toContain('left: 150px;');
    expect(style).toContain('border: 2px solid #06b6d4;');
  });

  it('validates JPEG and WebP frames correctly', () => {
    // Fake JPEG header [0xFF, 0xD8]
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0x00, 0x00]);
    const info = AstraVisionPipeline.validateFrame(fakeJpeg);
    expect(info.mimeType).toBe('image/jpeg');
    expect(info.byteLength).toBe(4);
  });
});

describe('@centaury/astra Multimodal Live Gateway', () => {
  it('creates grounding and interruption payloads correctly', () => {
    const gateway = new AstraGateway();

    const grounding = gateway.createGroundingPayload(
      [{ ymin: 100, xmin: 100, ymax: 200, xmax: 200 }],
      1000,
      1000
    );

    expect(grounding.type).toBe('astra.grounding');
    expect(grounding.boxes.length).toBe(1);

    const interruption = gateway.createInterruptionPayload();
    expect(interruption.type).toBe('astra.interruption');
    expect(interruption.action).toBe('cutoff_audio');
  });

  it('builds Gemini Multimodal Live setup/media frames and handles server interruptions + toolCalls', () => {
    let interruptedCount = 0;
    const gateway = new AstraGateway({
      onInterruption: () => {
        interruptedCount++;
      },
    });

    const setup = createGeminiLiveSetupMessage({
      model: 'models/gemini-4-pro-live',
      systemInstruction: 'Respond concisely.',
      voiceName: 'Aoede',
    }) as any;
    expect(setup.setup.model).toBe('models/gemini-4-pro-live');
    expect(setup.setup.generationConfig.responseModalities).toEqual(['AUDIO']);

    const audioFrame = createGeminiAudioInputFrame('AAAA', 16000) as any;
    expect(audioFrame.realtimeInput.mediaChunks[0].mimeType).toBe('audio/pcm;rate=16000');

    const videoFrame = createGeminiVideoInputFrame('BBBB', 'image/webp') as any;
    expect(videoFrame.realtimeInput.mediaChunks[0].mimeType).toBe('image/webp');

    const textFrame = createGeminiClientTextFrame('Inspect screen') as any;
    expect(textFrame.clientContent.turnComplete).toBe(true);

    expect((gateway.toUpstreamMediaFrame({ type: 'astra.audio', data: 'AAAA' }) as any).realtimeInput).toBeDefined();
    expect((gateway.toUpstreamMediaFrame({ type: 'astra.frame', data: 'BBBB' }) as any).realtimeInput).toBeDefined();
    expect((gateway.toUpstreamMediaFrame({ type: 'astra.text', data: 'hi' }) as any).clientContent).toBeDefined();

    const parsedTurn = gateway.handleUpstreamServerMessage({
      setupComplete: true,
      serverContent: {
        modelTurn: {
          parts: [
            { text: 'Scanning UI...' },
            { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'PCM_OUT' } },
          ],
        },
      },
      toolCall: {
        functionCalls: [{ id: 'tc-1', name: 'centaury_list_routes', args: { filter: '/api' } }],
      },
    });
    expect(parsedTurn.setupComplete).toBe(true);
    expect(parsedTurn.textChunks).toEqual(['Scanning UI...']);
    expect(parsedTurn.audioChunks[0].mimeType).toBe('audio/pcm;rate=24000');
    expect(parsedTurn.toolCalls[0].name).toBe('centaury_list_routes');

    const interrupted = gateway.handleUpstreamServerMessage(
      JSON.stringify({ serverContent: { interrupted: true, turnComplete: true } })
    );
    expect(interrupted.interrupted).toBe(true);
    expect(interruptedCount).toBe(1);

    const standalone = parseGeminiLiveServerMessage({ serverContent: { turnComplete: true } });
    expect(standalone.turnComplete).toBe(true);
  });
});
