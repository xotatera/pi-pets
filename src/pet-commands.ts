import fs from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { readPackageFiles, writePackageZip } from './archive.ts';
import { normalizePet } from './pet-package.ts';
import { PetLibrary, type LoadedPet } from './library.ts';
import { CodexCliSources } from './pet-sources/index.ts';
import { SpriteDecoder } from './sprite-decoder.ts';

export interface PetRuntime { current(): LoadedPet | undefined; apply(pet: LoadedPet): void; generation(): number }
const nameKey = (name: string) => name.normalize('NFKC').toLocaleLowerCase('en-US');
function inside(path: string, parent: string): boolean {
  const part = relative(parent, path);
  return part === '' || (!part.startsWith('..' + '/') && part !== '..' && !isAbsolute(part));
}
export function registerPetCommands(pi: ExtensionAPI, library: PetLibrary, runtime: PetRuntime, sources = new CodexCliSources({ home: homedir(), env: process.env })): void {
  let latestSwitch = 0;
  const decoder = new SpriteDecoder();
  function register(name: string, description: string, execute: (args: string, ctx: ExtensionCommandContext, current: () => boolean) => Promise<void>) {
    pi.registerCommand(name, { description, handler: async (args, ctx) => {
      if (ctx.mode !== 'tui') return;
      const generation = runtime.generation(), current = () => runtime.generation() === generation;
      try { await execute(args.trim(), ctx, current); }
      catch (error) { if (current()) ctx.ui.notify(`${name}: ${error instanceof Error ? error.message : String(error)}`, 'error'); }
    } });
  }
  register('pet-import', 'Import a pet ZIP or directory into the global library', async (args, ctx, current) => {
    if (!args) throw new Error('Usage: /pet-import <ZIP-or-directory>');
    const source = resolve(ctx.cwd, args);
    const pet = await normalizePet(await readPackageFiles(source), basename(source).replace(/(?:-export)?\.zip$/i, ''));
    const listed = await library.list();
    const collision = listed.pets.find(info => nameKey(info.name) === nameKey(pet.name));
    let replaceId: string | undefined;
    if (collision) {
      if (collision.bundled) throw new Error('Bundled Pi cannot be replaced; use a different imported pet name');
      if (!current() || !await ctx.ui.confirm('Replace imported pet?', `A pet named ${pet.name} already exists. Replace this imported copy?`)) return;
      replaceId = collision.id;
    }
    if (!current()) return;
    const installed = await library.install(pet, replaceId, [source]);
    if (current()) ctx.ui.notify(`Imported ${installed.name} (${installed.id}). Use /pet-switch ${installed.id}`, 'info');
  });
  register('pet-import-source', 'Import a locally installed Codex CLI pet on Linux', async (args, ctx, current) => {
    if (args && args !== 'codex-cli') throw new Error('Only the Linux codex-cli offline source is supported');
    const { pets, warnings } = await sources.discover();
    if (!current()) return;
    for (const warning of warnings) ctx.ui.notify(warning, 'warning');
    const labels = pets.map((pet, index) => `#${index + 1} · ${pet.name} — ${pet.category}${pet.cached ? '' : ' (not cached)'}`);
    const choice = await ctx.ui.select('Choose an installed Codex CLI pet', labels);
    const selected = pets[labels.indexOf(choice ?? '')];
    if (!selected || !current()) return;
    if (!selected.cached || selected.unavailable) throw new Error(selected.unavailable ?? 'Pet spritesheet is not cached by Codex CLI');
    const snapshot = await sources.snapshot(selected.key);
    if (!current()) return;
    const pet = await decoder.decode(snapshot.bytes, snapshot.definition);
    if (!current()) return;
    const listed = await library.list();
    const collision = listed.pets.find(info => nameKey(info.name) === nameKey(pet.name));
    let replaceId: string | undefined;
    if (collision) {
      if (collision.bundled) throw new Error('Bundled Pi cannot be replaced; use a different pet name');
      if (!current() || !await ctx.ui.confirm('Replace imported pet?', `A pet named ${pet.name} already exists. Replace this imported copy?`)) return;
      replaceId = collision.id;
    }
    if (!current()) return;
    const installed = await library.install(pet, replaceId, snapshot.locations);
    if (current()) ctx.ui.notify(`Imported ${installed.name} (${installed.id}). Use /pet-switch ${installed.id}${snapshot.fallbackStates.length ? `. Missing animations reuse idle: ${snapshot.fallbackStates.join(', ')}` : ''}`, 'info');
  });
  register('pet-list', 'List global pets and the current selection', async (_args, ctx, current) => {
    const listed = await library.list();
    if (!current()) return;
    const active = runtime.current()?.id;
    ctx.ui.notify(listed.pets.map(info => `${info.name} — ${info.id}${info.id === active ? ' (active)' : ''}`).join('\n'), 'info');
    for (const warning of listed.warnings) ctx.ui.notify(warning, 'warning');
  });
  register('pet-switch', 'Switch pet by name/ID, or open a picker', async (args, ctx, sessionCurrent) => {
    const revision = ++latestSwitch, current = () => sessionCurrent() && revision === latestSwitch;
    const { pets, warnings } = await library.list();
    if (!current()) return;
    for (const warning of warnings) ctx.ui.notify(warning, 'warning');
    let id: string | undefined;
    if (args) {
      const exact = pets.find(pet => pet.id === args);
      const matches = pets.filter(pet => nameKey(pet.name) === nameKey(args));
      if (exact) id = exact.id;
      else if (matches.length === 1) id = matches[0].id;
      else throw new Error(matches.length ? 'Ambiguous pet name; use an exact ID or picker' : `Unknown pet: ${args}`);
    } else {
      const labels = pets.map(pet => `${pet.name} — ${pet.id}`);
      const chosen = await ctx.ui.select('Choose a pet', labels);
      id = pets[labels.indexOf(chosen ?? '')]?.id;
    }
    if (!id || !current()) return;
    const loaded = await library.select(id, current);
    if (!current()) return;
    runtime.apply(loaded);
    ctx.ui.notify(`Switched to ${loaded.name}`, 'info');
  });
  register('pet-delete', 'Delete an imported pet by name/ID, or choose from a picker', async (args, ctx, sessionCurrent) => {
    const revision = ++latestSwitch, current = () => sessionCurrent() && revision === latestSwitch;
    const { pets, warnings } = await library.list();
    if (!current()) return;
    for (const warning of warnings) ctx.ui.notify(warning, 'warning');
    let pet: (typeof pets)[number] | undefined;
    if (args) {
      pet = pets.find(info => info.id === args);
      if (!pet) {
        const matches = pets.filter(info => nameKey(info.name) === nameKey(args));
        if (matches.length !== 1) throw new Error(matches.length ? 'Ambiguous pet name; use an exact ID or picker' : `Unknown pet: ${args}`);
        pet = matches[0];
      }
    } else {
      const deletable = pets.filter(info => !info.bundled);
      if (!deletable.length) throw new Error('No imported pets to delete');
      const labels = deletable.map(info => `${info.name} — ${info.id}`);
      pet = deletable[labels.indexOf(await ctx.ui.select('Choose an imported pet to delete', labels) ?? '')];
    }
    if (!pet || !current()) return;
    if (pet.bundled) throw new Error('Bundled Pi cannot be deleted');
    if (!await ctx.ui.confirm('Delete imported pet?', `Permanently delete ${pet.name} (${pet.id}) from the Pi library? The original import source is not deleted.`) || !current()) return;
    await library.remove(pet.id, current, pet.name);
    if (!current()) return;
    if (runtime.current()?.id === pet.id) runtime.apply((await library.loadSelected()).pet);
    ctx.ui.notify(`Deleted ${pet.name} (${pet.id})`, 'info');
  });
  register('pet-export', 'Export the selected pet as a portable ZIP', async (args, ctx, current) => {
    const selected = runtime.current() ?? (await library.loadSelected()).pet;
    const safeName = selected.name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'pet';
    const target = resolve(ctx.cwd, args || `${safeName}.zip`);
    if (inside(target, library.root) || inside(target, library.bundledDir)) throw new Error('Export destination is protected pet library/bundled storage');
    await library.assertExportDestination(target);
    const parent = await fs.realpath(dirname(target));
    if (parent !== dirname(target) || inside(parent, library.root) || inside(parent, library.bundledDir)) throw new Error('Unsafe export directory');
    let previous: Awaited<ReturnType<typeof fs.lstat>> | undefined;
    try { previous = await fs.lstat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw new Error('Export destination must be a regular file');
    if (previous && (!current() || !await ctx.ui.confirm('Replace export?', `Overwrite ${target}?`))) return;
    if (!current()) return;
    const bytes = await writePackageZip(await library.exportFiles(selected.id));
    const stage = join(parent, `.pet-export-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(stage, bytes, { flag: 'wx', mode: 0o600 });
      if (!current()) return;
      await library.withMutation(async () => {
        if (!current()) return;
        // Source provenance cannot disappear into a replacement backup, or be
        // registered by another import, between this check and promotion.
        await library.assertExportDestination(target);
        if (!current()) return;
        if (previous) {
          const now = await fs.lstat(target);
          if (now.ino !== previous.ino || now.mtimeMs !== previous.mtimeMs || now.size !== previous.size) throw new Error('Export destination changed; retry');
          await fs.rename(stage, target);
        } else await fs.link(stage, target); // Fails atomically rather than overwriting a raced-in file.
        if (current()) ctx.ui.notify(`Exported ${selected.name} to ${target}`, 'info');
      });
    } finally { await fs.rm(stage, { force: true }); }
  });
  register('pet-create', 'Ask the model to create a pet using image-generation capabilities', async (args, ctx, current) => {
    const ok = await ctx.ui.confirm('Create a new pet?', 'Requires image-input support and an image-generation capable model or a loaded image-generation tool. No capabilities are detected automatically. Continue only if these conditions are met. Generated artwork must be staged, then imported explicitly.');
    if (!ok || !current()) return;
    await pi.sendUserMessage(`Create a new pet${args ? `: ${args}` : ''}. Requirements: the current model must be able to read images, and an image-generation capable model or image-generation tool must be loaded. These conditions are prompt-only, not automatically detected; if unmet, explain and stop. Use provided reference images. Produce an original export directory/ZIP with manifest.json (sprite_version: 2, cell_width: 192, cell_height: 208, rows and frames_per_row) and individual transparent 8-bit noninterlaced RGB/RGBA PNGs in frames/<state>/<nn>.png. Required states/counts: idle 6, running 6, waiting 6, review 6, failed 8, jumping 5, waving 4. If including a spritesheet, declare sprite_sheet and its SHA-256 in the manifest. Stage outside bundled assets and the managed library; never overwrite the bundled pet or select automatically. Ask the user to approve, then use /pet-import and /pet-switch. A spritesheet alone is not importable.`, { deliverAs: 'followUp' });
  });
}
