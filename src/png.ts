import { inflateSync } from 'node:zlib';
import { crc32 } from './archive.ts';

/** Bounded integrity check for our fixed, noninterlaced 8-bit RGB/RGBA frames. */
export function validateFrame(data: Uint8Array): void {
  const png = Buffer.from(data);
  if (png.length > 1024 * 1024 || png.length < 45 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid PNG signature/size');
  let offset = 8, channels = 0, ended = false, idatEnded = false, hasPalette = false;
  const compressed: Buffer[] = [];
  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error('Invalid PNG chunk bounds');
    const size = png.readUInt32BE(offset), end = offset + 12 + size;
    if (end > png.length) throw new Error('Invalid PNG chunk bounds');
    const type = png.toString('ascii', offset + 4, offset + 8), payload = png.subarray(offset + 8, end - 4);
    if (crc32(png.subarray(offset + 4, end - 4)) !== png.readUInt32BE(end - 4)) throw new Error('PNG CRC mismatch');
    if (offset === 8 && type !== 'IHDR') throw new Error('PNG missing IHDR');
    if (type === 'IHDR') {
      if (offset !== 8 || size !== 13 || payload.readUInt32BE(0) !== 192 || payload.readUInt32BE(4) !== 208
        || payload[8] !== 8 || ![2,6].includes(payload[9]) || payload[10] || payload[11] || payload[12]) throw new Error('PNG must be noninterlaced 192x208 8-bit RGB/RGBA');
      channels = payload[9] === 6 ? 4 : 3;
    } else if (type === 'PLTE') {
      if (hasPalette || compressed.length || !size || size > 768 || size % 3) throw new Error('Invalid PNG PLTE length, count or order');
      hasPalette = true;
    } else if (type === 'IDAT') {
      if (idatEnded) throw new Error('PNG IDAT chunks must be contiguous');
      compressed.push(payload);
    } else if (type === 'IEND') {
      if (size || !compressed.length || end !== png.length) throw new Error('Invalid PNG IEND');
      ended = true;
    } else {
      if (compressed.length) idatEnded = true;
      if (type[0] === type[0].toUpperCase()) throw new Error('Unsupported critical PNG chunk');
    }
    offset = end;
  }
  if (!ended) throw new Error('PNG missing IEND');
  const row = 1 + 192 * channels, expected = row * 208;
  const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  if (pixels.length !== expected) throw new Error('Invalid PNG pixel data size');
  for (let y = 0; y < 208; y++) if (pixels[y * row] > 4) throw new Error('Invalid PNG row filter');
}
