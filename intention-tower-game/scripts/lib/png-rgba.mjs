/** Dependency-free 8-bit non-interlaced RGBA PNG inspection and lossless cropping. */
import { inflateSync, deflateSync } from 'node:zlib';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
export function decodeRgbaPng(bytes) {
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Not PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0) throw new Error('Expected 8-bit non-interlaced RGBA PNG');
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (offset + size + 12 > bytes.length) throw new Error('Truncated PNG');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const payload = bytes.subarray(offset + 4, offset + size + 8);
    if (crc32(payload) !== bytes.readUInt32BE(offset + size + 8)) throw new Error(`Invalid ${type} CRC`);
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + size + 8));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw new Error('Unexpected image data size');
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Unknown PNG filter');
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const a = x >= 4 ? pixels[i - 4] : 0, b = y ? pixels[i - stride] : 0, c = y && x >= 4 ? pixels[i - stride - 4] : 0;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[i] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { width, height, pixels };
}
export function alphaBounds({ width, height, pixels }, threshold = 1) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < threshold) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : { left, top, right, bottom };
}
export function cropRgba(image, left, top, width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) image.pixels.copy(pixels, y * width * 4, ((top + y) * image.width + left) * 4, ((top + y) * image.width + left + width) * 4);
  return { width, height, pixels };
}
export function encodeRgbaPng({ width, height, pixels }) {
  const chunk = (name, payload) => {
    const type = Buffer.from(name), output = Buffer.alloc(payload.length + 12);
    output.writeUInt32BE(payload.length); type.copy(output, 4); payload.copy(output, 8);
    output.writeUInt32BE(crc32(Buffer.concat([type, payload])), payload.length + 8);
    return output;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
