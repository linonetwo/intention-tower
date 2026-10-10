#!/usr/bin/env node
/**
 * Builds the production image manifest from the level-derived legacy manifest.
 * The generated manifest is deterministic and points exclusively at assets
 * produced by the installed proxy-imagegen / GPT Image 2 workflow.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(projectRoot, 'public/mods/qwen-image-pack/manifest.json');
const packRoot = path.join(projectRoot, 'public/mods/gpt-image-2-pack');
const outputPath = path.join(packRoot, 'manifest.json');
const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));

const toProductionUrl = (value) => value?.replace('/mods/qwen-image-pack/', '/mods/gpt-image-2-pack/');
const portraitsByCharacter = Object.fromEntries(
  Object.entries(source.portraitsByCharacter ?? {}).map(([id, value]) => [id, toProductionUrl(value)]),
);
const backgrounds = Object.fromEntries(
  Object.entries(source.backgrounds ?? {}).map(([id, value]) => [id, toProductionUrl(value)]),
);
const productionPrompt = (item) => {
  if (item.type === 'portrait') {
    const character = item.prompt.match(/Character: (.*?)\. Level context:/)?.[1] ?? item.charId;
    const levelContext = item.prompt.match(/Level context: (.*?)\. Mood:/)?.[1] ?? item.levelId;
    const narrative = item.prompt.match(/Mood: (.*?)\. highly detailed/)?.[1] ?? levelContext;
    return [
      'Production character portrait for the psychological strategy simulation game Intention Tower.',
      `Exactly one character: ${character}.`,
      `Story context: ${levelContext}. Narrative role and mood: ${narrative}.`,
      'Chest-up three-quarter portrait, centered with the full head and shoulders visible, clear distinctive silhouette and emotionally intelligent expression.',
      'Cinematic painterly realism with charcoal-ink texture, grounded anatomy, restrained cyan and amber rim light, subtle cognitive-network filaments in a simple dark atmospheric background.',
      'Square 1:1 composition designed for a game dialogue portrait. No UI frame, no text, no letters, no numbers, no logo, no watermark, no duplicate character, no crowd.',
    ].join(' ');
  }
  const level = item.prompt.match(/Level: (.*?)\. Theme:/)?.[1] ?? item.levelId;
  const theme = item.prompt.match(/Theme: (.*?)\. detailed lighting/)?.[1] ?? level;
  return [
    'Production environment background for the psychological strategy simulation game Intention Tower.',
    `Level: ${level}. Narrative theme: ${theme}.`,
    'Cinematic painterly realism with charcoal-ink texture, restrained cyan and amber cognitive-network lighting, layered depth and environmental storytelling.',
    'Wide 16:9 composition with a calm readable center for gameplay, darker edges for UI contrast, environment only.',
    'No characters, no people, no animals, no text, no letters, no numbers, no logo, no watermark, no UI.',
  ].join(' ');
};
const items = (source.items ?? []).map((item) => ({
  ...item,
  sourcePrompt: item.prompt,
  prompt: productionPrompt(item),
  generator: 'proxy-imagegen',
  model: 'gpt-image-2',
}));

const portraitValues = [...new Set(Object.values(portraitsByCharacter))];
const manifest = {
  id: 'gpt-image-2-pack',
  name: 'Intention Tower Production Art Pack',
  provider: 'OpenAI GPT Image 2 via Codex Responses proxy',
  model: 'gpt-image-2',
  version: 1,
  generatedAt: '2026-09-16',
  artDirection: 'cinematic painterly realism, charcoal texture, restrained cyan and amber cognitive-network lighting',
  portraits: {
    left: portraitValues[0],
    right: portraitValues[1] ?? portraitValues[0],
  },
  portraitsByCharacter,
  backgrounds,
  items,
};

await fs.mkdir(packRoot, { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`[GPT Image 2] manifest written: ${path.relative(projectRoot, outputPath)} (${Object.keys(backgrounds).length} backgrounds, ${new Set(items.filter((item) => item.type === 'portrait').map((item) => item.charId)).size} portraits)\n`);
