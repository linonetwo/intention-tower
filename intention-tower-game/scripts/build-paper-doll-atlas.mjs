#!/usr/bin/env node
// Deterministic derivation of generated artwork. No color keying or painted substitutes.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { decodeRgbaPng, encodeRgbaPng, cropRgba, alphaBounds } from './lib/png-rgba.mjs';

const pack = path.resolve(import.meta.dirname, '../public/mods/gpt-image-2-pack');
const directory = path.join(pack, 'paper-doll');
const sourceBytes = await fs.readFile(path.join(directory, 'source-v1.png'));
const source = decodeRgbaPng(sourceBytes);
const sizes = { head: [56, 56], torso: [60, 72], upperArm: [18, 39], forearm: [18, 39], thigh: [22, 46], shin: [22, 50] };
const pixelRatio = 3;
const cells = [
  ['student-boy', 'head'], ['student-girl', 'head'], ['teacher', 'head'], ['scientist', 'head'],
  ['student-torso', 'torso'], ['student-upperArm', 'upperArm'], ['student-forearm', 'forearm'], ['navy-thigh', 'thigh'],
  ['navy-shin', 'shin'], ['teacher-torso', 'torso'], ['teacher-upperArm', 'upperArm'], ['teacher-forearm', 'forearm'],
  ['brown-thigh', 'thigh'], ['brown-shin', 'shin'], ['scientist-torso', 'torso'], ['scientist-upperArm', 'upperArm'],
  ['scientist-forearm', 'forearm'], ['teal-torso', 'torso'], ['teal-upperArm', 'upperArm'], ['teal-forearm', 'forearm'],
];

function isolated(image) {
  const { width, height, pixels } = image;
  const labels = new Int32Array(width * height);
  let label = 0, largest = 0, largestCount = 0;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || pixels[start * 4 + 3] < 16) continue;
    const queue = [start]; labels[start] = ++label;
    for (let n = 0; n < queue.length; n++) {
      const i = queue[n], x = i % width, y = Math.floor(i / width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * width + nx;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || labels[j] || pixels[j * 4 + 3] < 16) continue;
        labels[j] = label; queue.push(j);
      }
    }
    if (queue.length > largestCount) { largestCount = queue.length; largest = label; }
  }
  if (largestCount < 100) throw new Error('No substantial connected part in atlas cell');
  // Preserve low-alpha antialiasing within two pixels of the retained component.
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === largest) continue;
    const x = i % width, y = Math.floor(i / width);
    let nearby = false;
    if (pixels[i * 4 + 3] < 16) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && labels[ny * width + nx] === largest) nearby = true;
    }
    if (!nearby) pixels.fill(0, i * 4, i * 4 + 4);
  }
  const b = alphaBounds(image);
  return { image: cropRgba(image, b.left, b.top, b.right - b.left + 1, b.bottom - b.top + 1), bounds: b, componentPixels: largestCount };
}

function resize(image, width, height, preserveAspect) {
  const output = { width, height, pixels: Buffer.alloc(width * height * 4) };
  const padding = pixelRatio; // One skeleton unit, independent of texture resolution.
  const scale = Math.min((width - padding * 2) / image.width, (height - padding * 2) / image.height);
  const w = preserveAspect ? Math.max(1, Math.round(image.width * scale)) : width - padding * 2;
  const h = preserveAspect ? Math.max(1, Math.round(image.height * scale)) : height - padding * 2;
  const left = Math.floor((width - w) / 2), top = height - h - padding;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = (x + .5) * image.width / w - .5, sy = (y + .5) * image.height / h - .5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    const sums = [0, 0, 0, 0];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const ix = Math.max(0, Math.min(image.width - 1, x0 + dx)), iy = Math.max(0, Math.min(image.height - 1, y0 + dy));
      const offset = (iy * image.width + ix) * 4, weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy), a = image.pixels[offset + 3] / 255;
      sums[3] += weight * a;
      for (let c = 0; c < 3; c++) sums[c] += weight * a * image.pixels[offset + c];
    }
    const offset = ((top + y) * width + left + x) * 4;
    for (let c = 0; c < 3; c++) output.pixels[offset + c] = sums[3] ? Math.round(sums[c] / sums[3]) : 0;
    output.pixels[offset + 3] = Math.round(sums[3] * 255);
  }
  return output;
}

