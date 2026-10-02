import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createInflateRaw } from 'node:zlib';
import { zipSync } from 'fflate';

export type PackageFiles = Map<string, Uint8Array>;
export const limits = { input: 32 * 1024 * 1024, total: 64 * 1024 * 1024, entries: 258, manifest: 64 * 1024, png: 1024 * 1024 };
export function safePackagePath(path: string): void {
  if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.includes('\\') || path.includes('\0')
    || path.split('/').some(part => part === '..' || part === '.')) throw new Error(`Unsafe package path: ${path}`);
}
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function bound(path: string): number {
  return path.endsWith('manifest.json') || path.endsWith('metadata.json') ? limits.manifest
    : /(?:^|\/)(?:frames\/)?(?:idle|running|waiting|review|failed|jumping|waving)\/\d+\.png$/.test(path) ? limits.png : limits.total;
}
function packageRoot(files: PackageFiles): PackageFiles {
  const roots = [...files.keys()].filter(path => path === 'manifest.json' || path.endsWith('/manifest.json'));
  if (roots.length !== 1) throw new Error('Package must contain exactly one manifest root');
  const prefix = roots[0].slice(0, -'manifest.json'.length);
  if (prefix.split('/').filter(Boolean).length > 1) throw new Error('Package wrapper must be a single directory');
  return new Map([...files].filter(([path]) => path.startsWith(prefix)).map(([path, data]) => [path.slice(prefix.length), data]));
}
async function readZip(zip: Buffer): Promise<PackageFiles> {
  let end = zip.length - 22;
  while (end >= Math.max(0, zip.length - 65557) && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50 || end + 22 + zip.readUInt16LE(end + 20) !== zip.length) throw new Error('Invalid ZIP directory');
  const count = zip.readUInt16LE(end + 10), start = zip.readUInt32LE(end + 16), size = zip.readUInt32LE(end + 12);
  if (count > limits.entries) throw new Error('Too many ZIP entries');
  if (zip.readUInt16LE(end + 4) || zip.readUInt16LE(end + 6) || zip.readUInt16LE(end + 8) !== count || start + size !== end) throw new Error('Unsupported ZIP64/multidisk directory');
  const records: { path: string; compressed: number; original: number; offset: number; method: number; crc: number }[] = [];
  const names = new Set<string>();
  let cursor = start, declared = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP entry');
    const nameLen = zip.readUInt16LE(cursor + 28), extra = zip.readUInt16LE(cursor + 30), comment = zip.readUInt16LE(cursor + 32);
    const next = cursor + 46 + nameLen + extra + comment;
    if (next > end) throw new Error('Invalid ZIP entry bounds');
    const path = zip.toString('utf8', cursor + 46, cursor + 46 + nameLen);
    safePackagePath(path);
    if (names.has(path)) throw new Error('Duplicate ZIP entry');
    names.add(path);
    if ((zip.readUInt32LE(cursor + 38) >>> 16 & 0o170000) === 0o120000) throw new Error('ZIP symlinks are not allowed');
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10);
    if ((flags & 1) || ![0, 8].includes(method)) throw new Error('Unsupported ZIP compression/encryption');
    const compressed = zip.readUInt32LE(cursor + 20), original = zip.readUInt32LE(cursor + 24), offset = zip.readUInt32LE(cursor + 42);
    declared += original;
    if (original > bound(path) || declared > limits.total) throw new Error('ZIP size limit exceeded');
    if (!path.endsWith('/')) records.push({ path, compressed, original, offset, method, crc: zip.readUInt32LE(cursor + 16) });
    cursor = next;
  }
  if (cursor !== end) throw new Error('Invalid ZIP directory size');
  const files: PackageFiles = new Map();
  let total = 0;
  for (const record of records) {
    const { path, offset, compressed, original, method } = record;
    if (offset + 30 > start || zip.readUInt32LE(offset) !== 0x04034b50) throw new Error('Invalid ZIP local entry');
    const nameLen = zip.readUInt16LE(offset + 26), extra = zip.readUInt16LE(offset + 28), dataStart = offset + 30 + nameLen + extra;
    if (dataStart + compressed > start || zip.toString('utf8', offset + 30, offset + 30 + nameLen) !== path || zip.readUInt16LE(offset + 8) !== method) throw new Error('ZIP local/central mismatch');
    if (!(zip.readUInt16LE(offset + 6) & 8) && (zip.readUInt32LE(offset + 22) !== original || zip.readUInt32LE(offset + 18) !== compressed)) throw new Error('ZIP size mismatch');
    const input = zip.subarray(dataStart, dataStart + compressed);
    let data: Buffer;
    if (method === 0) data = Buffer.from(input);
    else {
      const inflater = createInflateRaw({ chunkSize: 16 * 1024 });
      const chunks: Buffer[] = []; let bytes = 0;
      inflater.end(input);
      for await (const chunk of inflater) {
        bytes += chunk.length;
        if (bytes > original || bytes > bound(path) || total + bytes > limits.total) {
          inflater.destroy(); throw new Error('Actual ZIP inflation size limit exceeded');
        }
        chunks.push(chunk);
      }
      data = Buffer.concat(chunks, bytes);
    }
    total += data.length;
    if (data.length !== original || total > limits.total || crc32(data) !== record.crc) throw new Error('ZIP size/CRC mismatch');
    files.set(path, data);
  }
  return packageRoot(files);
}
export async function readPackageFiles(source: string): Promise<PackageFiles> {
  source = resolve(source);
  if (await realpath(source) !== source) throw new Error('Symlink package paths are not allowed');
  const info = await lstat(source);
  if (info.isFile()) {
    if (info.size > limits.input) throw new Error('ZIP input size limit exceeded');
    return readZip(await readFile(source));
  }
  if (!info.isDirectory()) throw new Error('Expected a ZIP or pet directory');
  const files: PackageFiles = new Map(); let total = 0, entries = 0;
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix + entry.name; safePackagePath(path);
      if (++entries > limits.entries) throw new Error('Too many directory entries');
      const full = join(dir, entry.name), stat = await lstat(full);
      if (stat.isSymbolicLink() || await realpath(full) !== full) throw new Error('Directory symlinks are not allowed');
      if (stat.isDirectory()) await walk(full, path + '/');
      else if (stat.isFile()) {
        total += stat.size;
        if (stat.size > bound(path) || total > limits.total) throw new Error('Directory size limit exceeded');
        files.set(path, await readFile(full));
      } else throw new Error('Unsupported package file');
    }
  }
  await walk(source, '');
  return packageRoot(files);
}
export async function writePackageZip(files: PackageFiles): Promise<Uint8Array> {
  let total = 0;
  if (files.size > limits.entries) throw new Error('Too many package entries');
  for (const [path, data] of files) { safePackagePath(path); total += data.length; if (data.length > bound(path) || total > limits.total) throw new Error('Package size limit exceeded'); }
  const zip = zipSync(Object.fromEntries(files), { level: 6 });
  if (zip.length > limits.input) throw new Error('Export ZIP exceeds input limit');
  return zip;
}
