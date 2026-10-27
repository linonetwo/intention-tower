#!/usr/bin/env node
/** Losslessly extract the generated 4×3 atlas. Never key out black pixels. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeRgbaPng, alphaBounds, cropRgba, encodeRgbaPng } from './lib/png-rgba.mjs';

const pack = path.resolve(import.meta.dirname, '../public/mods/gpt-image-2-pack');
const names = ['researcher', 'dog', 'student-female', 'student-male', 'investigator', 'agent', 'teacher', 'citizen', 'rebel', 'king', 'gosling', 'cat'];
const image = decodeRgbaPng(await fs.readFile(path.join(pack, 'sprites/ensemble-source.png')));
console.log(`Source ${image.width}×${image.height} RGBA; alpha bounds`, alphaBounds(image));
for (let cell = 0; cell < names.length; cell++) {
  const col = cell % 4, row = Math.floor(cell / 4);
  const left = Math.round(col * image.width / 4), top = Math.round(row * image.height / 3);
  const right = Math.round((col + 1) * image.width / 4), bottom = Math.round((row + 1) * image.height / 3);
  const tile = cropRgba(image, left, top, right - left, bottom - top);
  // Ignore sub-6% alpha specks far away from the actual generated silhouette.
  // Copy all original alpha in an 8px surrounding region; never remove black costume pixels.
  const bounds = alphaBounds(tile, 16);
  if (!bounds) throw new Error(`Empty tile ${names[cell]}`);
  // Add padding outside the tile, so full-body edge pixels are never clipped.
  const width = bounds.right - bounds.left + 17, height = bounds.bottom - bounds.top + 17;
  const output = { width, height, pixels: Buffer.alloc(width * height * 4) };
  const copyLeft = Math.max(0, bounds.left - 8), copyRight = Math.min(tile.width - 1, bounds.right + 8);
  for (let y = Math.max(0, bounds.top - 8); y <= Math.min(tile.height - 1, bounds.bottom + 8); y++) tile.pixels.copy(output.pixels, ((y - bounds.top + 8) * width + copyLeft - bounds.left + 8) * 4, (y * tile.width + copyLeft) * 4, (y * tile.width + copyRight + 1) * 4);
  await fs.writeFile(path.join(pack, `sprites/${names[cell]}.png`), encodeRgbaPng(output));
  console.log(`${names[cell]} ${width}×${height}, source cell ${left},${top}..${right},${bottom}, bbox ${JSON.stringify(bounds)}`);
}

const assignments = {
  researcher: ['pavlov', 'lorenz', 'hines'],
  dog: ['dog'],
  'student-female': ['student-worker', 'student-b', 'clone-b'],
  'student-male': ['tim', 'student-a', 'addict-teen', 'protagonist', 'clone-a', 'clone-c', 'friend', 'victim', 'subject', 'trapped-person', 'meme-target'],
  investigator: ['investigator', 'player'],
  agent: ['antimeme-agent', 'player-agent', 'ally-agent', 'enemy-target', 'player-capitalist'],
  teacher: ['teacher-wenger', 'trainer', 'meme-engineer', 'illusionist', 'ideologue', 'skeptic', 'magic-merchant'],
  citizen: ['bystander', 'citizen-1', 'citizen-2', 'citizen-3', 'citizen-4', 'citizen-5', 'luddite-1', 'luddite-2', 'energy-employee', 'believer'],
  rebel: ['chen-sheng', 'wu-guang', 'soldier-1', 'soldier-2', 'soldier-3', 'vagrant-leader', 'vagrant-1', 'vagrant-2'],
  king: ['king', 'minister'], gosling: ['gosling'], cat: ['cat-billi'], hive: ['hive-mind'],
};
const manifestPath = path.join(pack, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
manifest.spritesByCharacter = {};
for (const [archetype, ids] of Object.entries(assignments)) {
  const src = `/mods/gpt-image-2-pack/sprites/${archetype}.png`;
  const asset = { src, height: ['dog', 'cat'].includes(archetype) ? 90 : archetype === 'gosling' ? 65 : archetype === 'hive' ? 165 : 150, facing: 'right', groundAnchor: .97 };
  for (const id of ids) { manifest.spritesByCharacter[`it:entity/${id}`] = asset; manifest.spritesByCharacter[id] = asset; }
}
manifest.spriteArtDirection = 'Four-head-tall full-body anime side-scrolling characters; transparent generated RGBA atlas crops with intact feet.';
manifest.spriteSource = '/mods/gpt-image-2-pack/sprites/ensemble-source.png';
manifest.version = Math.max(2, Number(manifest.version || 1));
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Mapped ${Object.keys(manifest.spritesByCharacter).length / 2} characters; hive PNG is independently generated.`);
