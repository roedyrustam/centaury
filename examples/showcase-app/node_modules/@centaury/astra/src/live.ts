/**
 * @file live.ts
 * @description Project Astra Multimodal Live Gateway & WebSocket Bridge for Centaury
 */

import { AstraAudioPipeline } from './audio';
import { AstraVisionPipeline, NormalizedBoundingBox } from './vision';

export interface AstraGatewayOptions {
  onAudioChunk?: (pcm: Uint8Array) => void;
  onScreenFrame?: (frame: Uint8Array | string) => void;
  onInterruption?: () => void;
  vadThreshold?: number;
}

export interface AstraClientMessage {
  type: 'astra.audio' | 'astra.frame' | 'astra.text';
  data: string; // Base64 or text
  timestamp?: number;
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

    return { handled: false };
  }

  /**
   * Dispatch ground coordinates to client
   */
  public createGroundingPayload(
    boxes: NormalizedBoundingBox[],
    viewportWidth: number,
    viewportHeight: number
  ) {
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
