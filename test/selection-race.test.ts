import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { PetLibrary, type LoadedPet } from '../src/library.ts';
import { readPackageFiles } from '../src/archive.ts';
import { normalizePet } from '../src/pet-package.ts';
import { registerPetCommands } from '../src/pet-commands.ts';

for (const race of ['newer switch', 'session change']) {
  test(`selection: delayed old commit cannot overwrite ${race}`, async t => {
    const root = await fs.mkdtemp(join(tmpdir(), 'pet-selection-race-'));
    let release!: () => void;
    try {
      const library = new PetLibrary(root, resolve('assets'));
      const a = await library.install(await normalizePet(await readPackageFiles('assets'), 'Pet A'));
      const b = await library.install(await normalizePet(await readPackageFiles('assets'), 'Pet B'));
      let generation = 0, selected: LoadedPet | undefined;
      const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
      registerPetCommands({ registerCommand: (name: string, command: any) => commands.set(name, command) } as unknown as ExtensionAPI,
        library, { current: () => selected, apply: pet => selected = pet, generation: () => generation });
      const ctx = { mode: 'tui', ui: { notify() {} } } as unknown as ExtensionCommandContext;
      let entered!: () => void, intercepted = false;
      const atCommit = new Promise<void>(resolve => entered = resolve);
      const delayed = new Promise<void>(resolve => release = resolve);
      const rename = fs.rename;
      t.mock.method(fs, 'rename', async (source: any, target: any) => {
        if (!intercepted && String(source).includes('/selection-') && String(target).endsWith('/selection.json')) {
          intercepted = true; entered(); await delayed;
        }
        return rename(source, target);
      });
      const first = commands.get('pet-switch')!.handler(a.id, ctx);
      // A synchronous commit completes first; an unsafe asynchronous commit hits atCommit first.
      await Promise.race([first, atCommit]);
      if (race === 'session change') generation++;
      await commands.get('pet-switch')!.handler(b.id, ctx);
      release(); await first;
      assert.equal(selected?.id, b.id);
      assert.equal((await library.loadSelected()).pet.id, b.id, 'restart must agree with the current widget');
    } finally { release?.(); await fs.rm(root, { recursive: true, force: true }); }
  });
}
