/**
 * @file audio.ts
 * @description Bi-directional PCM Audio Pipeline & VAD Interruption Detector for Project Astra in Centaury
 */

export interface AudioFrameConfig {
  sampleRate: number; // 16000 for input, 24000 for output
  channels: number;   // 1 (mono)
  bitDepth: number;   // 16-bit PCM
}

export class AstraAudioPipeline {
  public static readonly DEFAULT_INPUT_CONFIG: AudioFrameConfig = {
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
  };

  public static readonly DEFAULT_OUTPUT_CONFIG: AudioFrameConfig = {
    sampleRate: 24000,
    channels: 1,
    bitDepth: 16,
  };

  private vadThreshold: number;
  private isModelSpeaking = false;
  private onInterruptionCallback?: () => void;

  constructor(options: { vadThreshold?: number; onInterruption?: () => void } = {}) {
    this.vadThreshold = options.vadThreshold ?? 0.045; // Energy threshold for speech detection
    this.onInterruptionCallback = options.onInterruption;
  }

  /**
   * Set model speaking state
   */
  public setModelSpeaking(speaking: boolean): void {
    this.isModelSpeaking = speaking;
  }

  /**
   * Calculate RMS (Root Mean Square) energy of 16-bit linear PCM audio buffer
   */
  public calculateRmsEnergy(pcmBuffer: Int16Array | Uint8Array): number {
    let int16Data: Int16Array;
    if (pcmBuffer instanceof Uint8Array) {
      int16Data = new Int16Array(
        pcmBuffer.buffer,
        pcmBuffer.byteOffset,
        pcmBuffer.byteLength / 2
      );
    } else {
      int16Data = pcmBuffer;
    }

    if (int16Data.length === 0) return 0;

    let sum = 0;
    for (let i = 0; i < int16Data.length; i++) {
      const normalized = int16Data[i] / 32768.0;
      sum += normalized * normalized;
    }

    return Math.sqrt(sum / int16Data.length);
  }

  /**
   * Process incoming user microphone audio chunk
   * Returns true if user voice activity is detected
   */
  public processInputChunk(pcmBuffer: Int16Array | Uint8Array): {
    hasVoice: boolean;
    energy: number;
    interrupted: boolean;
  } {
    const energy = this.calculateRmsEnergy(pcmBuffer);
    const hasVoice = energy >= this.vadThreshold;
    let interrupted = false;

    // Fast-path interruption: if model is speaking and user starts talking, interrupt immediately!
    if (hasVoice && this.isModelSpeaking) {
      this.isModelSpeaking = false;
      interrupted = true;
      this.onInterruptionCallback?.();
    }

    return {
      hasVoice,
      energy,
      interrupted,
    };
  }

  /**
   * Helper to convert Float32Array (Web Audio API) to 16-bit PCM ArrayBuffer
   */
  public static floatTo16BitPCM(float32Array: Float32Array): Uint8Array {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); // Little endian
    }
    return new Uint8Array(buffer);
  }
}
