import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

test('package: installable tarball contains discoverable extension and complete frames only', async () => {
  const result = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }));
  const pack = Array.isArray(result) ? result[0] : result['pi-pets'];
  const paths = pack.files.map((file: { path: string }) => file.path) as string[];
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  for (const entry of manifest.pi.extensions) assert.ok(paths.includes(entry.replace(/^\.\//, '')));
  for (const path of ['README.md', 'src/widget.ts', 'src/state.ts', 'src/assets.ts', 'assets/manifest.json', 'assets/idle/00.png', 'assets/failed/07.png']) assert.ok(paths.includes(path), `${path} must ship`);
  assert.equal(paths.filter(path => path.endsWith('.png')).length, 41);
  assert.ok(paths.every(path => !/\.zip$|previews\/|node_modules\/|test\/|\.superpowers\/|\.ws\.toml/.test(path)));
  assert.equal(manifest.dependencies?.['@earendil-works/pi-tui'], undefined, 'host-provided Pi must not be a runtime dependency');
});
