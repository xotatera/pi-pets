import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { PetLibrary, type LoadedPet } from '../src/library.ts';
import { readPackageFiles, writePackageZip } from '../src/archive.ts';
import { normalizePet } from '../src/pet-package.ts';
import { registerPetCommands } from '../src/pet-commands.ts';

function host(library: PetLibrary, root: string) {
  let selected: LoadedPet | undefined;
  const notices: string[] = [], commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
  const ctx = { mode: 'tui', cwd: root, ui: { notify: (text: string) => notices.push(text), confirm: async () => true } } as unknown as ExtensionCommandContext;
  registerPetCommands({ registerCommand: (name: string, command: any) => commands.set(name, command) } as unknown as ExtensionAPI,
    library, { current: () => selected, apply: pet => selected = pet, generation: () => 0 });
  return { notices, run: (name: string, args: string) => commands.get(name)!.handler(args, ctx) };
}
test('export: exact source sprite file remains protected after installed copy and restart', async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'pet-file-source-'));
  try {
    const config = join(root, 'config'), source = join(root, 'sheet.webp');
    await fs.writeFile(source, 'immutable-original');
    const library = new PetLibrary(config, resolve('assets'));
    const pet = await normalizePet(await readPackageFiles('assets'), 'Sample');
    const installed = await library.install(pet, undefined, [source]);
    assert.equal((await library.exportFiles(installed.id)).has('source.json'), false);
    const h = host(new PetLibrary(config, resolve('assets')), root);
    await h.run('pet-switch', 'bundled-pi'); await h.run('pet-export', source);
    assert.match(h.notices.at(-1)!, /protected/i);
    assert.equal(await fs.readFile(source, 'utf8'), 'immutable-original');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
for (const kind of ['zip', 'directory']) {
  test(`export: ${kind} import source remains protected after restart and replacement`, async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'pet-source-'));
    try {
      const config = join(root, 'config');
      const library = new PetLibrary(config, resolve('assets'));
      const h = host(library, root);
      const pet = await normalizePet(await readPackageFiles('assets'), 'Sample');
      pet.files.set('preview.txt', Buffer.from('irreplaceable source extra'));
      let source: string, destination: string;
      if (kind === 'zip') {
        source = join(root, 'original.zip'); destination = source;
        await fs.writeFile(source, await writePackageZip(pet.files));
      } else {
        source = join(root, 'original'); destination = join(source, 'preview.txt');
        for (const [path, data] of pet.files) { await fs.mkdir(join(source, path, '..'), { recursive: true }); await fs.writeFile(join(source, path), data); }
      }
      const before = await fs.readFile(destination);
      await h.run('pet-import', source);
      assert.equal((await library.list()).pets.length, 2);
      const other = join(root, 'replacement.zip'); await fs.writeFile(other, await writePackageZip(pet.files));
      await h.run('pet-import', other); // Explicit yes replaces the pet, not its original source history.
      const restarted = new PetLibrary(config, resolve('assets')), later = host(restarted, root);
      await later.run('pet-switch', 'Sample');
      await later.run('pet-export', destination);
      assert.match(later.notices.at(-1)!, /source.*protected|protected.*source/i);
      assert.deepEqual(await fs.readFile(destination), before);
      const replacementBefore = await fs.readFile(other);
      await later.run('pet-export', other);
      assert.deepEqual(await fs.readFile(other), replacementBefore);
      const installed = (await restarted.list()).pets.find(pet => pet.name === 'Sample')!;
      const portable = await restarted.exportFiles(installed.id);
      assert.equal(portable.has('source.json'), false, 'private source paths must not travel in exports');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
}

test('export: replacement provenance gap cannot allow a source overwrite', async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'pet-replacement-race-'));
  let release!: () => void, replacement: Promise<unknown> | undefined;
  try {
    const config = join(root, 'config'), library = new PetLibrary(config, resolve('assets'));
    const importing = host(library, root);
    const pet = await normalizePet(await readPackageFiles('assets'), 'Sample');
    pet.files.set('preview.txt', Buffer.from('keep original source extras'));
    const source = join(root, 'original.zip');
    await fs.writeFile(source, await writePackageZip(pet.files));
    const before = await fs.readFile(source);
    await importing.run('pet-import', source);
    const installed = (await library.list()).pets.find(info => info.name === 'Sample')!;
    const exporting = host(new PetLibrary(config, resolve('assets')), root);
    await exporting.run('pet-switch', 'bundled-pi');
    let entered!: () => void;
    const paused = new Promise<void>(resolve => entered = resolve);
    const resume = new Promise<void>(resolve => release = resolve);
    const rename = fs.rename;
    t.mock.method(fs, 'rename', async (...args: Parameters<typeof fs.rename>) => {
      if (String(args[0]).includes('/stage-') && args[1] === join(library.libraryDir, installed.id)) {
        entered(); await resume;
      }
      return rename(...args);
    });
    replacement = library.install(pet, installed.id);
    await Promise.race([paused, replacement.then(() => { throw new Error('Replacement never reached the provenance gap'); })]);
    try { await exporting.run('pet-export', source); }
    finally { release(); await replacement; }
    assert.equal((await fs.readFile(source)).equals(before), true, 'source bytes must survive the paused replacement');
    assert.match(exporting.notices.at(-1)!, /busy.*retry/i);
    await exporting.run('pet-export', join(root, 'safe-copy.zip'));
    assert.match(exporting.notices.at(-1)!, /Exported Pi/);
  } finally {
    release?.(); await replacement; t.mock.restoreAll();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('export: final promotion excludes a concurrent replacement and releases the lock', async t => {
  const root = await fs.mkdtemp(join(tmpdir(), 'pet-export-reservation-'));
  let release!: () => void, exporting: Promise<unknown> | undefined;
  try {
    const config = join(root, 'config'), library = new PetLibrary(config, resolve('assets'));
    const pet = await normalizePet(await readPackageFiles('assets'), 'Sample');
    const installed = await library.install(pet);
    const h = host(new PetLibrary(config, resolve('assets')), root);
    await h.run('pet-switch', 'bundled-pi');
    let entered!: () => void;
    const paused = new Promise<void>(resolve => entered = resolve);
    const resume = new Promise<void>(resolve => release = resolve);
    const link = fs.link;
    t.mock.method(fs, 'link', async (...args: Parameters<typeof fs.link>) => {
      if (String(args[0]).includes('/.pet-export-')) { entered(); await resume; }
      return link(...args);
    });
    exporting = h.run('pet-export', join(root, 'copy.zip'));
    await Promise.race([paused, exporting.then(() => { throw new Error('Export never reached final promotion'); })]);
    try { await assert.rejects(library.install(pet, installed.id), /busy.*retry/i); }
    finally { release(); await exporting; }
    assert.match(h.notices.at(-1)!, /Exported Pi/);
    assert.equal((await library.install(pet, installed.id)).id, installed.id);
  } finally {
    release?.(); await exporting; t.mock.restoreAll();
    await fs.rm(root, { recursive: true, force: true });
  }
});
