/**
 * @file parser.ts
 * @description Streaming Token Parser for Ephemeral UI in Centaury
 */

import { EphemeralSanitizer, SanitizedNode } from './sanitizer';

export class EphemeralStreamParser {
  private buffer = '';
  private nodeStack: SanitizedNode[] = [];
  public rootNodes: SanitizedNode[] = [];
  private onNodeCallback?: (node: SanitizedNode) => void;

  constructor(onNodeMounted?: (node: SanitizedNode) => void) {
    this.onNodeCallback = onNodeMounted;
  }

  /**
   * Feed a new text token chunk from LLM stream
   */
  public write(chunk: string): void {
    this.buffer += chunk;
    this.processBuffer();
  }

  /**
   * Reset parser state
   */
  public reset(): void {
    this.buffer = '';
    this.nodeStack = [];
    this.rootNodes = [];
  }

  /**
   * Parse a complete markup string all at once
   */
  public static parse(markup: string): SanitizedNode[] {
    const parser = new EphemeralStreamParser();
    parser.write(markup);
    return parser.rootNodes;
  }

  private processBuffer(): void {
    // If buffer ends with an unclosed tag (< without >), defer parsing the incomplete fragment
    const lastOpen = this.buffer.lastIndexOf('<');
    const lastClose = this.buffer.lastIndexOf('>');
    let parseable = this.buffer;
    let remainder = '';

    if (lastOpen > lastClose) {
      parseable = this.buffer.slice(0, lastOpen);
      remainder = this.buffer.slice(lastOpen);
    }

    if (!parseable) return;

    // Regex for matching tags: <tag attr="val"...> or </tag> or <tag ... />
    const tagRegex = /<(\/)?([a-zA-Z0-9\-_]+)([^>]*)(\/)?>|([^<]+)/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = tagRegex.exec(parseable)) !== null) {
      const isClosing = match[1] === '/';
      const tagName = match[2];
      const rawAttrs = match[3];
      const textContent = match[5];
      const hasTrailingSlash = (rawAttrs || '').trim().endsWith('/');
      const isSelfClosing = match[4] === '/' || hasTrailingSlash;
      let cleanRawAttrs = rawAttrs || '';
      if (hasTrailingSlash) {
        cleanRawAttrs = cleanRawAttrs.trim().slice(0, -1);
      }

      // If plain text content outside tags
      if (textContent) {
        const trimmed = textContent.trim();
        if (trimmed.length > 0) {
          const parent = this.nodeStack[this.nodeStack.length - 1];
          if (parent) {
            parent.children.push(trimmed);
          }
        }
        lastIndex = tagRegex.lastIndex;
        continue;
      }

      if (!tagName || !EphemeralSanitizer.isTagAllowed(tagName)) {
        // Disallowed tag - skip and advance
        lastIndex = tagRegex.lastIndex;
        continue;
      }

      const lowerTag = tagName.toLowerCase();

      // 1. Closing tag </tag>
      if (isClosing) {
        if (this.nodeStack.length > 0) {
          const top = this.nodeStack[this.nodeStack.length - 1];
          if (top.tag === lowerTag) {
            const popped = this.nodeStack.pop()!;
            if (this.nodeStack.length === 0) {
              this.rootNodes.push(popped);
              this.onNodeCallback?.(popped);
            }
          }
        }
        lastIndex = tagRegex.lastIndex;
        continue;
      }

      // 2. Opening tag <tag ...>
      const attrs = this.parseAttributes(cleanRawAttrs);
      const cleanedAttrs = EphemeralSanitizer.cleanAttributes(attrs);

      const newNode: SanitizedNode = {
        tag: lowerTag,
        attrs: cleanedAttrs,
        children: [],
      };

      if (isSelfClosing) {
        const parent = this.nodeStack[this.nodeStack.length - 1];
        if (parent) {
          parent.children.push(newNode);
        } else {
          this.rootNodes.push(newNode);
          this.onNodeCallback?.(newNode);
        }
      } else {
        const parent = this.nodeStack[this.nodeStack.length - 1];
        if (parent) {
          parent.children.push(newNode);
        }
        this.nodeStack.push(newNode);
      }

      lastIndex = tagRegex.lastIndex;
    }

    // Keep remaining unparsed incomplete token in buffer
    this.buffer = parseable.slice(lastIndex) + remainder;
  }

  private parseAttributes(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9\-_:@]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(raw)) !== null) {
      const name = match[1];
      const value = match[2] ?? match[3] ?? match[4] ?? 'true';
      attrs[name] = value;
    }

    return attrs;
  }
}
