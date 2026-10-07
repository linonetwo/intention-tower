#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeRgbaPng, alphaBounds } from './lib/png-rgba.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const packRoot = path.join(projectRoot, 'public/mods/gpt-image-2-pack');
const manifestPath = path.join(packRoot, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const errors = [];

const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

// Chinese UI must render without fonts installed on the host OS or a network CDN.
try {
  const font = await fs.readFile(path.join(projectRoot, 'public/fonts/NotoSansSC-VF.ttf'));
  assert(font.length > 1_000_000, `bundled CJK font is suspiciously small (${font.length} bytes)`);
  assert(font.subarray(0, 4).toString('hex') === '00010000', 'bundled Noto Sans SC is not a TrueType font');
  const tables = new Set();
  const tableCount = font.readUInt16BE(4);
  assert(12 + tableCount * 16 <= font.length, 'bundled font has an invalid SFNT directory');
  for (let index = 0; index < tableCount && 12 + (index + 1) * 16 <= font.length; index++) {
    const offset = 12 + index * 16;
    tables.add(font.subarray(offset, offset + 4).toString('ascii'));
    const tableOffset = font.readUInt32BE(offset + 8);
    const tableLength = font.readUInt32BE(offset + 12);
    assert(tableOffset + tableLength <= font.length, `bundled font table is truncated: ${font.subarray(offset, offset + 4).toString('ascii')}`);
  }
  for (const table of ['cmap', 'name', 'fvar', 'glyf']) assert(tables.has(table), `bundled variable CJK font lacks ${table}`);
  const license = await fs.readFile(path.join(projectRoot, 'public/fonts/OFL.txt'), 'utf8');
  assert(/SIL OPEN FONT LICENSE/i.test(license) && /Version 1\.1/i.test(license), 'bundled font lacks the SIL Open Font License 1.1');
  const css = await fs.readFile(path.join(projectRoot, 'src/fonts.css'), 'utf8');
  assert(css.includes('@font-face') && css.includes("font-family: 'Intention CJK'") && css.includes('/fonts/NotoSansSC-VF.ttf') && /font-weight:\s*100 900/.test(css), 'bundled CJK font is not registered as the Intention CJK variable UI face');
  const app = await fs.readFile(path.join(projectRoot, 'src/App.tsx'), 'utf8');
  assert(app.includes('Intention CJK'), 'MUI theme does not use the bundled CJK font alias');
  const entry = await fs.readFile(path.join(projectRoot, 'src/main.tsx'), 'utf8');
  assert(entry.includes("import './fonts.css'"), 'bundled CJK stylesheet is not loaded by the application entry');
  const config = JSON.parse(await fs.readFile(path.join(projectRoot, 'src-tauri/tauri.conf.json'), 'utf8'));
  assert(/font-src\s+[^;]*'self'/.test(config.app?.security?.csp ?? ''), 'desktop CSP does not allow self-hosted fonts');
} catch (error) {
  errors.push(`bundled CJK font cannot be verified: ${error.message}`);
}

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

const spriteUrls = new Set();
for (const item of uniquePortraitItems) {
  const sprite = manifest.spritesByCharacter?.[item.charId];
  const shortId = item.charId.split('/').at(-1);
  assert(sprite && typeof sprite.src === 'string', `missing full-body sprite mapping for ${item.charId}`);
  assert(JSON.stringify(manifest.spritesByCharacter?.[shortId]) === JSON.stringify(sprite), `short sprite alias does not match for ${item.charId}`);
  if (!sprite || typeof sprite.src !== 'string') continue;
  assert(sprite.src.startsWith('/mods/gpt-image-2-pack/sprites/') && sprite.src.endsWith('.png'), `sprite is not production full-body PNG: ${item.charId}`);
  assert(!sprite.src.includes('ensemble-source'), `sprite uses uncropped atlas: ${item.charId}`);
  assert(Number.isFinite(sprite.height) && sprite.height >= 40 && sprite.height <= 240, `invalid sprite display height: ${item.charId}`);
  assert(sprite.groundAnchor >= .9 && sprite.groundAnchor <= 1, `invalid sprite foot anchor: ${item.charId}`);
  assert(['left', 'right'].includes(sprite.facing), `invalid sprite facing: ${item.charId}`);
  spriteUrls.add(sprite.src);
}
assert(Object.keys(manifest.spritesByCharacter ?? {}).filter(id => id.startsWith('it:entity/')).length === 55, 'expected exactly 55 canonical full-body sprite mappings');
for (const url of spriteUrls) {
  try {
    const image = decodeRgbaPng(await fs.readFile(path.join(packRoot, url.replace(/^\/mods\/gpt-image-2-pack\//, ''))));
    assert(image.width >= 80 && image.height >= 80 && image.width <= 1600 && image.height <= 1600, `invalid sprite PNG dimensions ${image.width}×${image.height}: ${url}`);
    let transparent = 0, visible = 0;
    for (let offset = 3; offset < image.pixels.length; offset += 4) {
      if (image.pixels[offset] === 0) transparent++;
      if (image.pixels[offset] >= 128) visible++;
    }
    assert(transparent > image.width * image.height * .1, `sprite lacks a genuinely transparent background: ${url}`);
    assert(visible > image.width * image.height * .1, `sprite lacks substantial visible character pixels: ${url}`);
    const bounds = alphaBounds(image, 16);
    assert(bounds && bounds.left > 0 && bounds.top > 0 && bounds.right < image.width - 1 && bounds.bottom < image.height - 1, `sprite silhouette touches crop edge: ${url}`);
  } catch (error) { errors.push(`sprite cannot be verified: ${url} (${error.message})`); }
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
  process.stdout.write(`Production assets verified: bundled variable Noto Sans SC with OFL license, ${levelIds.length} backgrounds, ${uniquePortraitItems.length} portraits, 55 mapped characters / ${spriteUrls.size} transparent full-body sprites, ${fileRecords.length} unique legacy PNG files.\n`);
}
