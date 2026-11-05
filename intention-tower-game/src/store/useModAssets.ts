import { createStore, useStore } from 'zustand';

export interface ImageAssetManifestItem {
  id: string;
  type?: 'background' | 'portrait' | 'sprite';
  levelId?: string;
  charId?: string;
  prompt: string;
  sourcePrompt?: string;
  output: string;
  generator?: string;
  model?: string;
}

export interface ImageAssetManifest {
  id: string;
  name?: string;
  version?: string | number;
  provider?: string;
  model?: string;
  generatedAt?: string;
  artDirection?: string;
  portraits?: {
    left?: string;
    right?: string;
  };
  portraitsByCharacter?: Record<string, string>;
  /** Transparent full-body art; old portraits are never substituted. */
  spritesByCharacter?: Record<string, CharacterSpriteAsset>;
  paperDoll?: {
    version: 1;
    heads: Record<string, string>;
    outfits: Record<string, PaperDollParts>;
    characters: Record<string, { headId: string; outfitId: string }>;
  };
  backgrounds?: Record<string, string>;
  backgroundsMetadata?: Record<string, { width: number; height: number; floorY: number }>;
  items?: ImageAssetManifestItem[];
}

export interface CharacterSpriteAsset {
  src: string;
  height?: number;
  facing?: 'left' | 'right';
  groundAnchor?: number;
  walkFrames?: string[];
  sittingSrc?: string;
  chairSrc?: string;
  paperDoll?: ResolvedPaperDoll;
}

export interface PaperDollParts {
  torso: string; upperArm: string; forearm: string; thigh: string; shin: string;
}
export interface ResolvedPaperDoll {
  rig: 'humanoid-v1'; headId: string; headSrc: string; outfitId: string;
  parts: PaperDollParts; availableOutfits: string[];
}
export function canCharacterSit(asset?: CharacterSpriteAsset): boolean {
  return Boolean(asset?.paperDoll || asset?.sittingSrc);
}
export function resolveCharacterSprite(manifest: ImageAssetManifest | null, id: string, outfitId?: string): CharacterSpriteAsset | undefined {
  const flat = manifest?.spritesByCharacter?.[id]
    ?? manifest?.spritesByCharacter?.[id.replace(/^it:entity\//, '')];
  const atlas = manifest?.paperDoll;
  const character = atlas?.characters[id] ?? atlas?.characters[id.replace(/^it:entity\//, '')];
  if (!atlas || !character) return flat;
  const chosen = outfitId && atlas.outfits[outfitId] ? outfitId : character.outfitId;
  return { ...flat, src: flat?.src ?? atlas.heads[character.headId] ?? '', height: flat?.height ?? 150,
    paperDoll: { rig: 'humanoid-v1', headId: character.headId, headSrc: atlas.heads[character.headId],
      outfitId: chosen, parts: atlas.outfits[chosen], availableOutfits: Object.keys(atlas.outfits) } };
}

interface ModAssetsState {
  manifest: ImageAssetManifest | null;
  revision: number;
  loading: boolean;
  error: string | null;
  selectedOutfits: Record<string, string>;
  setCharacterOutfit: (charId: string, outfitId: string) => void;
  init: () => Promise<void>;
  reload: () => Promise<void>;
}

export const PRODUCTION_ASSET_MANIFEST_URL = '/mods/gpt-image-2-pack/manifest.json';

async function loadManifest(revision: number): Promise<ImageAssetManifest> {
  const url = `${PRODUCTION_ASSET_MANIFEST_URL}?rev=${revision}&t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`load manifest failed: ${res.status} ${res.statusText}`);
  }
  return await res.json() as ImageAssetManifest;
}

export const modAssetsStore = createStore<ModAssetsState>()((set, get) => ({
  manifest: null,
  revision: 0,
  loading: false,
  error: null,
  selectedOutfits: {},
  setCharacterOutfit: (charId, outfitId) => {
    const manifest = get().manifest;
    if (!manifest?.paperDoll?.outfits[outfitId]) return;
    const selectedOutfits = { ...get().selectedOutfits, [charId]: outfitId };
    set({ selectedOutfits });
    try { localStorage.setItem('it-paper-doll-outfits', JSON.stringify({ manifest: `${manifest.id}:${manifest.version}:${manifest.paperDoll.version}`, selectedOutfits })); } catch { /* Storage may be disabled. */ }
  },

  init: async () => {
    if (get().manifest || get().loading) return;
    await get().reload();
  },

  reload: async () => {
    const nextRev = get().revision + 1;
    set({ loading: true, error: null, revision: nextRev });
    try {
      const manifest = await loadManifest(nextRev);
      let selectedOutfits: Record<string, string> = {};
      try {
        const saved = JSON.parse(localStorage.getItem('it-paper-doll-outfits') ?? 'null');
        if (saved?.manifest === `${manifest.id}:${manifest.version}:${manifest.paperDoll?.version}`) {
          selectedOutfits = Object.fromEntries(Object.entries(saved.selectedOutfits ?? {}).filter(([, value]) => typeof value === 'string' && manifest.paperDoll?.outfits[value])) as Record<string, string>;
        }
      } catch { /* Invalid/disabled local storage must not break art loading. */ }
      set({ manifest, selectedOutfits, loading: false, error: null });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },
}));

if (typeof window !== 'undefined') {
  (window as Window & { __itReloadMods?: () => Promise<void> }).__itReloadMods = async () => {
    await modAssetsStore.getState().reload();
  };
}

export function useModAssets<T>(selector: (state: ModAssetsState) => T): T {
  return useStore(modAssetsStore, selector);
}
