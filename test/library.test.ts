import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readPackageFiles } from '../src/archive.ts';
import { normalizePet } from '../src/pet-package.ts';
import { PetLibrary } from '../src/library.ts';

async function setup(run: (library: PetLibrary, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(join(tmpdir(), 'pet-library-'));
  try { await run(new PetLibrary(root, resolve('assets')), root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}
const sample = async (name = 'Sample pet') => normalizePet(await readPackageFiles('assets'), name);

test('library: installed pets coexist, selection survives sessions, bundled Pi immutable', async () => setup(async (library, root) => {
  const original = await fs.readFile('assets/idle/00.png');
  const pet = await sample(); const installed = await library.install(pet);
  assert.equal((await library.list()).pets.length, 2);
  assert.equal((await library.loadSelected()).pet.id, 'bundled-pi');
  const selected = await library.select(installed.id);
  assert.equal(selected.name, 'Sample pet');
  assert.equal((await new PetLibrary(root, resolve('assets')).loadSelected()).pet.id, installed.id);
  assert.deepEqual(await fs.readFile('assets/idle/00.png'), original);
  await assert.rejects(library.install(pet, 'bundled-pi'), /bundled/i);
  await assert.rejects(library.load('../escape'), /ID/i);
}));
test('library: delete managed pet leaves original source and other pets untouched', async () => setup(async (library, root) => {
  const source = join(root, 'original.zip');
  await fs.writeFile(source, 'original source bytes');
  const first = await library.install(await sample('First'), undefined, [source]);
  const second = await library.install(await sample('Second'));
  await library.remove(first.id);
  assert.equal((await fs.readFile(source, 'utf8')), 'original source bytes');
  await assert.rejects(library.load(first.id));
  assert.equal((await library.load(second.id)).name, 'Second');
  await assert.rejects(library.remove('bundled-pi'), /bundled/i);
  await assert.rejects(library.remove('../outside'), /invalid|ID/i);
}));
test('library: deleting selected pet persists bundled Pi fallback', async () => setup(async (library, root) => {
  const pet = await library.install(await sample('Selected'));
  await library.select(pet.id);
  await library.remove(pet.id);
  assert.equal((await new PetLibrary(root, resolve('assets')).loadSelected()).pet.id, 'bundled-pi');
  assert.equal((await library.list()).pets.length, 1);
}));
test('library: deletion refuses a pet replaced after confirmation', async () => setup(async library => {
  const pet = await library.install(await sample('Before'));
  await library.install(await sample('After'), pet.id);
  await assert.rejects(library.remove(pet.id, () => true, 'Before'), /changed|retry/i);
  assert.equal((await library.load(pet.id)).name, 'After');
}));
test('library: cancelled deletion leaves pet and selection unchanged', async () => setup(async library => {
  const pet = await library.install(await sample('Stay'));
  await library.select(pet.id);
  await assert.rejects(library.remove(pet.id, () => false), /cancel|session/i);
  assert.equal((await library.loadSelected()).pet.id, pet.id);
  assert.equal((await library.load(pet.id)).name, 'Stay');
}));
test('library: duplicate names require explicit replacement and retain ID', async () => setup(async library => {
  const installed = await library.install(await sample());
  await assert.rejects(library.install(await sample('SAMPLE PET')), /already exists/i);
  assert.equal((await library.load(installed.id)).name, 'Sample pet');
  const replacement = await library.install(await sample('SAMPLE PET'), installed.id);
  assert.equal(replacement.id, installed.id);
  assert.equal((await library.list()).pets.length, 2);
}));
test('library: failed promotion rolls back existing pet', async (t) => setup(async library => {
  const installed = await library.install(await sample());
  const rename = fs.rename;
  t.mock.method(fs, 'rename', async (source: any, target: any) => {
    if (String(source).includes('/stage-') && target === join(library.libraryDir, installed.id)) throw new Error('Injected promotion failure');
    return rename(source, target);
  });
  await assert.rejects(library.install(await sample('Sample pet'), installed.id), /promotion failure/);
  assert.equal((await library.load(installed.id)).name, 'Sample pet');
}));
test('library: lock contention cannot clobber an entry', async () => setup(async library => {
  const pet = await sample();
  const results = await Promise.allSettled([library.install(pet), library.install(pet)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(String((results.find(result => result.status === 'rejected') as PromiseRejectedResult).reason), /busy|exists/i);
  assert.equal((await library.list()).pets.length, 2);
}));
test('library: invalid selection warns and corrupted entries are skipped', async () => setup(async (library, root) => {
  const pet = await library.install(await sample());
  await fs.writeFile(join(root, 'pi-pets/selection.json'), '{broken');
  const fallback = await library.loadSelected();
  assert.equal(fallback.pet.id, 'bundled-pi'); assert.ok(fallback.warning);
  await fs.writeFile(join(library.libraryDir, pet.id, 'idle/00.png'), 'broken');
  assert.equal((await library.list()).pets.length, 1); assert.equal((await library.list()).warnings.length, 1);
}));
test('library: source deletion does not affect managed copies and export reimports', async () => setup(async (library, root) => {
  const source = join(root, 'source'); await fs.cp('assets', source, { recursive: true });
  const imported = await library.install(await normalizePet(await readPackageFiles(source), 'Copy'));
  await fs.rm(source, { recursive: true });
  assert.equal((await library.load(imported.id)).frames.idle.length, 6);
  const exported = await normalizePet(await library.exportFiles(imported.id), 'wrong');
  assert.equal(exported.name, 'Copy'); assert.equal(exported.frames.idle.length, 6);
}));
test('library: symlink storage is refused', async () => setup(async (library, root) => {
  await fs.mkdir(join(root, 'other'));
  await fs.symlink(join(root, 'other'), join(root, 'pi-pets'));
  await assert.rejects(library.install(await sample()), /symlink|unsafe/i);
  await assert.rejects(fs.access(join(root, 'other/library')), { code: 'ENOENT' }, 'reject before creating storage through the symlink');
}));