const records = [];
for (let i = 0; i < cells.length; i++) {
  const [id, type] = cells[i], col = i % 4, row = Math.floor(i / 4);
  const left = Math.round(col * source.width / 4), top = Math.round(row * source.height / 5);
  const cell = cropRgba(source, left, top, Math.round((col + 1) * source.width / 4) - left, Math.round((row + 1) * source.height / 5) - top);
  const extracted = isolated(cell), size = sizes[type].map(dimension => dimension * pixelRatio);
  const bytes = encodeRgbaPng(resize(extracted.image, ...size, type === 'head'));
  await fs.writeFile(path.join(directory, `${id}.png`), bytes);
  records.push({ id, type, cell: [col, row], sourceBounds: extracted.bounds, componentPixels: extracted.componentPixels, size, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const manifestPath = path.join(pack, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const url = id => `/mods/gpt-image-2-pack/paper-doll/${id}.png`;
const heads = Object.fromEntries(['student-boy', 'student-girl', 'teacher', 'scientist'].map(id => [id, url(id)]));
const outfits = Object.fromEntries(['student', 'teacher', 'scientist', 'teal'].map(id => [id, Object.fromEntries(['torso', 'upperArm', 'forearm', 'thigh', 'shin'].map(part => [part, url(['thigh', 'shin'].includes(part) ? `${['teacher', 'scientist'].includes(id) ? 'brown' : 'navy'}-${part}` : `${id}-${part}`)]))]));
const characters = {};
for (const [id, sprite] of Object.entries(manifest.spritesByCharacter)) {
  if (/animals\/|\/(hive|dog|gosling|cat)(?:-idle)?\.png$/.test(sprite.src)) continue;
  const src = sprite.src;
  let headId = 'student-boy', outfitId = 'student';
  if (/researcher/.test(src)) { headId = 'scientist'; outfitId = 'scientist'; }
  else if (/student-female/.test(src) || id === 'outsider') { headId = 'student-girl'; outfitId = 'teal'; }
  else if (/teacher|king/.test(src)) { headId = 'teacher'; outfitId = 'teacher'; }
  else if (/citizen/.test(src)) { headId = 'teacher'; outfitId = 'teal'; }
  else if (/rebel/.test(src)) outfitId = 'teacher';
  else if (/agent|investigator/.test(src)) outfitId = 'teal';
  characters[id] = { headId, outfitId, height: 150 };
}
manifest.paperDoll = { version: 1, heads, outfits, characters };
manifest.backgrounds.pavlov_lab = manifest.backgrounds.pavlov;
manifest.backgroundsMetadata.pavlov_lab = { ...manifest.backgroundsMetadata.pavlov };
if (!manifest.backgrounds.pavlov_pantry) {
  manifest.backgrounds.pavlov_pantry = manifest.backgrounds.pavlov;
  manifest.backgroundsMetadata.pavlov_pantry = { ...manifest.backgroundsMetadata.pavlov, temporaryReuse: true, note: 'Existing research-room art reused until dedicated pantry artwork is generated.' };
}
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await fs.writeFile(path.join(directory, 'provenance.json'), `${JSON.stringify({ version: 1, generator: 'proxy-imagegen', model: 'gpt-image-2', generated: '2026-10-23', promptFile: 'docs/art/paper-doll-v1-prompt.md', source: { file: 'source-v1.png', size: [source.width, source.height], sha256: createHash('sha256').update(sourceBytes).digest('hex') }, processing: 'Per-cell largest 8-connected alpha>=16 component; nearby low-alpha edge retained; tight crop; premultiplied-alpha bilinear resize, transparent 3px padding (one canonical unit). Heads retain aspect and bottom-centered neck.', pixelRatio, runtimeSizes: sizes, parts: records, characters }, null, 2)}\n`);
console.log(`Derived ${records.length} authentic paper-doll PNG parts and ${Object.keys(characters).length} human mappings.`);
