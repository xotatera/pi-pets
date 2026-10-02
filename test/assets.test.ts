import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadFrames, type Animation } from '../src/assets.ts';

const counts = { idle: 6, running: 6, waiting: 6, review: 6, failed: 8, jumping: 5, waving: 4 };
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('assets: supplied frames load in order with expected PNG counts', async () => {
  const library = await loadFrames('assets');
  assert.ok(library);
  for (const [state, count] of Object.entries(counts)) {
    const frames: readonly string[] = library[state as Animation];
    assert.equal(frames.length, count);
    assert.deepEqual(Buffer.from(frames[0], 'base64').subarray(0, 8), signature);
    assert.equal(frames[0], (await readFile(`assets/${state}/00.png`)).toString('base64'));
    assert.equal(frames[count - 1], (await readFile(`assets/${state}/${String(count - 1).padStart(2, '0')}.png`)).toString('base64'));
  }
});

test('assets: missing library falls back without throwing', async () => {
  assert.equal(await loadFrames('/nonexistent/pi-pets'), null);
});

for (const kind of ['missing', 'corrupt', 'parent', 'absolute', 'symlink', 'oversized'] as const) {
  test(`assets: ${kind} frame safely rejects the library`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'pi-pet-assets-'));
    try {
      const manifest: Record<string, string[]> = {};
      const png = await readFile('assets/idle/00.png');
      for (const [state, count] of Object.entries(counts)) {
        await mkdir(join(root, state));
        manifest[state] = [];
        for (let i = 0; i < count; i++) {
          const path = `${state}/${String(i).padStart(2, '0')}.png`;
          manifest[state].push(path);
          await writeFile(join(root, path), png);
        }
      }
      const file = join(root, 'idle/00.png');
      if (kind === 'missing') await rm(file);
      if (kind === 'corrupt') await writeFile(file, 'not an image');
      if (kind === 'parent') manifest.idle[0] = '../outside.png';
      if (kind === 'absolute') manifest.idle[0] = '/outside.png';
      if (kind === 'oversized') await writeFile(file, Buffer.alloc(2 * 1024 * 1024));
      if (kind === 'symlink') {
        await rm(file);
        const { symlink } = await import('node:fs/promises');
        await symlink(join(process.cwd(), 'assets/idle/00.png'), file);
      }
      await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
      assert.equal(await loadFrames(root), null);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('extract: only required frames are extracted, ZIP remains unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-pet-extract-'));
  let zipDir = '';
  try {
    zipDir = await mkdtemp(join(tmpdir(), 'pi-pet-zip-'));
    const zip = join(zipDir, 'Pi-export.zip');
    // Create a minimal test ZIP using Python (standard library only)
    const script = "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w');\nfor s,c in [('idle',6),('running',6),('waiting',6),('review',6),('failed',8),('jumping',5),('waving',4)]:\n  for i in range(c):\n   z.write(sys.argv[2]+f'/assets/{s}/{i:02}.png',f'frames/{s}/{i:02}.png')\nz.writestr('manifest.json','{\"dummy\":true}')\nz.writestr('README.txt','original')\nz.close()";
    execFileSync('python3', ['-c', script, zip, process.cwd()]);

    execFileSync(process.execPath, ['scripts/extract-assets.mjs', zip, root]);
    assert.deepEqual((await readdir(root)).sort(), ['failed', 'idle', 'jumping', 'manifest.json', 'review', 'running', 'waiting', 'waving']);
    assert.ok(await loadFrames(root));
  } finally {
    await rm(root, { recursive: true, force: true });
    if (zipDir) await rm(zipDir, { recursive: true, force: true });
  }
});

test('extract: rejects path traversal before writing any frames', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-pet-unsafe-'));
  try {
    const zip = join(root, 'unsafe.zip');
    execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("../escape.png",b"bad"); z.close()', zip]);
    const result = spawnSync(process.execPath, ['scripts/extract-assets.mjs', zip, join(root, 'output')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsafe|invalid/i);
    await assert.rejects(readFile(join(root, 'escape.png')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
