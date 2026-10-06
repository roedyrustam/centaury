/**
 * @file setup.ts
 * @description Happy-DOM environment setup for @centaury/signals tests
 */

import { Window } from 'happy-dom';

const win = new Window();
(globalThis as any).window = win;
(globalThis as any).document = win.document;
(globalThis as any).HTMLElement = win.HTMLElement;
(globalThis as any).customElements = win.customElements;
