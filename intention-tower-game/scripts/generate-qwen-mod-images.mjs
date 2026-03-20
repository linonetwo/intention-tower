import fs from 'node:fs/promises';
import path from 'node:path';

const API_URL = 'https://api.siliconflow.cn/v1/images/generations';
const MODEL = 'Qwen/Qwen-Image';
const PACK_DIR = ['public', 'mods', 'qwen-image-pack'];

function argFlag(name) {
  return process.argv.includes(name);
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return null;
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}\n${text}`);
  return JSON.parse(text);
}

function pickImageUrl(payload) {
  const candidates = [];
  if (Array.isArray(payload?.data)) {
    for (const item of payload.data) {
      if (typeof item?.url === 'string') candidates.push(item.url);
      if (typeof item?.image_url === 'string') candidates.push(item.image_url);
      if (typeof item?.b64_json === 'string') candidates.push(`data:image/png;base64,${item.b64_json}`);
    }
  }
  if (typeof payload?.url === 'string') candidates.push(payload.url);
  if (typeof payload?.image_url === 'string') candidates.push(payload.image_url);
  return candidates[0] ?? null;
}

function safeName(input) {
  return input.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function tr(key, zh, en) {
  return zh[key] ?? en[key] ?? key;
}

async function buildManifest(root) {
  const levelsDir = path.join(root, 'assets', 'levels');
  const zh = await readJson(path.join(root, 'assets', 'i18n', 'zh-cn.json'));
  const en = await readJson(path.join(root, 'assets', 'i18n', 'en.json'));

  const levelDirs = (await fs.readdir(levelsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));

  const items = [];
  const backgrounds = {};
  const portraitsByCharacter = {};

  for (const levelId of levelDirs) {
    const levelPath = path.join(levelsDir, levelId, 'level.jsonld');
    let level;
    try {
      level = await readJson(levelPath);
    } catch {
      continue;
    }

    const levelName = tr(level.label, zh, en);
    const levelDesc = tr(level.comment, zh, en);
    const bgOutput = `backgrounds/${levelId}.png`;
    backgrounds[levelId] = `/mods/qwen-image-pack/${bgOutput}`;

    items.push({
      id: `bg-${levelId}`,
      type: 'background',
      levelId,
      prompt: `anime style game scene background, no characters, cinematic wide composition, environment only. Level: ${levelName}. Theme: ${levelDesc}. detailed lighting, strong atmosphere, no text, no watermark`,
      output: bgOutput,
    });

    const chars = Array.isArray(level.characters) ? level.characters : [];
    for (const char of chars) {
      const charId = String(char['@id'] ?? 'unknown-char');
      const charLabel = tr(char.label, zh, en);
      const fileBase = safeName(charId || `${levelId}-${charLabel}`);
      const output = `portraits/${fileBase}.png`;
      const url = `/mods/qwen-image-pack/${output}`;
      const shortId = charId.includes('/') ? charId.split('/').pop() : charId;
      if (portraitsByCharacter[charId] || (shortId && portraitsByCharacter[shortId])) continue;

      portraitsByCharacter[charId] = url;
      if (shortId && shortId !== charId) {
        portraitsByCharacter[shortId] = url;
      }
      items.push({
        id: `portrait-${fileBase}`,
        type: 'portrait',
        charId,
        levelId,
        prompt: `anime style visual novel character portrait, upper-body, centered composition. Character: ${charLabel}. Level context: ${levelName}. Mood: ${levelDesc}. highly detailed costume, expressive face, no text, no watermark, transparent/simple background`,
        output,
      });
    }
  }

  const portraitValues = Object.values(portraitsByCharacter);
  const manifest = {
    id: 'qwen-image-pack',
    name: 'Qwen Full Image Pack',
    provider: 'Qwen/Qwen-Image via SiliconFlow',
    version: Date.now(),
    portraits: {
      left: portraitValues[0] ?? '/mods/qwen-image-pack/portraits/actor-left.png',
      right: portraitValues[1] ?? portraitValues[0] ?? '/mods/qwen-image-pack/portraits/target-right.png',
    },
    portraitsByCharacter,
    backgrounds,
    items,
  };

  return manifest;
}

async function saveImageFromUrl(url, outPath) {
  if (url.startsWith('data:image/')) {
    const base64 = url.split(',')[1] ?? '';
    await ensureDir(outPath);
    await fs.writeFile(outPath, Buffer.from(base64, 'base64'));
    return;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} ${res.statusText} from ${url}`);
  await ensureDir(outPath);
  await fs.writeFile(outPath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const root = process.cwd();
  const packRoot = path.join(root, ...PACK_DIR);
  const manifestPath = path.join(packRoot, 'manifest.json');

  const manifest = await buildManifest(root);
  await fs.mkdir(packRoot, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[Qwen] manifest written: ${path.relative(root, manifestPath)} (items: ${manifest.items.length})`);

  if (argFlag('--manifest-only')) {
    console.log('[Qwen] manifest-only mode done');
    return;
  }

  const key = process.env.SILICONFLOW_API_KEY;
  if (!key) throw new Error('Missing SILICONFLOW_API_KEY environment variable');

  const typeFilter = argValue('--type'); // background | portrait

  let generated = 0;
  let skipped = 0;
  const failed = [];

  for (const item of manifest.items) {
    if (typeFilter && item.type !== typeFilter) continue;

    const outputPath = path.join(packRoot, item.output);
    try {
      await fs.access(outputPath);
      skipped += 1;
      console.log(`[Qwen] skip existing ${item.id}`);
      continue;
    } catch {
      // continue generate
    }

    const makeBody = (prompt) => ({
      model: MODEL,
      prompt,
      image_size: item.type === 'background' ? '1536x1024' : '1024x1024',
      batch_size: 1,
      num_inference_steps: 20,
      guidance_scale: 7.5,
    });

    const callGenerate = async (prompt) => {
      return await fetchJson(API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(makeBody(prompt)),
      });
    };

    console.log(`[Qwen] generating ${item.id}...`);
    try {
      let response;
      try {
        response = await callGenerate(item.prompt);
      } catch (err) {
        const msg = String(err?.message ?? err);
        if (msg.includes('451')) {
          const fallbackPrompt = item.type === 'background'
            ? 'anime style game background, landscape environment, no people, no text, no logo, no watermark, neutral fantasy tone'
            : 'anime style character portrait, upper body, neutral expression, no text, no logo, no watermark, simple background';
          console.log(`[Qwen] moderation fallback for ${item.id}`);
          response = await callGenerate(fallbackPrompt);
        } else {
          throw err;
        }
      }

      const url = pickImageUrl(response);
      if (!url) throw new Error(`No image URL in response for ${item.id}`);
      await saveImageFromUrl(url, outputPath);
      generated += 1;
      console.log(`[Qwen] saved ${item.id} -> ${path.relative(root, outputPath)}`);
    } catch (err) {
      failed.push({ id: item.id, output: item.output, message: String(err?.message ?? err) });
      console.log(`[Qwen] failed ${item.id}: ${String(err?.message ?? err)}`);
    }
  }

  console.log(`[Qwen] done: generated=${generated}, skipped=${skipped}, failed=${failed.length}`);
  if (failed.length > 0) {
    const failedPath = path.join(packRoot, 'failed-items.json');
    await fs.writeFile(failedPath, JSON.stringify(failed, null, 2), 'utf8');
    console.log(`[Qwen] failed items written: ${path.relative(root, failedPath)}`);
  }
}

main().catch((err) => {
  console.error('[Qwen] failed:', err?.message ?? err);
  process.exit(1);
});
