/**
 * @file sanitizer.ts
 * @description Zero-Eval AST HTML/SVG/Component Sanitizer for Ephemeral UI in Centaury
 */

export const ALLOWED_TAGS = new Set([
  // Native Layout & Typography
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article',
  'header', 'footer', 'main', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'strong', 'em', 'small', 'b', 'i', 'code', 'pre', 'hr', 'br',
  // Native Media & Form Primitives
  'button', 'input', 'label', 'form', 'select', 'option', 'textarea', 'progress',
  // SVG Vector Graphics
  'svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'defs', 'lineargradient', 'stop',
  // Centaury Pre-Registered Ephemeral Custom Elements
  'ui-card', 'ui-header', 'ui-metric', 'ui-button', 'ui-badge', 'ui-grid', 'ui-chart', 'ui-alert',
  'ui-stack', 'ui-icon', 'ui-progress', 'ui-table', 'ui-status', 'c-stack'
]);

export const ALLOWED_ATTRS = new Set([
  'class', 'id', 'style', 'title', 'role', 'aria-label', 'aria-hidden', 'tabindex',
  'href', 'src', 'alt', 'width', 'height', 'type', 'value', 'placeholder', 'disabled',
  // SVG attributes
  'viewbox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'x', 'y',
  // Ephemeral DSL Component Props
  'elevation', 'variant', 'badge', 'action', 'param', 'change', 'trend', 'status', 'icon', 'direction', 'gap'
]);

export interface SanitizedNode {
  tag: string;
  attrs: Record<string, string>;
  children: Array<SanitizedNode | string>;
}

export class EphemeralSanitizer {
  /**
   * Check if a tag is allowed
   */
  public static isTagAllowed(tagName: string): boolean {
    return ALLOWED_TAGS.has(tagName.toLowerCase());
  }

  /**
   * Check if an attribute is allowed and safe
   */
  public static isAttrSafe(attrName: string, attrValue: string): boolean {
    const lowerName = attrName.toLowerCase();

    // 1. Block any inline event handlers (onclick, onload, etc.)
    if (lowerName.startsWith('on')) return false;

    // 2. Allow data-* attributes
    if (lowerName.startsWith('data-')) return true;

    // 3. Verify against allowed attributes
    if (!ALLOWED_ATTRS.has(lowerName)) return false;

    // 4. Check for dangerous URI schemes in href / src
    if (lowerName === 'href' || lowerName === 'src') {
      const lowerVal = attrValue.trim().toLowerCase();
      if (
        lowerVal.startsWith('javascript:') ||
        lowerVal.startsWith('vbscript:') ||
        lowerVal.startsWith('data:text/html')
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sanitize an attribute dictionary
   */
  public static cleanAttributes(attrs: Record<string, string>): Record<string, string> {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (this.isAttrSafe(key, value)) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
}
