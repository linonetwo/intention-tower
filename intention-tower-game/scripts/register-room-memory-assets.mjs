#!/usr/bin/env node
// Registers reviewed source PNGs without resampling or changing their artwork.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const project = path.resolve(import.meta.dirname, '..');
const pack = path.join(project, 'public/mods/gpt-image-2-pack');
const directory = path.join(pack, 'sideview/room-memory');
const promptFile = 'docs/art/room-memory-prompts.md';
const prompts = await fs.readFile(path.resolve(project, '..', promptFile), 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Floor coordinates are reviewed against the delivered PNG, not inferred from
// the requested y=805. Keep these in sync with the visualReview notes below.
const floors = { archive: 736, maproom: 787, conservatory: 697 };
const manifestPath = path.join(pack, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const records = {};
for (const id of ['archive', 'maproom', 'conservatory']) {
  const file = `${id}.png`, bytes = await fs.readFile(path.join(directory, file));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${file} is not PNG`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width !== 1536 || height !== 1024) throw new Error(`${file}: unexpected ${width}x${height}`);
  const prompt = prompts.split(`## ${id}\n`)[1]?.match(/```text\n([\s\S]*?)\n```/)?.[1];
  if (!prompt) throw new Error(`Missing exact prompt for ${id}`);
  const key = `antimeme_${id}`;
  manifest.backgrounds[key] = `/mods/gpt-image-2-pack/sideview/room-memory/${file}`;
  manifest.backgroundsMetadata[key] = { width, height, floorY: floors[id] };
  records[key] = { file, width, height, floorY: floors[id], sha256: sha256(bytes), prompt, visualReview: `Reviewed actual delivered PNG: front-facing room, level uninterrupted edge-to-edge platform whose top is y=${floors[id]}, clear character travel band; no people, UI, text or watermark. Original pixels retained; requested y=805 was not treated as measured geometry.` };
}
const receptionFile = 'rooms/antimeme-division.png';
const receptionBytes = await fs.readFile(path.join(pack, 'sideview', receptionFile));
const receptionMeta = manifest.backgroundsMetadata['antimeme-division'];
manifest.backgrounds.antimeme_reception = `/mods/gpt-image-2-pack/sideview/${receptionFile}`;
manifest.backgroundsMetadata.antimeme_reception = { ...receptionMeta };
const provenance = { version: 1, generator: 'proxy-imagegen', model: 'gpt-image-2', generated: '2026-10-24', promptFile, promptFileSha256: sha256(Buffer.from(prompts)), rooms: records, reused: { antimeme_reception: { file: `../${receptionFile}`, ...receptionMeta, sha256: sha256(receptionBytes), sourceKey: 'antimeme-division', visualReview: 'Existing image inspected: front-facing wall and continuous horizontal platform. Explicit reuse, not a fourth new generation.' } } };
await fs.writeFile(path.join(directory, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Registered three reviewed room-memory backgrounds and one explicit existing-art reception alias.');
