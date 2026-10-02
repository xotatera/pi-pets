import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PetLibrary } from '../src/library.ts';
import { preserveAssets } from '../scripts/preserve-assets.ts';

test('preservation: verified managed copy survives source restoration', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'pet-preserve-'));
  try {
    const source = join(root, 'modified'); await fs.cp('assets', source, { recursive: true });
    const original = await fs.readFile(join(source, 'idle/00.png'));
    const library = new PetLibrary(join(root, 'config'), resolve('assets'));
    const info = await preserveAssets(library, source, 'Recovered imported pet');
    await fs.rm(source, { recursive: true });
    const managed = await library.load(info.id);
    assert.deepEqual(Buffer.from(managed.frames.idle[0], 'base64'), original);
    assert.equal((await library.loadSelected()).pet.id, 'bundled-pi');
    await assert.rejects(preserveAssets(library, join(root, 'invalid'), 'Bad'));
    assert.deepEqual(Buffer.from((await library.load(info.id)).frames.idle[0], 'base64'), original);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
