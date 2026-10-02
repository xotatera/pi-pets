import fs from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import type { Animation } from '../assets.ts';
import type { SpriteDefinition } from '../sprite-decoder.ts';
import type { InstalledPet, PetSnapshot, SourceLocation } from './types.ts';

const states: Animation[] = ['idle','running','waiting','review','failed','jumping','waving'];
const builtins = [
  ['codex','Codex','codex-spritesheet-v4.webp'], ['dewey','Dewey','dewey-spritesheet-v4.webp'], ['fireball','Fireball','fireball-spritesheet-v4.webp'], ['rocky','Rocky','rocky-spritesheet-v4.webp'], ['seedy','Seedy','seedy-spritesheet-v4.webp'], ['stacky','Stacky','stacky-spritesheet-v4.webp'], ['bsod','BSOD','bsod-spritesheet-v4.webp'], ['null-signal','Null Signal','null-signal-spritesheet-v4.webp'],
] as const;
const defaults: Record<Animation, number[]> = { idle:[0,1,2,3,4,5], running:[56,57,58,59,60,61], waiting:[48,49,50,51,52,53], review:[64,65,66,67,68,69], failed:[40,41,42,43,44,45,46,47], jumping:[32,33,34,35,36], waving:[24,25,26,27] };
function inside(parent: string, path: string) { const p = relative(parent, path); return p === '' || (p !== '..' && !p.startsWith('../') && !isAbsolute(p)); }
async function exists(path: string) { try { await fs.lstat(path); return true; } catch { return false; } }
async function realFile(path: string, max = 16 * 1024 * 1024) { const st = await fs.lstat(path); if (!st.isFile() || st.isSymbolicLink() || st.size > max) throw new Error('Unsafe source file'); const rp = await fs.realpath(path); if (rp !== path) throw new Error('Unsafe source path'); return { st, rp }; }
type Discovered = { pet: InstalledPet; manifest?: string; dir?: string; builtFile?: string; manifestFingerprint?: string; assetFingerprint?: string };
export class CodexCliSources {
  private root: string; private platform: NodeJS.Platform;
  private byKey = new Map<string, Discovered>();
  constructor(options: { home: string; env: NodeJS.ProcessEnv; platform?: NodeJS.Platform }) { this.platform = options.platform ?? process.platform; this.root = resolve(options.env.CODEX_HOME || join(options.home, '.codex')); }
  async discover(): Promise<{ pets: InstalledPet[]; warnings: string[] }> {
    this.byKey.clear(); const pets: InstalledPet[] = [], warnings: string[] = [];
    if (this.platform !== 'linux') return { pets, warnings: ['Codex CLI pet source is currently supported on Linux only'] };
    if (!await exists(this.root)) warnings.push(`Codex storage not found at ${this.root}`);
    else if (await fs.realpath(this.root) !== this.root || !(await fs.lstat(this.root)).isDirectory()) return { pets, warnings: ['Unsafe Codex home directory'] };
    await this.scanDir('custom', join(this.root, 'pets'), 'pet.json', pets);
    await this.scanDir('legacy', join(this.root, 'avatars'), 'avatar.json', pets);
    const assetRoot = join(this.root, 'cache/tui-pets/v1/assets');
    for (const [id,name,file] of builtins) {
      const path = join(assetRoot, file); const present = await exists(path);
      const fingerprint = present ? await this.fpFile(path).catch(() => undefined) : undefined;
      const pet: InstalledPet = { key: `built-in:${id}:${fingerprint ?? 'unavailable'}`, source:'codex-cli', name, category:'built-in', cached: !!fingerprint, unavailable: fingerprint ? undefined : present ? 'Cached built-in artwork is unsafe or oversized' : 'Built-in spritesheet is not cached by Codex CLI' };
      pets.push(pet); this.byKey.set(pet.key, { pet, builtFile: path, assetFingerprint: fingerprint });
    }
    return { pets: pets.slice(0, 256), warnings };
  }
  private async scanDir(category: 'custom'|'legacy', root: string, manifestName: string, pets: InstalledPet[]) {
    let ids: string[] = []; try { ids = (await fs.readdir(root)).slice(0, 256); } catch { return; }
    for (const id of ids) {
      const dir = join(root, id), manifest = join(dir, manifestName); let name = id, unavailable: string|undefined;
      let manifestFingerprint: string | undefined, assetFingerprint: string | undefined;
      try {
        const parsed = await this.readManifest(manifest);
        name = parsed.displayName || id;
        const { sheet } = this.parseManifest(parsed, dir);
        manifestFingerprint = await this.fpFile(manifest, 64*1024);
        assetFingerprint = await this.fpFile(sheet);
      } catch (e) { unavailable = String(e instanceof Error ? e.message : e); }
      const pet: InstalledPet = { key: `${category}:${encodeURIComponent(id)}:${manifestFingerprint ?? 'unavailable'}:${assetFingerprint ?? 'unavailable'}`, source:'codex-cli', name, category, cached: !unavailable, unavailable };
      pets.push(pet); this.byKey.set(pet.key, { pet, manifest, dir, manifestFingerprint, assetFingerprint });
    }
  }
  private async fpFile(path: string, max = 16*1024*1024) { const { st } = await realFile(path, max); return `${st.ino}-${st.size}-${st.mtimeMs}-${st.ctimeMs}`; }
  private async readManifest(path: string) { const { st } = await realFile(path, 64*1024); const text = await fs.readFile(path, 'utf8'); if ((await fs.lstat(path)).mtimeMs !== st.mtimeMs) throw new Error('Source changed; retry'); return JSON.parse(text); }
  private parseManifest(m: any, dir: string): { definition: SpriteDefinition; sheet: string; fallbackStates: Animation[] } {
    if (!m || typeof m !== 'object' || typeof m.displayName !== 'string' && m.displayName !== undefined || typeof m.spritesheetPath !== 'string') throw new Error('Unsupported Codex pet manifest');
    const frame = m.frame ?? { width:192, height:208, columns:8, rows:9 };
    if (frame.width !== 192 || frame.height !== 208 || !Number.isInteger(frame.columns) || !Number.isInteger(frame.rows) || frame.columns < 1 || frame.rows < 1 || frame.columns * frame.rows > 256) throw new Error('Unsupported Codex pet geometry');
    const sheet = resolve(dir, m.spritesheetPath); if (!inside(dir, sheet)) throw new Error('Spritesheet must stay inside pet directory');
    const tracks: Record<Animation, number[]> = { ...defaults }; const fallbackStates: Animation[] = [];
    const specs = m.animations ?? {}; if (typeof specs !== 'object' || Array.isArray(specs)) throw new Error('Invalid Codex animations');
    for (const state of states) if (specs[state]) tracks[state] = this.parseAnim(state, specs[state], frame.columns * frame.rows, specs);
    if (!specs.idle && Object.keys(specs).length) throw new Error('Custom Codex animations must define idle');
    for (const state of states) if (!specs[state] && specs.idle && state !== 'idle') { tracks[state] = tracks.idle; fallbackStates.push(state); }
    return { definition: { name: m.displayName ?? 'Codex pet', cellWidth:192, cellHeight:208, columns: frame.columns, rows: frame.rows, tracks, fallbackStates }, sheet, fallbackStates };
  }
  private parseAnim(name: string, spec: any, frameCount: number, specs: any) { if (!spec || !Array.isArray(spec.frames) || spec.frames.length < 1) throw new Error(`Invalid animation ${name}`); if (spec.fps !== undefined && (!Number.isFinite(spec.fps) || spec.fps <= 0 || spec.fps > 60)) throw new Error('Invalid animation fps'); if (spec.fallback && !specs[spec.fallback] && spec.fallback !== 'idle') throw new Error('Invalid animation fallback'); for (const i of spec.frames) if (!Number.isInteger(i) || i < 0 || i >= frameCount) throw new Error('Invalid animation frame'); return spec.frames; }
  async snapshot(key: string, signal?: AbortSignal): Promise<PetSnapshot> {
    signal?.throwIfAborted(); const record = this.byKey.get(key);
    if (!record || !record.pet.cached) throw new Error('Codex pet source is unavailable; rediscover and retry');
    if (record.builtFile) {
      const before = await this.fpFile(record.builtFile);
      if (before !== record.assetFingerprint) throw new Error('Source changed; retry');
      const bytes = await fs.readFile(record.builtFile);
      if (before !== await this.fpFile(record.builtFile)) throw new Error('Source changed; retry');
      signal?.throwIfAborted();
      return { key, source:'codex-cli', name: record.pet.name, definition: { name: record.pet.name, cellWidth:192, cellHeight:208, columns:8, rows:9, tracks: defaults }, bytes, locations:[{ path: record.builtFile, kind:'file' }], fallbackStates: [] };
    }
    if (!record.manifest || !record.dir) throw new Error('Unavailable source');
    const before = await this.fpFile(record.manifest, 64*1024);
    if (before !== record.manifestFingerprint) throw new Error('Source changed; retry');
    const parsed = await this.readManifest(record.manifest);
    const { definition, sheet, fallbackStates } = this.parseManifest(parsed, record.dir);
    definition.name = record.pet.name;
    const assetBefore = await this.fpFile(sheet);
    if (assetBefore !== record.assetFingerprint) throw new Error('Source changed; retry');
    const bytes = await fs.readFile(sheet);
    if (before !== await this.fpFile(record.manifest, 64*1024) || assetBefore !== await this.fpFile(sheet)) throw new Error('Source changed; retry');
    signal?.throwIfAborted();
    const locations: SourceLocation[] = [{ path: record.dir, kind:'directory' }, { path: record.manifest, kind:'file' }, { path: sheet, kind:'file' }]; return { key, source:'codex-cli', name: definition.name, definition, bytes, locations, fallbackStates };
  }
}
