import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crc32 } from '../src/archive.ts';
import { validateFrame } from '../src/png.ts';

function palette(size: number): Buffer {
  const chunk = Buffer.alloc(size + 12);
  chunk.writeUInt32BE(size); chunk.write('PLTE', 4);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
  return chunk;
}
for (const kind of ['empty', 'nontriple', 'oversized', 'duplicate', 'after pixels']) {
  test(`PNG: rejects CRC-correct ${kind} PLTE`, async () => {
    const png = await readFile('assets/idle/00.png');
    const size = kind === 'empty' ? 0 : kind === 'nontriple' ? 1 : kind === 'oversized' ? 771 : 3;
    const chunk = palette(size), insertion = kind === 'after pixels' ? png.length - 12 : 33;
    const invalid = Buffer.concat([png.subarray(0, insertion), chunk, ...(kind === 'duplicate' ? [chunk] : []), png.subarray(insertion)]);
    assert.throws(() => validateFrame(invalid), /PLTE/i);
  });
}
test('PNG: accepts one valid optional RGB palette before image data', async () => {
  const png = await readFile('assets/idle/00.png');
  assert.doesNotThrow(() => validateFrame(Buffer.concat([png.subarray(0, 33), palette(3), png.subarray(33)])));
});
