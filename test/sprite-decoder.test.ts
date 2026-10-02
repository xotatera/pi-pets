import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { SpriteDecoder, type SpriteDefinition } from '../src/sprite-decoder.ts';
import type { Animation } from '../src/assets.ts';

const tracks: Record<Animation, readonly number[]> = { idle: [0, 1], running: [0, 1], waiting: [0, 1], review: [0, 1], failed: [0, 1], jumping: [0, 1], waving: [0, 1] };
function spec(changes: Partial<SpriteDefinition> = {}): SpriteDefinition {
  return { name: 'Synthetic', cellWidth: 192, cellHeight: 208, columns: 2, rows: 1, tracks, ...changes };
}
async function sheet(format: 'png' | 'webp' = 'png'): Promise<Buffer> {
  const red = await sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 250, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const blue = await sharp({ create: { width: 192, height: 208, channels: 4, background: { r: 0, g: 0, b: 250, alpha: 0.5 } } }).png().toBuffer();
  const image = sharp({ create: { width: 384, height: 208, channels: 4, background: '#00000000' } }).composite([{ input: red, left: 0, top: 0 }, { input: blue, left: 192, top: 0 }]);
  return format === 'png' ? image.png().toBuffer() : image.webp({ lossless: true }).toBuffer();
}
test('decoder: preserves PNG/WebP order, duplicate tracks and transparent pixels', async () => {
  for (const format of ['png', 'webp'] as const) {
    const definition = spec({ tracks: { ...tracks, idle: [1, 0, 1] } });
    const pet = await new SpriteDecoder().decode(await sheet(format), definition);
    assert.equal(pet.frames.idle.length, 3);
    assert.equal(pet.frames.running.length, 2);
    assert.equal(JSON.parse(Buffer.from(pet.files.get('metadata.json')!).toString()).schemaVersion, 2);
    const first = await sharp(Buffer.from(pet.frames.idle[0], 'base64')).raw().toBuffer({ resolveWithObject: true });
    assert.ok(first.data[2] > first.data[0]);
    assert.ok(first.data[3] < 255);
    assert.equal(pet.frames.idle[0], pet.frames.idle[2]);
  }
});
for (const kind of ['oversized bytes', 'huge dimensions', 'wrong dimensions', 'cell size', 'index', 'fractional index', 'source frames', 'normalized frames', 'format', 'malformed', 'aborted']) {
  test(`decoder: rejects ${kind}`, async () => {
    let data: Uint8Array = await sheet(); let definition = spec();
    if (kind === 'oversized bytes') data = new Uint8Array(16 * 1024 * 1024 + 1);
    if (kind === 'huge dimensions') data = await sharp({ create: { width: 4096, height: 4096, channels: 4, background: '#0000' } }).png().toBuffer();
    if (kind === 'wrong dimensions') definition = spec({ columns: 3 });
    if (kind === 'cell size') definition = { ...spec(), cellWidth: 1 as 192 };
    if (kind === 'index') definition = spec({ tracks: { ...tracks, idle: [2] } });
    if (kind === 'fractional index') definition = spec({ tracks: { ...tracks, idle: [0.5] } });
    if (kind === 'source frames') definition = spec({ columns: 257, rows: 1 });
    if (kind === 'normalized frames') definition = spec({ tracks: { ...tracks, idle: Array(257).fill(0) } });
    if (kind === 'format') data = Buffer.from('GIF89a');
    if (kind === 'malformed') data = Buffer.from((await sheet()).subarray(0, 48));
    const signal = kind === 'aborted' ? AbortSignal.abort() : undefined;
    await assert.rejects(new SpriteDecoder().decode(data, definition, signal));
  });
}
test('decoder: concurrent decode is busy and releases after failure', async () => {
  const decoder = new SpriteDecoder();
  const bytes = await sheet();
  const first = decoder.decode(bytes, spec());
  await assert.rejects(decoder.decode(bytes, spec()), /busy/i);
  await first;
  await assert.rejects(decoder.decode(Buffer.from('garbage'), spec()));
  assert.equal((await decoder.decode(await sheet(), spec())).name, 'Synthetic');
});
