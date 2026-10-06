/**
 * @file vision.ts
 * @description Continuous Vision & Screen-Grounding Pipeline for Project Astra in Centaury
 */

export interface NormalizedBoundingBox {
  ymin: number; // 0..1000
  xmin: number; // 0..1000
  ymax: number; // 0..1000
  xmax: number; // 0..1000
  label?: string;
}

export interface PixelBoundingBox {
  top: number;
  left: number;
  width: number;
  height: number;
  label?: string;
}

export class AstraVisionPipeline {
  /**
   * Convert normalized 0..1000 coordinates to actual viewport pixels
   */
  public static normalizeToPixels(
    box: NormalizedBoundingBox,
    viewportWidth: number,
    viewportHeight: number
  ): PixelBoundingBox {
    const top = Math.round((box.ymin / 1000) * viewportHeight);
    const left = Math.round((box.xmin / 1000) * viewportWidth);
    const bottom = Math.round((box.ymax / 1000) * viewportHeight);
    const right = Math.round((box.xmax / 1000) * viewportWidth);

    return {
      top,
      left,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
      label: box.label,
    };
  }

  /**
   * Generate Native CSS 2026 Anchor Positioning / absolute style string for visual highlight overlay
   */
  public static toOverlayStyle(pixelBox: PixelBoundingBox): string {
    return [
      `position: absolute;`,
      `top: ${pixelBox.top}px;`,
      `left: ${pixelBox.left}px;`,
      `width: ${pixelBox.width}px;`,
      `height: ${pixelBox.height}px;`,
      `border: 2px solid #06b6d4;`,
      `background: rgba(6, 182, 212, 0.15);`,
      `box-shadow: 0 0 15px rgba(6, 182, 212, 0.4);`,
      `border-radius: 6px;`,
      `pointer-events: none;`,
      `transition: all 0.12s ease-out;`,
      `z-index: 99999;`,
    ].join(' ');
  }

  /**
   * Validate image frame before sending to Gemini Multimodal Live API
   */
  public static validateFrame(frameBase64OrBuffer: string | Uint8Array): {
    mimeType: string;
    byteLength: number;
  } {
    if (typeof frameBase64OrBuffer === 'string') {
      const isJpeg = frameBase64OrBuffer.startsWith('/9j/') || frameBase64OrBuffer.includes('image/jpeg');
      return {
        mimeType: isJpeg ? 'image/jpeg' : 'image/webp',
        byteLength: Math.round((frameBase64OrBuffer.length * 3) / 4),
      };
    }

    // Inspect magic bytes for Uint8Array (0xFF, 0xD8 for JPEG, 0x52, 0x49 for WebP/RIFF)
    const isJpeg = frameBase64OrBuffer[0] === 0xff && frameBase64OrBuffer[1] === 0xd8;
    return {
      mimeType: isJpeg ? 'image/jpeg' : 'image/webp',
      byteLength: frameBase64OrBuffer.byteLength,
    };
  }
}
