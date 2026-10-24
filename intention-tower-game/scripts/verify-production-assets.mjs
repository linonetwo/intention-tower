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
  const geometry = manifest.backgroundsMetadata?.[levelId];
  assert(typeof url === 'string', `missing background mapping for ${levelId}`);
  if (geometry) assert(Number.isFinite(geometry.floorY) && geometry.floorY > 0 && geometry.floorY < geometry.height, `invalid room floor anchor: ${levelId}`);
  if (typeof url === 'string') await verifyPng(url, geometry?.width ?? 1672, geometry?.height ?? 941, `background ${levelId}`);
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
  assert(/^\/mods\/gpt-image-2-pack\/(sprites|sideview)(\/[\w-]+)+\.png$/.test(sprite.src), `sprite is not production full-body PNG: ${item.charId}`);
  assert(!sprite.src.includes('ensemble-source'), `sprite uses uncropped atlas: ${item.charId}`);
  assert(Number.isFinite(sprite.height) && sprite.height >= 40 && sprite.height <= 240, `invalid sprite display height: ${item.charId}`);
  assert(sprite.groundAnchor >= .9 && sprite.groundAnchor <= 1, `invalid sprite foot anchor: ${item.charId}`);
  assert(['left', 'right'].includes(sprite.facing), `invalid sprite facing: ${item.charId}`);
  spriteUrls.add(sprite.src);
  if (sprite.walkFrames || sprite.sittingSrc) {
    assert(Array.isArray(sprite.walkFrames) && sprite.walkFrames.length === 4, `animated sprite needs four walk frames: ${item.charId}`);
    assert(typeof sprite.sittingSrc === 'string', `animated sprite needs a sitting frame: ${item.charId}`);
    for (const frame of [...(sprite.walkFrames ?? []), sprite.sittingSrc].filter(Boolean)) {
      assert(/^\/mods\/gpt-image-2-pack\/sideview(\/[\w-]+)+\.png$/.test(frame), `invalid animation frame URL: ${frame}`);
      spriteUrls.add(frame);
    }
  }
}
assert(Object.keys(manifest.spritesByCharacter ?? {}).filter(id => id.startsWith('it:entity/')).length === 55, 'expected exactly 55 canonical full-body sprite mappings');
// Additional level actors reuse an explicit existing formal sprite, never
// inflate the canonical asset count or bypass the full-body contract.
const canonicalSpriteIds = new Set(uniquePortraitItems.map(item => item.charId));
for (const [alias, source] of Object.entries(manifest.spriteAliases ?? {})) {
  const canonicalSource = source.startsWith('it:entity/') ? source : `it:entity/${source}`;
  assert(canonicalSpriteIds.has(canonicalSource), `sprite alias references an unknown canonical character: ${alias} -> ${source}`);
  assert(!alias.startsWith('it:entity/'), `sprite reuse alias must not inflate canonical mappings: ${alias}`);
  const sourceSprite = manifest.spritesByCharacter?.[canonicalSource];
  const aliasSprite = manifest.spritesByCharacter?.[alias];
  assert(sourceSprite && JSON.stringify(aliasSprite) === JSON.stringify(sourceSprite), `sprite alias does not match its known full-body source: ${alias}`);
  assert(sourceSprite?.src && spriteUrls.has(sourceSprite.src), `sprite alias source is not a validated production sprite: ${alias}`);
}
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

