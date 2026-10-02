import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PetLibrary } from '../src/library.ts';
import { readPackageFiles } from '../src/archive.ts';
import { normalizePet } from '../src/pet-package.ts';

async function setup(run: (library: PetLibrary, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(join(tmpdir(), 'pet-reliability-'));
  try { await run(new PetLibrary(root, resolve('assets')), root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}
test('library: staging cleanup failure cannot strand the mutation lock', async t => setup(async library => {
  const pet = await normalizePet(await readPackageFiles('assets'), 'Sample');
  const write = fs.writeFile, remove = fs.rm;
  let failedWrite = false, failedRemove = false;
  t.mock.method(fs, 'writeFile', async (...args: Parameters<typeof fs.writeFile>) => {
    if (!failedWrite && String(args[0]).includes('/stage-')) { failedWrite = true; throw new Error('Injected staging write failure'); }
    return write(...args);
  });
  t.mock.method(fs, 'rm', async (...args: Parameters<typeof fs.rm>) => {
    if (!failedRemove && String(args[0]).includes('/stage-')) { failedRemove = true; throw new Error('Injected staging cleanup failure'); }
    return remove(...args);
  });
  try {
    await assert.rejects(library.install(pet), /staging cleanup failure/);
    await assert.rejects(fs.access(join(library.root, 'mutation.lock')), { code: 'ENOENT' });
    assert.equal((await library.install(pet)).name, 'Sample');
  } finally { t.mock.restoreAll(); }
}));
test('library: only absent selection file is silent, missing selected artwork warns', async () => setup(async library => {
  assert.equal((await library.loadSelected()).warning, undefined);
  const imported = await library.install(await normalizePet(await readPackageFiles('assets'), 'Sample'));
  await library.select(imported.id);
  await fs.rm(join(library.libraryDir, imported.id), { recursive: true });
  const fallback = await library.loadSelected();
  assert.equal(fallback.pet.id, 'bundled-pi');
  assert.match(fallback.warning!, /unavailable/);
}));
