/**
 * @file index.ts
 * @description Public exports for @centaury/signals
 */

export * from './signal';
export * from './dom';
export * from './elements';

// Auto-register elements if in browser
import { registerCentauryElements } from './elements';
registerCentauryElements();
