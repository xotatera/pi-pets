import { lstat, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { validateFrame } from './png.ts';

export type Animation = 'idle' | 'running' | 'waiting' | 'review' | 'failed' | 'jumping' | 'waving';
export type FrameLibrary = Record<Animation, readonly string[]>;
export const frameCounts: Record<Animation, number> = {
  idle: 6, running: 6, waiting: 6, review: 6, failed: 8, jumping: 5, waving: 4,
};
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function safeRead(root: string, path: string, maxSize: number): Promise<Buffer> {
  const full = join(root, path);
  const info = await lstat(full);
  if (!info.isFile() || info.size > maxSize || await realpath(full) !== full) throw new Error('Unsafe asset');
  return readFile(full);
}

/** All-or-nothing library; a broken installation renders text, never crashes Pi. */
export async function loadFrames(root: string): Promise<FrameLibrary | null> {
  try {
    root = await realpath(resolve(root));
    const manifest = JSON.parse((await safeRead(root, 'manifest.json', 16 * 1024)).toString('utf8')) as Record<string, unknown>;
    const integrity = manifest.sha256;
    if (!integrity || typeof integrity !== 'object' || Array.isArray(integrity)) return null;
    const digests = integrity as Record<string, unknown>;
    const library = {} as FrameLibrary;
    for (const [animation, count] of Object.entries(frameCounts) as [Animation, number][]) {
      const paths = manifest[animation];
      if (!Array.isArray(paths) || paths.length !== count) return null;
      const frames: string[] = [];
      for (let index = 0; index < count; index++) {
        const expected = `${animation}/${String(index).padStart(2, '0')}.png`;
        if (paths[index] !== expected) return null;
        const png = await safeRead(root, expected, 1024 * 1024);
        if (digests[expected] !== createHash('sha256').update(png).digest('hex')) return null;
        if (png.length < 45 || !png.subarray(0, 8).equals(signature)
          || png.toString('ascii', 12, 16) !== 'IHDR'
          || png.readUInt32BE(16) !== 192 || png.readUInt32BE(20) !== 208
          || png.toString('ascii', png.length - 8, png.length - 4) !== 'IEND') return null;
        validateFrame(png);
        frames.push(png.toString('base64'));
      }
      library[animation] = frames;
    }
    return library;
  } catch { return null; }
}
