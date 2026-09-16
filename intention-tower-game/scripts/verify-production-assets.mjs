#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const packRoot = path.join(projectRoot, 'public/mods/gpt-image-2-pack');
const manifestPath = path.join(packRoot, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const errors = [];

const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

assert(manifest.id === 'gpt-image-2-pack', `unexpected manifest id: ${manifest.id}`);
assert(manifest.model === 'gpt-image-2', `unexpected image model: ${manifest.model}`);
assert(String(manifest.provider).includes('GPT Image 2'), `unexpected provider: ${manifest.provider}`);

const levelEntries = await fs.readdir(path.join(projectRoot, 'assets/levels'), { withFileTypes: true });
const levelIds = [];
for (const entry of levelEntries) {
  if (!entry.isDirectory()) continue;
  try {
    await fs.access(path.join(projectRoot, 'assets/levels', entry.name, 'level.jsonld'));
    levelIds.push(entry.name);
  } catch {
    // Ignore helper directories that are not playable levels.
  }
}
levelIds.sort();

const backgroundItems = (manifest.items ?? []).filter((item) => item.type === 'background');
const portraitItems = (manifest.items ?? []).filter((item) => item.type === 'portrait');
const uniquePortraitItems = [...new Map(portraitItems.map((item) => [item.charId, item])).values()];
assert(levelIds.length === 21, `expected 21 playable levels, found ${levelIds.length}`);
assert(backgroundItems.length === levelIds.length, `expected ${levelIds.length} background items, found ${backgroundItems.length}`);
assert(uniquePortraitItems.length === 55, `expected 55 unique portrait items, found ${uniquePortraitItems.length}`);

const fileRecords = [];
async function verifyPng(relativePath, expectedWidth, expectedHeight, label) {
  const normalized = relativePath.replace(/^\/mods\/gpt-image-2-pack\//, '');
  const absolutePath = path.join(packRoot, normalized);
  try {
    const bytes = await fs.readFile(absolutePath);
    const signature = bytes.subarray(0, 8).toString('hex');
    assert(signature === '89504e470d0a1a0a', `${label} is not a PNG: ${normalized}`);
    assert(bytes.length > 100_000, `${label} is suspiciously small: ${normalized} (${bytes.length} bytes)`);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert(width === expectedWidth && height === expectedHeight, `${label} dimensions are ${width}x${height}, expected ${expectedWidth}x${expectedHeight}: ${normalized}`);
    fileRecords.push({ normalized, hash: createHash('sha256').update(bytes).digest('hex') });
  } catch (error) {
    errors.push(`${label} cannot be read: ${normalized} (${error.message})`);
  }
}

for (const levelId of levelIds) {
  const url = manifest.backgrounds?.[levelId];
  assert(typeof url === 'string', `missing background mapping for ${levelId}`);
  if (typeof url === 'string') await verifyPng(url, 1672, 941, `background ${levelId}`);
}

for (const item of uniquePortraitItems) {
  const url = manifest.portraitsByCharacter?.[item.charId];
  const shortId = item.charId?.includes('/') ? item.charId.split('/').at(-1) : item.charId;
  assert(typeof url === 'string', `missing portrait mapping for ${item.charId}`);
  assert(!shortId || manifest.portraitsByCharacter?.[shortId] === url, `short portrait alias does not match for ${item.charId}`);
  if (typeof url === 'string') await verifyPng(url, 1254, 1254, `portrait ${item.charId}`);
}

const hashes = new Map();
for (const record of fileRecords) {
  const duplicate = hashes.get(record.hash);
  assert(!duplicate, `duplicate image content: ${duplicate} and ${record.normalized}`);
  hashes.set(record.hash, record.normalized);
}

const backgroundFiles = (await fs.readdir(path.join(packRoot, 'backgrounds'))).filter((name) => name.endsWith('.png'));
const portraitFiles = (await fs.readdir(path.join(packRoot, 'portraits'))).filter((name) => name.endsWith('.png'));
assert(backgroundFiles.length === levelIds.length, `background directory contains ${backgroundFiles.length} PNGs, expected ${levelIds.length}`);
assert(portraitFiles.length === uniquePortraitItems.length, `portrait directory contains ${portraitFiles.length} PNGs, expected ${uniquePortraitItems.length}`);

if (errors.length > 0) {
  process.stderr.write(`Production asset verification failed:\n- ${errors.join('\n- ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Production assets verified: ${levelIds.length} backgrounds, ${uniquePortraitItems.length} portraits, ${fileRecords.length} unique PNG files.\n`);
}
