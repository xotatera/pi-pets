import { createHash } from 'node:crypto';
import { frameCounts, type Animation, type FrameLibrary } from './assets.ts';
import { limits, safePackagePath, type PackageFiles } from './archive.ts';
import { validateFrame } from './png.ts';

export type NormalizedPet = { name: string; files: PackageFiles; frames: FrameLibrary };
function json(files: PackageFiles, path: string): Record<string, any> {
  const data = files.get(path);
  if (!data || data.length > limits.manifest) throw new Error(`Missing or oversized ${path}`);
  const parsed: unknown = JSON.parse(Buffer.from(data).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`Invalid ${path}`);
  return parsed as Record<string, any>;
}
export function petName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80 || /[\x00-\x1f\x7f-\x9f]/.test(value)) throw new Error('Pet name must contain 1–80 printable characters');
  return value.trim();
}
export async function normalizePet(input: PackageFiles, fallbackName: string): Promise<NormalizedPet> {
  const manifest = json(input, 'manifest.json');
  const original = typeof manifest.sprite_version === 'number';
  let name = manifest.name ?? fallbackName;
  let schemaVersion = 1;
  if (input.has('metadata.json')) {
    const metadata = json(input, 'metadata.json');
    if (metadata.schemaVersion !== 1 && metadata.schemaVersion !== 2) throw new Error('Unsupported pet metadata version');
    schemaVersion = metadata.schemaVersion;
    name = metadata.name;
  }
  if (original && schemaVersion !== 1) throw new Error('Original exports cannot declare normalized schema 2');
  name = petName(name);
  if (original) {
    if (manifest.sprite_version !== 2 || manifest.cell_width !== 192 || manifest.cell_height !== 208) throw new Error('Unsupported original export version or cell dimensions');
    if (!Array.isArray(manifest.rows) || !Array.isArray(manifest.frames_per_row)) throw new Error('Original manifest must describe animation rows');
    for (const [state, count] of Object.entries(frameCounts)) {
      const row = manifest.rows.indexOf(state);
      if (row < 0 || manifest.frames_per_row[row] !== count || manifest.rows.lastIndexOf(state) !== row) throw new Error(`Wrong frame count for ${state}`);
    }
    if (manifest.sprite_sheet) {
      if (typeof manifest.sprite_sheet !== 'string') throw new Error('Invalid spritesheet path');
      safePackagePath(manifest.sprite_sheet);
      const atlas = input.get(manifest.sprite_sheet);
      if (!atlas) throw new Error('Declared spritesheet is missing');
      if (typeof manifest.sha256 !== 'string' || createHash('sha256').update(atlas).digest('hex') !== manifest.sha256) throw new Error('Spritesheet SHA-256 mismatch');
    }
    if (![...input.keys()].some(path => path.startsWith('frames/'))) throw new Error('Spritesheet-only packages are unsupported; export individual frames too');
  } else if (!manifest.sha256 || typeof manifest.sha256 !== 'object' || Array.isArray(manifest.sha256)) throw new Error('Normalized manifest requires frame SHA-256 digests');
  const files: PackageFiles = new Map();
  const frames = {} as FrameLibrary, ordered: Record<string, any> = {}, digests: Record<string, string> = {};
  let total = 0;
  for (const [state, legacyCount] of Object.entries(frameCounts) as [Animation, number][]) {
    const declared = manifest[state];
    const count = !original && schemaVersion === 2 ? (Array.isArray(declared) ? declared.length : 0) : legacyCount;
    total += count;
    if (count < 1 || count > 256 || total > 256) throw new Error(`Invalid frame count for ${state}`);
    const paths = Array.from({ length: count }, (_, i) => `${state}/${String(i).padStart(2, '0')}.png`);
    if (!original && JSON.stringify(declared) !== JSON.stringify(paths)) throw new Error(`Invalid ordered frame paths for ${state}`);
    const encoded: string[] = [];
    for (const path of paths) {
      const png = input.get((original ? 'frames/' : '') + path);
      if (!png) throw new Error(`Missing frame: ${path}`);
      validateFrame(png);
      const digest = createHash('sha256').update(png).digest('hex');
      if (!original && manifest.sha256[path] !== digest) throw new Error(`Frame SHA-256 mismatch: ${path}`);
      files.set(path, Uint8Array.from(png)); digests[path] = digest; encoded.push(Buffer.from(png).toString('base64'));
    }
    ordered[state] = paths; frames[state] = encoded;
  }
  ordered.sha256 = digests;
  files.set('manifest.json', Buffer.from(JSON.stringify(ordered, null, 2) + '\n'));
  files.set('metadata.json', Buffer.from(JSON.stringify({ schemaVersion, name }, null, 2) + '\n'));
  return { name, files, frames };
}
