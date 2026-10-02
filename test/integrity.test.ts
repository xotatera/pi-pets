import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadFrames } from '../src/assets.ts';

test('assets: interior PNG payload corruption triggers text fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-pet-integrity-'));
  try {
    await cp('assets', root, { recursive: true });
    assert.ok(await loadFrames(root));
    const path = join(root, 'idle/00.png');
    const png = await readFile(path);
    const idat = png.indexOf(Buffer.from('IDAT'));
    assert.ok(idat > 0);
    png[idat + 5] ^= 1;
    await writeFile(path, png);
    assert.equal(await loadFrames(root), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
