import type { Animation } from '../assets.ts';
import type { SpriteDefinition } from '../sprite-decoder.ts';
export type SourceId = 'codex-cli';
export type InstalledPet = { key: string; source: SourceId; name: string; category: 'custom'|'legacy'|'built-in'; cached: boolean; unavailable?: string };
export type SourceLocation = { path: string; kind: 'file'|'directory' };
export type PetSnapshot = { key: string; source: SourceId; name: string; definition: SpriteDefinition; bytes: Uint8Array; locations: readonly SourceLocation[]; fallbackStates: readonly Animation[] };
