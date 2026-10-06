/**
 * @file index.ts
 * @description Public exports for @centaury/ephemeral
 */

export * from './sanitizer';
export * from './parser';
export * from './mount';

import { registerEphemeralComponents } from './mount';
registerEphemeralComponents();
