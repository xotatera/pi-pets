import fs from 'node:fs/promises';
import { renameSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readPackageFiles, type PackageFiles } from './archive.ts';
import { normalizePet, type NormalizedPet } from './pet-package.ts';
import type { FrameLibrary } from './assets.ts';

export type PetInfo = { id: string; name: string; bundled: boolean };
export type LoadedPet = PetInfo & { frames: FrameLibrary };
export const bundledId = 'bundled-pi';
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
const key = (name: string) => name.normalize('NFKC').toLocaleLowerCase('en-US');
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
type PetSource = { path: string; kind: 'zip' | 'file' | 'directory' };
function contains(parent: string, path: string): boolean {
  const part = relative(parent, path);
  return part === '' || (part !== '..' && !part.startsWith('../') && !isAbsolute(part));
}

export class PetLibrary {
  readonly root: string;
  readonly libraryDir: string;
  readonly bundledDir: string;
  constructor(configDir: string, bundledDir: string) {
    this.root = join(resolve(configDir), 'pi-pets');
    this.libraryDir = join(this.root, 'library');
    this.bundledDir = resolve(bundledDir);
  }
  private async ensure(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    if (await fs.realpath(this.root) !== this.root || !(await fs.lstat(this.root)).isDirectory()) throw new Error('Unsafe library symlink/path');
    await fs.mkdir(this.libraryDir, { recursive: true, mode: 0o700 });
    await this.checkRoot();
  }
  private async checkRoot(): Promise<void> {
    for (const path of [this.root, this.libraryDir]) {
      if (await fs.realpath(path) !== path || !(await fs.lstat(path)).isDirectory()) throw new Error('Unsafe library symlink/path');
    }
  }
  private async reserveMutation(): Promise<() => Promise<void>> {
    await this.ensure();
    const lock = join(this.root, 'mutation.lock');
    let reservation;
    try { reservation = await fs.open(lock, 'wx', 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Pet library is busy; retry the operation'); throw error; }
    return async () => {
      try { await reservation.close(); }
      finally { await fs.unlink(lock); }
    };
  }
  /** Serialize final validation and filesystem promotion with imports/replacements.
   * Keep dialogs and archive construction outside this short reservation. */
  async withMutation<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.reserveMutation();
    try { return await operation(); }
    finally { await release(); }
  }
  private async package(id: string): Promise<NormalizedPet> {
    if (id === bundledId) return normalizePet(await readPackageFiles(this.bundledDir), 'Pi');
    if (!validId(id)) throw new Error('Invalid pet ID');
    await this.checkRoot();
    const path = join(this.libraryDir, id);
    const pet = await normalizePet(await readPackageFiles(path), id);
    return pet;
  }
  async load(id: string): Promise<LoadedPet> {
    const pet = await this.package(id);
    return { id, name: id === bundledId ? 'Pi' : pet.name, bundled: id === bundledId, frames: pet.frames };
  }
  async list(): Promise<{ pets: PetInfo[]; warnings: string[] }> {
    const pets: PetInfo[] = [{ id: bundledId, name: 'Pi', bundled: true }], warnings: string[] = [];
    try {
      await this.checkRoot();
      for (const id of (await fs.readdir(this.libraryDir)).sort()) {
        try { const { frames: _frames, ...info } = await this.load(id); pets.push(info); }
        catch (error) { warnings.push(`Skipping invalid pet ${id}: ${String(error)}`); }
      }
    } catch (error) { if (!missing(error)) throw error; }
    return { pets, warnings };
  }
  async install(pet: NormalizedPet, replaceId?: string, sourcePaths: readonly (string | PetSource)[] = []): Promise<PetInfo> {
    if (replaceId === bundledId) throw new Error('Bundled Pi cannot be replaced');
    if (replaceId && !validId(replaceId)) throw new Error('Invalid replacement ID');
    // Revalidate caller's bytes; metadata cannot bypass package validation.
    pet = await normalizePet(pet.files, pet.name);
    const release = await this.reserveMutation();
    let stage: string | undefined, backup: string | undefined;
    const id = replaceId ?? randomUUID(), target = join(this.libraryDir, id);
    try {
      const { pets } = await this.list();
      const collision = pets.find(info => key(info.name) === key(pet.name) && info.id !== replaceId);
      if (collision) throw new Error(`Pet name already exists: ${pet.name}`);
      if (replaceId && !pets.some(info => info.id === replaceId && !info.bundled)) throw new Error('Replacement pet is unavailable');
      const sources = replaceId ? await this.sources(replaceId) : [];
      for (const source of sourcePaths) {
        const requested = typeof source === 'string' ? source : source.path;
        const path = await fs.realpath(resolve(requested)), info = await fs.lstat(path);
        if (!info.isFile() && !info.isDirectory()) throw new Error('Invalid import source');
        const kind = typeof source === 'string' ? (info.isDirectory() ? 'directory' : 'zip') : source.kind;
        if (kind === 'directory' ? !info.isDirectory() : !info.isFile()) throw new Error('Invalid import source kind');
        if (!sources.some(record => record.path === path)) sources.push({ path, kind });
      }
      const provenance = JSON.stringify({ schemaVersion: 1, sources }) + '\n';
      if (Buffer.byteLength(provenance) > 64 * 1024) throw new Error('Import source history size limit exceeded');
      stage = await fs.mkdtemp(join(this.root, 'stage-'));
      if (sources.length) await fs.writeFile(join(stage, 'source.json'), provenance, { flag: 'wx', mode: 0o600 });
      for (const [path, data] of pet.files) {
        const destination = join(stage, path);
        await fs.mkdir(join(destination, '..'), { recursive: true });
        await fs.writeFile(destination, data, { flag: 'wx', mode: 0o600 });
      }
      await normalizePet(await readPackageFiles(stage), pet.name);
      if (replaceId) {
        backup = join(this.root, 'backup-' + randomUUID());
        await fs.rename(target, backup);
      }
      try { await fs.rename(stage, target); stage = undefined; }
      catch (error) { if (backup) { await fs.rename(backup, target); backup = undefined; } throw error; }
      if (backup) { await fs.rm(backup, { recursive: true }); backup = undefined; }
      return { id, name: pet.name, bundled: false };
    } finally {
      // Cleanup failure must not strand the lock. Keep a rollback backup if
      // restoring it failed; it may be the only surviving copy of the old pet.
      try { if (stage) await fs.rm(stage, { recursive: true, force: true }); }
      finally { await release(); }
    }
  }
  /** Remove only an installed copy, never its original import source or bundled Pi. */
  async remove(id: string, stillCurrent: () => boolean = () => true, expectedName?: string): Promise<void> {
    if (id === bundledId) throw new Error('Bundled Pi cannot be deleted');
    if (!validId(id)) throw new Error('Invalid pet ID');
    await this.withMutation(async () => {
      const target = join(this.libraryDir, id);
      let info;
      try { info = await fs.lstat(target); }
      catch (error) { if (missing(error)) throw new Error('Pet is unavailable'); throw error; }
      if (!info.isDirectory() || await fs.realpath(target) !== target) throw new Error('Unsafe pet directory');
      if (expectedName !== undefined && (await this.load(id)).name !== expectedName) throw new Error('Pet changed since confirmation; retry deletion');
      if (!stillCurrent()) throw new Error('Pet deletion cancelled: session changed');
      const selected = await this.loadSelected();
      if (selected.pet.id === id) await this.select(bundledId, stillCurrent);
      if (!stillCurrent()) throw new Error('Pet deletion cancelled: session changed');
      await fs.rm(target, { recursive: true });
    });
  }
  private async sources(id: string): Promise<PetSource[]> {
    const path = join(this.libraryDir, id, 'source.json');
    let info;
    try { info = await fs.lstat(path); } catch (error) { if (missing(error)) return []; throw error; }
    if (!info.isFile() || info.size > 64 * 1024 || await fs.realpath(path) !== path) throw new Error('Invalid source protection metadata');
    const record = JSON.parse(await fs.readFile(path, 'utf8'));
    if (record.schemaVersion !== 1 || !Array.isArray(record.sources) || record.sources.some((source: any) => !source
      || typeof source.path !== 'string' || !isAbsolute(source.path) || resolve(source.path) !== source.path
      || !['zip', 'file', 'directory'].includes(source.kind))) throw new Error('Invalid source protection metadata');
    return record.sources;
  }
  /** Provenance is local-only, retained on replacement and omitted from portable exports. */
  async assertExportDestination(target: string): Promise<void> {
    try { await this.checkRoot(); } catch (error) { if (missing(error)) return; throw error; }
    for (const id of await fs.readdir(this.libraryDir)) {
      if (!validId(id)) continue;
      for (const source of await this.sources(id)) {
        if (target === source.path || (source.kind === 'directory' && contains(source.path, target))) throw new Error('Imported source is protected from pet exports');
      }
    }
  }
  async loadSelected(): Promise<{ pet: LoadedPet; warning?: string }> {
    let initialAbsence = false;
    try {
      const path = join(this.root, 'selection.json');
      let info;
      try { info = await fs.lstat(path); }
      catch (error) { initialAbsence = missing(error); throw error; }
      await this.checkRoot();
      if (!info.isFile() || info.size > 4096 || await fs.realpath(path) !== path) throw new Error('Invalid selection file');
      const selection = JSON.parse(await fs.readFile(path, 'utf8'));
      if (selection.schemaVersion !== 1 || typeof selection.id !== 'string') throw new Error('Invalid selected pet');
      return { pet: await this.load(selection.id) };
    } catch (error) {
      return { pet: await this.load(bundledId), warning: initialAbsence ? undefined : `Selected pet unavailable; using Pi: ${String(error)}` };
    }
  }
  async select(id: string, stillCurrent: () => boolean = () => true): Promise<LoadedPet> {
    const pet = await this.load(id);
    if (!stillCurrent()) throw new Error('Pet switch cancelled: session changed');
    await this.ensure();
    const temporary = join(this.root, 'selection-' + randomUUID() + '.tmp');
    try {
      await fs.writeFile(temporary, JSON.stringify({ schemaVersion: 1, id }) + '\n', { flag: 'wx', mode: 0o600 });
      if (!stillCurrent()) throw new Error('Pet switch cancelled: session changed');
      // No await between the generation check and commit: a newer session/switch
      // cannot enqueue a later write and then be overwritten by this old rename.
      renameSync(temporary, join(this.root, 'selection.json'));
    } finally { await fs.rm(temporary, { force: true }); }
    return pet;
  }
  async exportFiles(id: string): Promise<PackageFiles> {
    const pet = await this.package(id);
    if (id === bundledId) pet.files.set('metadata.json', Buffer.from(JSON.stringify({ schemaVersion: 1, name: 'Pi' }) + '\n'));
    return pet.files;
  }
}
