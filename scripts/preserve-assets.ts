import { readPackageFiles } from '../src/archive.ts';
import { normalizePet } from '../src/pet-package.ts';
import { PetLibrary, type PetInfo } from '../src/library.ts';

/** Verify a managed backup before the caller may restore modified bundled assets. */
export async function preserveAssets(library: PetLibrary, source: string, name: string): Promise<PetInfo> {
  const snapshot = await normalizePet(await readPackageFiles(source), name);
  const installed = await library.install(snapshot);
  const preserved = await library.load(installed.id);
  if (JSON.stringify(preserved.frames) !== JSON.stringify(snapshot.frames)) throw new Error('Preserved artwork verification failed; do not restore source');
  return installed;
}
