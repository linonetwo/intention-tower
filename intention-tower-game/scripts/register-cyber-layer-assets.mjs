#!/usr/bin/env node
// Reproducibly registers existing reviewed PNGs; never calls image generation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const project = path.resolve(import.meta.dirname, '..');
const pack = path.join(project, 'public/mods/gpt-image-2-pack');
const directory = path.join(pack, 'sideview/cyber-layers');
const promptFile = 'docs/art/cyber-layer-prompts.md';
const prompts = await fs.readFile(path.resolve(project, '..', promptFile), 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Observed top edges in native 1536x1024 source coordinates, not requested 805.
const floors = { 'reality-workshop': 692, 'outer-exchange': 766, 'inner-arrival': 719, 'inner-archive': 848 };
const manifestPath = path.join(pack, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const rooms = {}, reused = {};
for (const [id, floorY] of Object.entries(floors)) {
  const file = `${id}.png`, bytes = await fs.readFile(path.join(directory, file));
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${file} is not PNG`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width !== 1536 || height !== 1024) throw new Error(`${file}: unexpected dimensions`);
  const prompt = prompts.split(`## ${id}\n`)[1]?.match(/```text\n([\s\S]*?)\n```/)?.[1];
  if (!prompt) throw new Error(`Missing exact prompt: ${id}`);
  const key = `cyber_${id.replaceAll('-', '_')}`;
  manifest.backgrounds[key] = `/mods/gpt-image-2-pack/sideview/cyber-layers/${file}`;
  manifest.backgroundsMetadata[key] = { width, height, floorY };
  rooms[key] = { file, width, height, floorY, sha256: sha256(bytes), prompt, visualReview: `Reviewed actual delivered PNG: front-facing wall, uninterrupted horizontal platform with observed top y=${floorY}, clear central travel band; no visible people, text, UI or watermark. Original generated pixels retained. Requested y=805 is not measured geometry.` };
}
for (const [key, sourceKey] of Object.entries({ cyber_reality_garden: 'antimeme_conservatory', cyber_outer_arrival: 'cyber-dream' })) {
  const url = manifest.backgrounds[sourceKey], metadata = manifest.backgroundsMetadata[sourceKey];
  if (!url || !metadata) throw new Error(`Missing existing source ${sourceKey}`);
  manifest.backgrounds[key] = url;
  manifest.backgroundsMetadata[key] = { ...metadata };
  const file = path.posix.relative('sideview/cyber-layers', url.replace('/mods/gpt-image-2-pack/', ''));
  reused[key] = { file, sourceKey, ...metadata, sha256: sha256(await fs.readFile(path.join(directory, file))), visualReview: 'Explicit reuse of existing reviewed production art; no new generation or pixel changes.' };
}
const provenance = { version: 1, generator: 'proxy-imagegen', model: 'gpt-image-2', generated: '2026-10-27', promptFile, promptFileSha256: sha256(Buffer.from(prompts)), rooms, reused };
await fs.writeFile(path.join(directory, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Registered four reviewed cyber-layer PNGs and two explicit existing-art aliases.');
