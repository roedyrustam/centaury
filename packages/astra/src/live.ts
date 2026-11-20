/**
 * @file live.ts
 * @description Project Astra / Gemini Multimodal Live Gateway & Bi-Directional Wire Protocol Bridge for Centaury
 */

import { AstraAudioPipeline } from './audio';
import { AstraVisionPipeline, NormalizedBoundingBox, type PixelBoundingBox } from './vision';

export interface AstraGatewayOptions {
  onAudioChunk?: (pcm: Uint8Array) => void;
  onScreenFrame?: (frame: Uint8Array | string) => void;
  onInterruption?: () => void;
  vadThreshold?: number;
}

export interface AstraClientMessage {
  type: 'astra.audio' | 'astra.frame' | 'astra.text';
  data: string; // Base64 or text
  mimeType?: string;
  sampleRateHz?: number;
  timestamp?: number;
}

export interface GeminiLiveSetupOptions {
  model?: string;
  systemInstruction?: string;
  responseModalities?: Array<'AUDIO' | 'TEXT'>;
  voiceName?: string;
  tools?: Array<Record<string, unknown>>;
}

export interface ParsedGeminiLiveMessage {
  setupComplete: boolean;
  interrupted: boolean;
  turnComplete: boolean;
  textChunks: string[];
  audioChunks: Array<{ mimeType: string; data: string }>;
  toolCalls: Array<{ id?: string; name: string; args: Record<string, unknown> }>;
}

/**
 * Create a Gemini Multimodal Live WebSocket initial `setup` frame.
 */
export function createGeminiLiveSetupMessage(options: GeminiLiveSetupOptions = {}): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    responseModalities: options.responseModalities ?? ['AUDIO'],
  };
  if (options.voiceName) {
    generationConfig.speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: options.voiceName },
      },
    };
  }

  const setup: Record<string, unknown> = {
    model: options.model ?? 'models/gemini-4-pro-live',
    generationConfig,
  };
  if (options.systemInstruction) {
    setup.systemInstruction = { parts: [{ text: options.systemInstruction }] };
  }
  if (options.tools && options.tools.length > 0) {
    setup.tools = options.tools;
  }

  return { setup };
}

/**
 * Wrap a 16-bit linear PCM audio chunk into a Gemini Live `realtimeInput` frame.
 */
export function createGeminiAudioInputFrame(
  pcm16kBase64: string,
  sampleRateHz = 16000
): Record<string, unknown> {
  return {
    realtimeInput: {
      mediaChunks: [
        {
          mimeType: `audio/pcm;rate=${sampleRateHz}`,
          data: pcm16kBase64,
        },
      ],
    },
  };
}

/**
 * Wrap a JPEG/WebP video frame into a Gemini Live `realtimeInput` frame.
 */
export function createGeminiVideoInputFrame(
  base64Frame: string,
  mimeType = 'image/jpeg'
): Record<string, unknown> {
  return {
    realtimeInput: {
      mediaChunks: [
        {
          mimeType,
          data: base64Frame,
        },
      ],
    },
  };
}

/**
 * Wrap a client text turn into a Gemini Live `clientContent` frame.
 */
export function createGeminiClientTextFrame(text: string, endOfTurn = true): Record<string, unknown> {
  return {
    clientContent: {
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: endOfTurn,
    },
  };
}

/**
 * Parse an incoming Gemini Multimodal Live WebSocket server message, normalizing barge-in interruptions, audio/text parts, and tool calls.
 */
export function parseGeminiLiveServerMessage(
  raw: string | Record<string, unknown>
): ParsedGeminiLiveMessage {
  const msg = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, any>;
  const serverContent = msg.serverContent as Record<string, any> | undefined;
  const parts = (serverContent?.modelTurn?.parts as Array<Record<string, any>> | undefined) ?? [];

  const textChunks: string[] = [];
  const audioChunks: Array<{ mimeType: string; data: string }> = [];

  for (const part of parts) {
    if (typeof part.text === 'string' && part.text.length > 0) {
      textChunks.push(part.text);
    }
    if (part.inlineData && typeof part.inlineData.data === 'string') {
      audioChunks.push({
        mimeType: String(part.inlineData.mimeType ?? 'audio/pcm;rate=24000'),
        data: part.inlineData.data,
      });
    }
  }

  const functionCalls = (msg.toolCall?.functionCalls as Array<Record<string, any>> | undefined) ?? [];
  const toolCalls = functionCalls.map((fc) => ({
    id: fc.id ? String(fc.id) : undefined,
    name: String(fc.name ?? ''),
    args: (fc.args && typeof fc.args === 'object' ? fc.args : {}) as Record<string, unknown>,
  }));

  return {
    setupComplete: Boolean(msg.setupComplete),
    interrupted: Boolean(serverContent?.interrupted),
    turnComplete: Boolean(serverContent?.turnComplete),
    textChunks,
    audioChunks,
    toolCalls,
  };
}

