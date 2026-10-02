import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { zipSync } from 'fflate';
import { readPackageFiles, writePackageZip } from '../src/archive.ts';

async function withZip(data: Uint8Array, run: (path: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'pet-archive-'));
  try { const path = join(root, 'pet.zip'); await writeFile(path, data); await run(path); }
  finally { await rm(root, { recursive: true, force: true }); }
}
const bytes = (s: string) => Buffer.from(s);
for (const prefix of ['', 'Sample-pet/']) {
  test(`archive: root ${prefix || '(none)'} round trips and strips wrapper`, async () => {
    const files = new Map([['manifest.json', bytes('{}')], ['idle/00.png', bytes('frame')]]);
    const zip = zipSync(Object.fromEntries([...files].map(([path, data]) => [prefix + path, data])));
    await withZip(zip, async path => {
      const actual = await readPackageFiles(path);
      assert.equal(Buffer.from(actual.get('idle/00.png')!).toString(), 'frame');
      await withZip(await writePackageZip(actual), async exportPath => assert.deepEqual(await readPackageFiles(exportPath), actual));
    });
  });
}
for (const path of ['../escape', '/absolute', 'C:/drive', 'x\\escape']) {
  test(`archive: rejects unsafe ${path}`, async () => {
    await withZip(zipSync({ 'manifest.json': bytes('{}'), [path]: bytes('x') }), async file => {
      await assert.rejects(readPackageFiles(file), /unsafe/i);
    });
  });
}
test('archive: rejects ambiguous roots and too many entries', async () => {
  await withZip(zipSync({ 'a/manifest.json': bytes('{}'), 'b/manifest.json': bytes('{}') }), async path => assert.rejects(readPackageFiles(path), /root/i));
  const many = Object.fromEntries(Array.from({ length: 259 }, (_, i) => [String(i), bytes('x')]));
  await withZip(zipSync(many), async path => assert.rejects(readPackageFiles(path), /entries/i));
});
test('archive: rejects symlink entry and unsupported compression', async () => {
  for (const kind of ['symlink', 'compression']) {
    const zip = Buffer.from(zipSync({ 'manifest.json': bytes('{}') }));
    const cd = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (kind === 'symlink') zip.writeUInt32LE((0o120777 << 16) >>> 0, cd + 38);
    else zip.writeUInt16LE(99, cd + 10);
    await withZip(zip, async path => assert.rejects(readPackageFiles(path), /symlink|compression/i));
  }
});
test('archive: rejects duplicate names and declared oversized inflation', async () => {
  const duplicate = Buffer.from(zipSync({ 'manifest.json': bytes('{}'), 'aaaaaaaa.json': bytes('xx') }));
  for (let i = 0; i < duplicate.length - 13; i++) if (duplicate.subarray(i, i + 13).toString() === 'aaaaaaaa.json') bytes('manifest.json').copy(duplicate, i);
  await withZip(duplicate, async path => assert.rejects(readPackageFiles(path), /duplicate/i));
  const oversized = Buffer.from(zipSync({ 'manifest.json': bytes('{}') }));
  const cd = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  oversized.writeUInt32LE(65 * 1024 * 1024, cd + 24);
  await withZip(oversized, async path => assert.rejects(readPackageFiles(path), /size|limit/i));
});
test('archive: forged small sizes do not permit decompression bomb', async () => {
  const zip = Buffer.from(zipSync({ 'manifest.json': bytes('{}'), 'large.bin': new Uint8Array(65 * 1024 * 1024) }));
  // Forge BOTH sizes so local/central agreement cannot substitute for a live inflation bound.
  let cd = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  cd = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), cd + 4);
  zip.writeUInt32LE(1, cd + 24);
  zip.writeUInt32LE(1, zip.readUInt32LE(cd + 42) + 22);
  await withZip(zip, async path => assert.rejects(readPackageFiles(path), /actual.*inflation.*limit/i));
});
test('archive: directory equivalent and symlink ancestors rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pet-dir-'));
  try {
    await writeFile(join(root, 'manifest.json'), '{}');
    await mkdir(join(root, 'idle')); await writeFile(join(root, 'idle/00.png'), 'frame');
    assert.equal(Buffer.from((await readPackageFiles(root)).get('idle/00.png')!).toString(), 'frame');
    await symlink(join(root, 'idle'), join(root, 'linked'));
    await assert.rejects(readPackageFiles(root), /symlink/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
