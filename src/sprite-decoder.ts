import { createHash } from 'node:crypto';
import { frameCounts, type Animation } from './assets.ts';
import { normalizePet, type NormalizedPet } from './pet-package.ts';
import type { PackageFiles } from './archive.ts';

export type SpriteDefinition = {
  name: string;
  cellWidth: 192;
  cellHeight: 208;
  columns: number;
  rows: number;
  tracks: Record<Animation, readonly number[]>;
  fallbackStates?: readonly Animation[];
};

export class SpriteDecoder {
  private busy = false;
  async decode(bytes: Uint8Array, definition: SpriteDefinition, signal?: AbortSignal): Promise<NormalizedPet> {
    if (this.busy) throw new Error('Sprite decoder is busy; retry');
    this.busy = true;
    try {
      signal?.throwIfAborted();
      if (bytes.length > 16 * 1024 * 1024 || bytes.length < 12) throw new Error('Spritesheet input size is invalid');
      const { cellWidth, cellHeight, columns, rows, tracks } = definition;
      if (cellWidth !== 192 || cellHeight !== 208 || !Number.isInteger(columns) || !Number.isInteger(rows)
        || columns < 1 || rows < 1 || columns * rows > 256) throw new Error('Unsupported spritesheet geometry');
      const states = Object.keys(frameCounts) as Animation[];
      let total = 0;
      for (const state of states) {
        const sequence = tracks[state];
        if (!Array.isArray(sequence) || sequence.length < 1 || sequence.length > 256 || (total += sequence.length) > 256
          || sequence.some(index => !Number.isInteger(index) || index < 0 || index >= columns * rows)) {
          throw new Error(`Invalid spritesheet track: ${state}`);
        }
      }
      // Import only when requested, so absent native binaries cannot break existing pets.
      const { default: sharp } = await import('sharp');
      signal?.throwIfAborted();
      const input = Buffer.from(bytes);
      const source = sharp(input, { limitInputPixels: 16_000_000, animated: false, failOn: 'error' });
      const metadata = await source.metadata();
      if (!['png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1 || metadata.pageHeight && metadata.pageHeight !== metadata.height
        || metadata.width !== cellWidth * columns || metadata.height !== cellHeight * rows
        || !metadata.width || !metadata.height || metadata.width * metadata.height > 16_000_000) {
        throw new Error('Unsupported spritesheet format or dimensions');
      }
      signal?.throwIfAborted();
      const { data, info } = await source.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.channels !== 4 || info.width !== metadata.width || info.height !== metadata.height) throw new Error('Invalid decoded spritesheet');
      const files: PackageFiles = new Map();
      const manifest: Record<string, unknown> = {};
      const digests: Record<string, string> = {};
      const encoded = new Map<number, Buffer>();
      for (const state of states) {
        const paths: string[] = [];
        for (const [position, index] of tracks[state].entries()) {
          signal?.throwIfAborted();
          let png = encoded.get(index);
          if (!png) {
            const left = (index % columns) * cellWidth, top = Math.floor(index / columns) * cellHeight;
            const cell = Buffer.alloc(cellWidth * cellHeight * 4);
            for (let y = 0; y < cellHeight; y++) data.copy(cell, y * cellWidth * 4, ((top + y) * info.width + left) * 4, ((top + y) * info.width + left + cellWidth) * 4);
            png = await sharp(cell, { raw: { width: cellWidth, height: cellHeight, channels: 4 } }).png().toBuffer();
            encoded.set(index, png);
          }
          const path = `${state}/${String(position).padStart(2, '0')}.png`;
          paths.push(path); files.set(path, png);
          digests[path] = createHash('sha256').update(png).digest('hex');
        }
        manifest[state] = paths;
      }
      manifest.sha256 = digests;
      files.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
      files.set('metadata.json', Buffer.from(JSON.stringify({ schemaVersion: 2, name: definition.name })));
      signal?.throwIfAborted();
      return await normalizePet(files, definition.name);
    } finally { this.busy = false; }
  }
}