// Articulated humans must resolve to independently generated transparent parts,
// never a whole-body idle PNG masquerading as one of the skeleton textures.
try {
  const doll = manifest.paperDoll;
  assert(doll?.version === 1, 'missing version-one articulated paper-doll pack');
  const provenance = JSON.parse(await fs.readFile(path.join(packRoot, 'paper-doll/provenance.json'), 'utf8'));
  assert(provenance.model === 'gpt-image-2' && provenance.generator === 'proxy-imagegen', 'paper-doll source has incorrect generator provenance');
  const source = await fs.readFile(path.join(packRoot, 'paper-doll/source-v1.png'));
  assert(createHash('sha256').update(source).digest('hex') === provenance.source.sha256, 'paper-doll source hash differs from reviewed generation');
  assert(provenance.parts?.length === 20, 'paper-doll atlas must derive exactly twenty distinct source parts');
  const expectedSizes = { head: [56, 56], torso: [60, 72], upperArm: [18, 39], forearm: [18, 39], thigh: [22, 46], shin: [22, 50] };
  const partUrls = new Map();
  for (const [id, url] of Object.entries(doll?.heads ?? {})) partUrls.set(url, 'head');
  for (const outfit of Object.values(doll?.outfits ?? {})) for (const part of ['torso', 'upperArm', 'forearm', 'thigh', 'shin']) {
    assert(typeof outfit[part] === 'string', `paper-doll outfit lacks ${part}`);
    if (typeof outfit[part] === 'string') partUrls.set(outfit[part], part);
  }
  assert(partUrls.size === 20, `expected 20 independent articulated PNG parts, found ${partUrls.size}`);
  const partHashes = new Set();
  for (const [url, type] of partUrls) {
    assert(/^\/mods\/gpt-image-2-pack\/paper-doll\/[\w-]+\.png$/.test(url), `paper-doll part is not a dedicated production part: ${url}`);
    const bytes = await fs.readFile(path.join(packRoot, url.replace(/^\/mods\/gpt-image-2-pack\//, '')));
    const image = decodeRgbaPng(bytes), [width, height] = expectedSizes[type];
    assert(image.width === width && image.height === height, `paper-doll ${type} geometry differs from skeleton: ${url}`);
    let clear = 0, solid = 0, partial = 0;
    for (let i = 3; i < image.pixels.length; i += 4) {
      clear += image.pixels[i] === 0;
      solid += image.pixels[i] >= 128;
      partial += image.pixels[i] > 0 && image.pixels[i] < 255;
    }
    assert(clear >= width * 2 + height * 2 - 4 && solid > width * height * .15 && partial > 0, `paper-doll part lacks a substantial antialiased transparent silhouette: ${url}`);
    const bounds = alphaBounds(image, 16);
    assert(bounds && bounds.left > 0 && bounds.top > 0 && bounds.right < width - 1 && bounds.bottom < height - 1, `paper-doll part is not transparently padded: ${url}`);
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert(!partHashes.has(hash), `paper-doll part duplicates another full texture: ${url}`); partHashes.add(hash);
    const record = provenance.parts.find(part => url.endsWith(`/${part.id}.png`));
    assert(record?.sha256 === hash && record?.type === type, `paper-doll part differs from deterministic source derivation: ${url}`);
  }
  for (const [id, sprite] of Object.entries(manifest.spritesByCharacter ?? {})) {
    const nonhuman = /animals\/|\/(hive|dog|gosling|cat)(?:-idle)?\.png$/.test(sprite.src);
    const character = doll?.characters?.[id];
    if (nonhuman) { assert(!character, `animal/nonhuman must not use a human paper-doll skeleton: ${id}`); continue; }
    assert(character?.height === 150 && sprite.height === 150, `human does not use canonical 150-unit geometry: ${id}`);
    assert(typeof doll?.heads?.[character?.headId] === 'string', `human has no valid articulated head: ${id}`);
    assert(!!doll?.outfits?.[character?.outfitId], `human has no valid articulated outfit: ${id}`);
  }
  assert(doll?.characters?.outsider?.headId === 'student-girl' && doll?.characters?.outsider?.outfitId === 'teal', 'outsider must retain the female teal articulated identity');
  for (const room of ['pavlov_lab', 'pavlov_pantry']) assert(typeof manifest.backgrounds?.[room] === 'string' && Number.isFinite(manifest.backgroundsMetadata?.[room]?.floorY), `Pavlov room lacks an explicit production background and floor: ${room}`);
  const pantryRecord = JSON.parse(await fs.readFile(path.join(packRoot, 'sideview/pavlov-pantry-provenance.json'), 'utf8'));
  const pantryBytes = await fs.readFile(path.join(packRoot, 'sideview', pantryRecord.file));
  assert(pantryBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'pantry source is not PNG');
  const pantryImage = { width: pantryBytes.readUInt32BE(16), height: pantryBytes.readUInt32BE(20) };
  assert(pantryRecord.model === 'gpt-image-2' && pantryRecord.generator === 'proxy-imagegen', 'pantry art provenance differs from requested generator');
  assert(createHash('sha256').update(pantryBytes).digest('hex') === pantryRecord.sha256, 'pantry source hash differs');
  assert(manifest.backgrounds.pavlov_pantry === `/mods/gpt-image-2-pack/sideview/${pantryRecord.file}`, 'pantry still uses temporary room art');
  assert(pantryImage.width === pantryRecord.width && pantryImage.height === pantryRecord.height && manifest.backgroundsMetadata.pavlov_pantry.floorY === pantryRecord.floorY, 'pantry floor and source dimensions disagree');
} catch (error) { errors.push(`paper-doll production assets cannot be verified: ${error.message}`); }

const hashes = new Map();
for (const record of fileRecords) {
  const duplicate = hashes.get(record.hash);
  assert(!duplicate || duplicate === record.normalized, `duplicate image content: ${duplicate} and ${record.normalized}`);
  hashes.set(record.hash, record.normalized);
}

// Side-view room geometry and animation anchors are part of the rendered asset
// contract, not inferred from a successful image-generation response.
try {
  const sideview = JSON.parse(await fs.readFile(path.join(packRoot, 'sideview/manifest.json'), 'utf8'));
  assert(sideview.model === 'gpt-image-2' && sideview.generator === 'proxy-imagegen', 'side-view asset provenance does not identify the requested generator');
  for (const room of Object.values(sideview.backgrounds)) {
    for (const level of room.levels) {
      assert(manifest.backgrounds?.[level] === `${sideview.urlRoot}${room.file}`, `side-view room is not used by ${level}`);
      const meta = manifest.backgroundsMetadata?.[level];
      assert(meta?.width === room.size[0] && meta?.height === room.size[1] && meta?.floorY === room.groundY, `side-view room floor mapping differs for ${level}`);
    }
  }
  for (const [id, character] of Object.entries(sideview.characters)) {
    assert(character.frames.length === 6 && character.animations.walk.length === 4, `invalid six-pose animation: ${id}`);
    for (const frame of character.frames) {
      const image = decodeRgbaPng(await fs.readFile(path.join(packRoot, 'sideview', frame.file)));
      assert(image.width === character.cellSize[0] && image.height === character.cellSize[1], `animation cell dimensions differ: ${frame.file}`);
      const bounds = alphaBounds(image, 16);
      assert(bounds && Math.abs(bounds.bottom - frame.anchor[1]) <= 2, `animation feet do not align with ground anchor: ${frame.file}`);
      assert(spriteUrls.has(`${sideview.urlRoot}${frame.file}`), `generated animation is not connected to a playable character: ${frame.file}`);
    }
  }
} catch (error) {
  errors.push(`side-view production assets cannot be verified: ${error.message}`);
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
