import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { frameCounts } from '../src/assets.ts';
import { readPackageFiles, writePackageZip, crc32, type PackageFiles } from '../src/archive.ts';
import { normalizePet } from '../src/pet-package.ts';

export async function originalFixture(name = 'Sample pet'): Promise<PackageFiles> {
  const files: PackageFiles = new Map();
  for (const [state, count] of Object.entries(frameCounts)) for (let i = 0; i < count; i++) {
    const path = `${state}/${String(i).padStart(2, '0')}.png`;
    files.set('frames/' + path, await readFile('assets/' + path));
  }
  const atlas = Buffer.from('test-atlas');
  files.set('Sample-spritesheet.png', atlas);
  files.set('manifest.json', Buffer.from(JSON.stringify({ name, sprite_version: 2, cell_width: 192, cell_height: 208,
    rows: ['idle', 'running', 'waiting', 'review', 'failed', 'jumping', 'waving'], frames_per_row: [6,6,6,6,8,5,4],
    sprite_sheet: 'Sample-spritesheet.png', sha256: createHash('sha256').update(atlas).digest('hex') })));
  return files;
}
function manifest(files: PackageFiles, change: (data: any) => void) {
  const data = JSON.parse(Buffer.from(files.get('manifest.json')!).toString()); change(data);
  files.set('manifest.json', Buffer.from(JSON.stringify(data)));
}
test('package: original exports normalize and round trip without extra previews', async () => {
  const files = await originalFixture(); files.set('previews/movie.mp4', Buffer.from('unused'));
  const pet = await normalizePet(files, 'fallback');
  assert.equal(pet.name, 'Sample pet');
  assert.equal(pet.files.size, 43);
  assert.equal(pet.frames.failed.length, 8);
  assert.deepEqual(Buffer.from(pet.files.get('idle/00.png')!), Buffer.from(files.get('frames/idle/00.png')!));
  const restored = await normalizePet(pet.files, 'different');
  assert.equal(restored.name, 'Sample pet'); assert.deepEqual(restored.frames, pet.frames);
});
async function variableFixture(): Promise<PackageFiles> {
  const files: PackageFiles = new Map();
  const sample = await readFile('assets/idle/00.png');
  const order: Record<string, string[] | Record<string, string>> = {};
  const digests: Record<string, string> = {};
  for (const state of Object.keys(frameCounts)) {
    const count = state === 'idle' ? 1 : state === 'running' ? 9 : 3;
    const paths = Array.from({ length: count }, (_, i) => `${state}/${String(i).padStart(2, '0')}.png`);
    order[state] = paths;
    for (const path of paths) { files.set(path, sample); digests[path] = createHash('sha256').update(sample).digest('hex'); }
  }
  order.sha256 = digests;
  files.set('manifest.json', Buffer.from(JSON.stringify(order)));
  files.set('metadata.json', Buffer.from(JSON.stringify({ schemaVersion: 2, name: 'Variable' })));
  return files;
}
test('package: 256 normalized frames plus two metadata files remain exportable', async () => {
  const files = await variableFixture();
  const metadata = JSON.parse(Buffer.from(files.get('manifest.json')!).toString());
  const sample = files.get('idle/00.png')!;
  for (const state of Object.keys(frameCounts)) for (const path of metadata[state]) files.delete(path);
  let remaining = 256;
  for (const [stateIndex, state] of Object.keys(frameCounts).entries()) {
    const count = stateIndex === 0 ? 250 : 1;
    remaining -= count;
    const paths = Array.from({ length: count }, (_, i) => `${state}/${String(i).padStart(2, '0')}.png`);
    metadata[state] = paths;
    for (const path of paths) { files.set(path, sample); metadata.sha256[path] = createHash('sha256').update(sample).digest('hex'); }
  }
  assert.equal(remaining, 0);
  files.set('manifest.json', Buffer.from(JSON.stringify(metadata)));
  const pet = await normalizePet(files, 'unused');
  const bytes = await writePackageZip(pet.files);
  assert.ok(bytes.length > 0);
});
test('package: schema 2 retains variable track lengths through round trips', async () => {
  const source = await variableFixture();
  const pet = await normalizePet(source, 'unused');
  assert.equal(pet.frames.idle.length, 1);
  assert.equal(pet.frames.running.length, 9);
  assert.deepEqual(Buffer.from(pet.files.get('running/08.png')!), Buffer.from(source.get('running/08.png')!));
  assert.equal(JSON.parse(Buffer.from(pet.files.get('metadata.json')!).toString()).schemaVersion, 2);
  assert.deepEqual((await normalizePet(pet.files, 'unused')).frames, pet.frames);
});
for (const corruption of ['missing', 'empty', '257 frames', 'path', 'hash', 'version']) {
  test(`package: schema 2 rejects ${corruption}`, async () => {
    const files = await variableFixture();
    if (corruption === 'version') files.set('metadata.json', Buffer.from('{"schemaVersion":3,"name":"Variable"}'));
    else manifest(files, m => {
      if (corruption === 'missing') delete m.waiting;
      if (corruption === 'empty') m.waiting = [];
      if (corruption === '257 frames') m.running = Array.from({ length: 257 }, (_, i) => `running/${String(i).padStart(2, '0')}.png`);
      if (corruption === 'path') m.running[0] = '../running/00.png';
      if (corruption === 'hash') m.sha256['running/00.png'] = 'bad';
    });
    await assert.rejects(normalizePet(files, 'unused'));
  });
}
test('package: legacy normalized manifest accepts fallback display name', async () => {
  const pet = await normalizePet(await readPackageFiles('assets'), 'Legacy Pi');
  assert.equal(pet.name, 'Legacy Pi');
});
for (const kind of ['dimensions','counts','atlas hash','missing atlas','no frames','metadata version','CRC','chunk bounds','IDAT']) {
  test(`package: rejects ${kind}`, async () => {
    const files = await originalFixture();
    if (kind === 'dimensions') manifest(files, m => m.cell_width = 1);
    if (kind === 'counts') manifest(files, m => m.frames_per_row[0] = 99);
    if (kind === 'atlas hash') manifest(files, m => m.sha256 = 'bad');
    if (kind === 'missing atlas') files.delete('Sample-spritesheet.png');
    if (kind === 'no frames') for (const path of files.keys()) if (path.startsWith('frames/')) files.delete(path);
    if (kind === 'metadata version') files.set('metadata.json', Buffer.from('{"schemaVersion":99,"name":"X"}'));
    if (['CRC','chunk bounds','IDAT'].includes(kind)) {
      const png = Buffer.from(files.get('frames/idle/00.png')!);
      const idat = png.indexOf('IDAT');
      if (kind === 'chunk bounds') png.writeUInt32BE(0xffffffff, idat - 4);
      else {
        png[idat + 5] ^= 1;
        if (kind === 'IDAT') { const len = png.readUInt32BE(idat - 4); png.writeUInt32BE(crc32(png.subarray(idat, idat + 4 + len)), idat + 4 + len); }
      }
      files.set('frames/idle/00.png', png);
    }
    await assert.rejects(normalizePet(files, 'fallback'));
  });
}
test('package: names are bounded and control characters rejected', async () => {
  await assert.rejects(normalizePet(await originalFixture('x\nunsafe'), 'fallback'), /name/i);
  await assert.rejects(normalizePet(await originalFixture('x'.repeat(81)), 'fallback'), /name/i);
});
