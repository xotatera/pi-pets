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
import { CodexCliSources } from '../src/pet-sources/index.ts';
import sharp from 'sharp';

async function setup(run: (h: ReturnType<typeof host>, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(join(tmpdir(), 'pet-commands-'));
  try { await run(host(root), root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
function host(root: string) {
  const library = new PetLibrary(join(root, 'config'), resolve('assets'));
  let current: LoadedPet | undefined, generation = 0;
  const notices: string[] = [], prompts: string[] = [];
  const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
  const ui = { notify: (message: string) => notices.push(message), confirm: async () => true,
    select: async (_title: string, options: string[]): Promise<string | undefined> => options[options.length - 1] };
  const ctx = { cwd: root, mode: 'tui', ui } as unknown as ExtensionCommandContext;
  registerPetCommands({ registerCommand: (name: string, command: any) => commands.set(name, command), sendUserMessage: async (message: string) => { prompts.push(message); } } as unknown as ExtensionAPI,
    library, { current: () => current, apply: pet => current = pet, generation: () => generation },
    new CodexCliSources({ home: '/unused', env: { CODEX_HOME: join(root, 'codex') }, platform: 'linux' }));
  return { library, notices, ui, prompts, current: () => current, changeSession: () => generation++,
    run: (name: string, args = '') => commands.get(name)!.handler(args, ctx) };
}
test('pet commands: import ZIP adds without selecting and case-insensitive switch persists', async () => setup(async (h, root) => {
  const sample = await normalizePet(await readPackageFiles('assets'), 'Sample');
  await fs.writeFile(join(root, 'sample.zip'), await writePackageZip(sample.files));
  await h.run('pet-import', 'sample.zip');
  assert.equal(h.current(), undefined);
  assert.equal((await h.library.list()).pets.length, 2);
  await h.run('pet-switch', 'sAMPLE');
  assert.equal(h.current()?.name, 'Sample');
  assert.equal((await h.library.loadSelected()).pet.name, 'Sample');
  await h.run('pet-list'); assert.match(h.notices.at(-1)!, /Sample.*active/);
}));
test('pet commands: duplicate cancellation and picker switch', async () => setup(async (h, root) => {
  const sample = await normalizePet(await readPackageFiles('assets'), 'Sample');
  const installed = await h.library.install(sample);
  await fs.writeFile(join(root, 'sample.zip'), await writePackageZip(sample.files));
  h.ui.confirm = async () => false;
  await h.run('pet-import', 'sample.zip');
  assert.equal((await h.library.list()).pets.length, 2);
  assert.equal((await h.library.load(installed.id)).name, 'Sample');
  await h.run('pet-switch'); assert.equal(h.current()?.id, installed.id);
}));
test('pet commands: delete selected pet confirms then switches to Pi', async () => setup(async h => {
  const pet = await h.library.install(await normalizePet(await readPackageFiles('assets'), 'Disposable'));
  await h.run('pet-switch', pet.id);
  h.ui.confirm = async () => false;
  await h.run('pet-delete', pet.id);
  assert.equal(h.current()?.id, pet.id);
  assert.equal((await h.library.loadSelected()).pet.id, pet.id);
  h.ui.confirm = async () => true;
  await h.run('pet-delete', pet.id);
  assert.equal(h.current()?.id, 'bundled-pi');
  assert.equal((await h.library.loadSelected()).pet.id, 'bundled-pi');
  assert.equal((await h.library.list()).pets.length, 1);
  await h.run('pet-delete', 'bundled-pi');
  assert.match(h.notices.at(-1)!, /bundled|cannot/i);
}));
test('pet commands: delete picker cancellation and stale session do not remove pets', async () => setup(async h => {
  const pet = await h.library.install(await normalizePet(await readPackageFiles('assets'), 'Keep'));
  h.ui.select = async () => undefined;
  await h.run('pet-delete');
  assert.equal((await h.library.load(pet.id)).name, 'Keep');
  h.ui.select = async (_title, choices) => { h.changeSession(); return choices.at(-1)!; };
  await h.run('pet-delete');
  assert.equal((await h.library.load(pet.id)).name, 'Keep');
}));
test('pet commands: export round trip and overwrite cancellation', async () => setup(async (h, root) => {
  await h.run('pet-switch', 'bundled-pi');
  await h.run('pet-export', 'copy.zip');
  const bytes = await fs.readFile(join(root, 'copy.zip'));
  const imported = await normalizePet(await readPackageFiles(join(root, 'copy.zip')), 'fallback');
  assert.equal(imported.name, 'Pi'); assert.equal(imported.frames.idle.length, 6);
  h.ui.confirm = async () => false;
  await h.run('pet-export', 'copy.zip');
  assert.deepEqual(await fs.readFile(join(root, 'copy.zip')), bytes);
  await h.run('pet-export', join(h.library.root, 'no.zip'));
  assert.match(h.notices.at(-1)!, /library|protected/i);
}));
test('pet commands: late picker response cannot change selection', async () => setup(async h => {
  await h.library.install(await normalizePet(await readPackageFiles('assets'), 'Sample'));
  h.ui.select = async (_title, options) => { h.changeSession(); return options.at(-1)!; };
  await h.run('pet-switch');
  assert.equal(h.current(), undefined);
  assert.equal((await h.library.loadSelected()).pet.id, 'bundled-pi');
}));
test('pet commands: Linux Codex source import normalizes and installs without switching', async () => setup(async (h, root) => {
  const dir = join(root, 'codex', 'pets', 'synthetic'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, 'pet.json'), JSON.stringify({ displayName: 'Synthetic', spritesheetPath: 'sheet.webp', frame: { width: 192, height: 208, columns: 2, rows: 1 }, animations: { idle: { frames: [0, 1] } } }));
  const bytes = await sharp({ create: { width: 384, height: 208, channels: 4, background: '#d0807090' } }).webp().toBuffer();
  await fs.writeFile(join(dir, 'sheet.webp'), bytes);
  h.ui.select = async (_title, options) => options.find(option => option.includes('Synthetic'))!;
  await h.run('pet-import-source', 'codex-cli');
  assert.equal(h.current(), undefined);
  const installed = (await h.library.list()).pets.find(p => p.name === 'Synthetic');
  assert.ok(installed);
  assert.equal((await h.library.load(installed.id)).frames.idle.length, 2);
  assert.equal((await h.library.exportFiles(installed.id)).has('source.json'), false);
  await h.run('pet-export', join(dir, 'sheet.webp'));
  assert.match(h.notices.at(-1)!, /protected/i);
  assert.deepEqual(await fs.readFile(join(dir, 'sheet.webp')), bytes);
  await fs.rm(dir, { recursive: true });
  await h.run('pet-switch', installed.id);
  assert.equal(h.current()?.name, 'Synthetic');
}));
test('pet commands: source import honors duplicate confirmation', async () => setup(async (h, root) => {
  const dir = join(root, 'codex', 'pets', 'synthetic'); await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, 'pet.json'), JSON.stringify({ displayName: 'Synthetic', spritesheetPath: 'sheet.webp', frame: { width:192, height:208, columns:2, rows:1 }, animations: { idle: { frames:[0] } } }));
  await fs.writeFile(join(dir, 'sheet.webp'), await sharp({ create: { width:384, height:208, channels:4, background:'#606060' } }).webp().toBuffer());
  h.ui.select = async (_title, options) => options.find(option => option.includes('Synthetic'))!;
  await h.run('pet-import-source');
  const before = (await h.library.list()).pets.find(p => p.name === 'Synthetic')!;
  h.ui.confirm = async () => false;
  await h.run('pet-import-source');
  assert.equal((await h.library.list()).pets.filter(p => p.name === 'Synthetic').length, 1);
  h.ui.confirm = async () => true;
  await h.run('pet-import-source');
  assert.equal((await h.library.list()).pets.find(p => p.name === 'Synthetic')!.id, before.id);
  assert.equal(h.current(), undefined);
}));
test('pet commands: unsupported source and missing cache are actionable', async () => setup(async h => {
  await h.run('pet-import-source', 'chatgpt');
  assert.match(h.notices.at(-1)!, /Linux|codex-cli/i);
  h.ui.select = async (_title, options) => options.find(option => option.includes('Codex'))!;
  await h.run('pet-import-source');
  assert.match(h.notices.at(-1)!, /cache|Codex/i);
}));
test('pet commands: identical source pet names still select the requested directory', async () => setup(async (h, root) => {
  for (const id of ['first', 'second']) {
    const dir = join(root, 'codex', 'pets', id); await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'pet.json'), JSON.stringify({ displayName: 'Duplicate', spritesheetPath: 'sheet.webp', frame: { width:192, height:208, columns:2, rows:1 }, animations: { idle: { frames: [id === 'first' ? 0 : 1] } } }));
    await fs.writeFile(join(dir, 'sheet.webp'), await sharp({ create: { width:384, height:208, channels:4, background: id === 'first' ? '#ff0000' : '#0000ff' } }).webp().toBuffer());
  }
  h.ui.select = async (_title, options) => {
    const duplicates = options.filter(option => option.includes('Duplicate'));
    assert.equal(duplicates.length, 2);
    assert.notEqual(duplicates[0], duplicates[1], 'picker options must uniquely identify a source');
    return duplicates[1];
  };
  await h.run('pet-import-source');
  const pet = (await h.library.list()).pets.find(info => info.name === 'Duplicate');
  assert.ok(pet);
  const source = JSON.parse(await fs.readFile(join(h.library.libraryDir, pet.id, 'source.json'), 'utf8'));
  assert.ok(source.sources.some((entry: { path: string }) => entry.path.endsWith('/pets/second')), 'must import the second selection, not the first');
}));
test('pet commands: source picker cancellation on session change makes no copy', async () => setup(async h => {
  h.ui.select = async (_title, options) => { h.changeSession(); return options[0]; };
  await h.run('pet-import-source');
  assert.equal((await h.library.list()).pets.length, 1);
}));
test('pet commands: creation prompt requires generation and stages supported frames', async () => setup(async h => {
  await h.run('pet-create');
  assert.equal(h.prompts.length, 1);
  assert.match(h.prompts[0], /image-generation/);
  assert.match(h.prompts[0], /frames/);
  assert.match(h.prompts[0], /never.*bundled|do not.*bundled/i);
  h.ui.confirm = async () => false;
  await h.run('pet-create'); assert.equal(h.prompts.length, 1);
}));
