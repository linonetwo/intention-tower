import { createStore, useStore } from 'zustand';

export interface ImageAssetManifestItem {
  id: string;
  type?: 'background' | 'portrait';
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
  backgrounds?: Record<string, string>;
  items?: ImageAssetManifestItem[];
}

interface ModAssetsState {
  manifest: ImageAssetManifest | null;
  revision: number;
  loading: boolean;
  error: string | null;
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

  init: async () => {
    if (get().manifest || get().loading) return;
    await get().reload();
  },

  reload: async () => {
    const nextRev = get().revision + 1;
    set({ loading: true, error: null, revision: nextRev });
    try {
      const manifest = await loadManifest(nextRev);
      set({ manifest, loading: false, error: null });
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