export class AstraGateway {
  public readonly audioPipeline: AstraAudioPipeline;
  private options: AstraGatewayOptions;

  constructor(options: AstraGatewayOptions = {}) {
    this.options = options;
    this.audioPipeline = new AstraAudioPipeline({
      vadThreshold: options.vadThreshold,
      onInterruption: () => {
        this.options.onInterruption?.();
      },
    });
  }

  /**
   * Handle incoming message from client WebSocket
   */
  public handleClientMessage(msg: AstraClientMessage): {
    handled: boolean;
    interrupted?: boolean;
    hasVoice?: boolean;
  } {
    if (msg.type === 'astra.audio') {
      const buffer = Uint8Array.from(atob(msg.data), (c) => c.charCodeAt(0));
      const res = this.audioPipeline.processInputChunk(buffer);
      this.options.onAudioChunk?.(buffer);
      return {
        handled: true,
        interrupted: res.interrupted,
        hasVoice: res.hasVoice,
      };
    }

    if (msg.type === 'astra.frame') {
      this.options.onScreenFrame?.(msg.data);
      return { handled: true };
    }

    if (msg.type === 'astra.text') {
      return { handled: true };
    }

    return { handled: false };
  }

  /**
   * Build initial Gemini Multimodal Live WebSocket setup frame.
   */
  public createUpstreamSetupMessage(options?: GeminiLiveSetupOptions): Record<string, unknown> {
    return createGeminiLiveSetupMessage(options);
  }

  /**
   * Translate a client Astra WS message into a native Gemini Multimodal Live upstream JSON frame.
   */
  public toUpstreamMediaFrame(msg: AstraClientMessage): Record<string, unknown> | null {
    if (msg.type === 'astra.audio') {
      return createGeminiAudioInputFrame(msg.data, msg.sampleRateHz ?? 16000);
    }
    if (msg.type === 'astra.frame') {
      return createGeminiVideoInputFrame(msg.data, msg.mimeType ?? 'image/jpeg');
    }
    if (msg.type === 'astra.text') {
      return createGeminiClientTextFrame(msg.data, true);
    }
    return null;
  }

  /**
   * Parse an upstream Gemini Live server frame and synchronize Astra VAD speaking/interruption state.
   */
  public handleUpstreamServerMessage(raw: string | Record<string, unknown>): ParsedGeminiLiveMessage {
    const parsed = parseGeminiLiveServerMessage(raw);
    if (parsed.audioChunks.length > 0 && !parsed.interrupted && !parsed.turnComplete) {
      this.audioPipeline.setModelSpeaking(true);
    }
    if (parsed.interrupted) {
      this.audioPipeline.setModelSpeaking(false);
      this.options.onInterruption?.();
    } else if (parsed.turnComplete) {
      this.audioPipeline.setModelSpeaking(false);
    }
    return parsed;
  }

  /**
   * Dispatch ground coordinates to client
   */
  public createGroundingPayload(
    boxes: NormalizedBoundingBox[],
    viewportWidth: number,
    viewportHeight: number
  ): {
    type: 'astra.grounding';
    boxes: PixelBoundingBox[];
    styles: string[];
    timestamp: number;
  } {
    const pixelBoxes = boxes.map((box) =>
      AstraVisionPipeline.normalizeToPixels(box, viewportWidth, viewportHeight)
    );

    return {
      type: 'astra.grounding',
      boxes: pixelBoxes,
      styles: pixelBoxes.map((b) => AstraVisionPipeline.toOverlayStyle(b)),
      timestamp: Date.now(),
    };
  }

  /**
   * Create an interruption notification payload
   */
  public createInterruptionPayload() {
    return {
      type: 'astra.interruption',
      timestamp: Date.now(),
      action: 'cutoff_audio',
    };
  }
}
