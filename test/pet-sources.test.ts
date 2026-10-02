import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexCliSources } from '../src/pet-sources/index.ts';

async function home(t: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pet-source-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const manifest = { displayName: 'Synthetic', spritesheetPath: 'sheet.webp', frame: { width: 192, height: 208, columns: 2, rows: 1 }, animations: { idle: { frames: [1, 0], fps: 8 }, running: { frames: [0] } } };
async function custom(root: string, base = 'pets', id = 'example', data: object = manifest) {
  const dir = join(root, base, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, base === 'avatars' ? 'avatar.json' : 'pet.json'), JSON.stringify(data));
  await writeFile(join(dir, 'sheet.webp'), Buffer.from('synthetic-webp-placeholder'));
  return dir;
}
test('sources: honors CODEX_HOME; discovers custom, legacy, and cached built-in without decoding', async t => {
  const root = await home(t); await custom(root); await custom(root, 'avatars', 'old');
  const asset = join(root, 'cache/tui-pets/v1/assets/codex-spritesheet-v4.webp');
  await mkdir(join(asset, '..'), { recursive: true }); await writeFile(asset, Buffer.from('cached'));
  const source = new CodexCliSources({ home: '/unused', env: { CODEX_HOME: root }, platform: 'linux' });
  const found = await source.discover();
  assert.ok(found.pets.some(p => p.category === 'custom' && p.name === 'Synthetic'));
  assert.ok(found.pets.some(p => p.category === 'legacy'));
  assert.ok(found.pets.some(p => p.category === 'built-in' && p.cached));
  assert.ok(found.pets.some(p => p.category === 'built-in' && !p.cached));
  const selected = found.pets.find(p => p.category === 'custom')!;
  const snapshot = await source.snapshot(selected.key);
  assert.deepEqual(snapshot.definition.tracks.idle, [1, 0]);
  assert.deepEqual(snapshot.definition.tracks.running, [0]);
  assert.deepEqual(snapshot.definition.tracks.waiting, [1, 0]);
  assert.ok(snapshot.fallbackStates.includes('waiting'));
  assert.equal(snapshot.bytes.toString(), 'synthetic-webp-placeholder');
  assert.equal(snapshot.locations.some(location => location.kind === 'directory' && location.path.endsWith('/pets/example')), true);
  await assert.rejects(source.snapshot('../../config.toml'));
});
test('sources: absent Linux storage is reported, non-Linux rejected', async t => {
  const root = await home(t);
  const linux = new CodexCliSources({ home: root, env: {}, platform: 'linux' });
  const result = await linux.discover();
  assert.ok(result.warnings.some(w => /Codex|storage/i.test(w)));
  assert.equal(result.pets.filter(p => p.category !== 'built-in').length, 0);
  const other = new CodexCliSources({ home: root, env: {}, platform: 'darwin' });
  assert.ok((await other.discover()).warnings.some(w => /Linux/i.test(w)));
});
for (const [name, update] of [
  ['traversal', (m: any) => { m.spritesheetPath = '../secret.webp'; }],
  ['bad FPS', (m: any) => { m.animations.idle.fps = -1; }],
  ['bad frame', (m: any) => { m.animations.idle.frames = [2]; }],
  ['bad fallback', (m: any) => { m.animations.idle.fallback = 'unknown'; }],
  ['unsupported geometry', (m: any) => { m.frame.width = 5; }],
  ['missing idle', (m: any) => { delete m.animations.idle; }],
] as const) {
  test(`sources: rejects ${name} manifest safely`, async t => {
    const root = await home(t); const data = structuredClone(manifest) as any; update(data);
    await custom(root, 'pets', 'example', data);
    const source = new CodexCliSources({ home: '/unused', env: { CODEX_HOME: root }, platform: 'linux' });
    const candidate = (await source.discover()).pets.find(p => p.category === 'custom');
    assert.ok(candidate?.unavailable || !candidate);
    if (candidate) await assert.rejects(source.snapshot(candidate.key));
  });
}
test('sources: rejects symlinked spritesheet and oversized manifest', async t => {
  const root = await home(t); const dir = await custom(root); const external = join(root, 'outside.webp');
  await writeFile(external, 'external'); await rm(join(dir, 'sheet.webp')); await symlink(external, join(dir, 'sheet.webp'));
  const source = new CodexCliSources({ home: '/unused', env: { CODEX_HOME: root }, platform: 'linux' });
  const candidate = (await source.discover()).pets.find(p => p.category === 'custom');
  assert.ok(candidate); await assert.rejects(source.snapshot(candidate.key));
  await writeFile(join(dir, 'pet.json'), ' '.repeat(65537));
  const oversized = (await source.discover()).pets.find(p => p.category === 'custom');
  assert.ok(!oversized || oversized.unavailable);
});
test('sources: linked custom directory must never escape Codex root', async t => {
  const root = await home(t), external = await home(t);
  await custom(external, 'pets', 'elsewhere');
  await mkdir(join(root, 'pets'), { recursive: true });
  await symlink(join(external, 'pets', 'elsewhere'), join(root, 'pets', 'elsewhere'));
  const source = new CodexCliSources({ home: '/unused', env: { CODEX_HOME: root }, platform: 'linux' });
  const pet = (await source.discover()).pets.find(p => p.category === 'custom');
  assert.ok(!pet || pet.unavailable);
  if (pet) await assert.rejects(source.snapshot(pet.key));
});
test('sources: changing cached built-in after discovery is rejected', async t => {
  const root = await home(t), asset = join(root, 'cache/tui-pets/v1/assets/codex-spritesheet-v4.webp');
  await mkdir(join(asset, '..'), { recursive: true }); await writeFile(asset, 'first');
  const source = new CodexCliSources({ home: '/unused', env: { CODEX_HOME: root }, platform: 'linux' });
  const pet = (await source.discover()).pets.find(p => p.category === 'built-in' && p.name === 'Codex')!;
  await writeFile(asset, 'second-larger');
  await assert.rejects(source.snapshot(pet.key), /changed/i);
});
test('sources: rejects spritesheet replacement between discovery and snapshot', async t => {
  const root = await home(t), dir = await custom(root);
  const source = new CodexCliSources({ home: '/unused', env: { CODEX_HOME: root }, platform: 'linux' });
  const pet = (await source.discover()).pets.find(p => p.category === 'custom')!;
  await writeFile(join(dir, 'sheet.webp'), 'different sheet data after picker');
  await assert.rejects(source.snapshot(pet.key), /changed|retry|unavailable/i);
});
test('sources: invalidated candidate rejects instead of mixing snapshots', async t => {
  const root = await home(t); const dir = await custom(root);
  const source = new CodexCliSources({ home: '/unused', env: { CODEX_HOME: root }, platform: 'linux' });
  const pet = (await source.discover()).pets.find(p => p.category === 'custom')!;
  await writeFile(join(dir, 'pet.json'), JSON.stringify({ ...manifest, displayName: 'Changed' }));
  await assert.rejects(source.snapshot(pet.key), /changed|retry|unavailable/i);
});
