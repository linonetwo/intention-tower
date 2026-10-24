import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canCharacterSit, modAssetsStore, PRODUCTION_ASSET_MANIFEST_URL, resolveCharacterSprite } from './useModAssets';

describe('production mod assets', () => {
  it('changes only outfit parts, retaining the exact shared head and flat metadata', () => {
    const parts = { torso: '/t', upperArm: '/u', forearm: '/f', thigh: '/h', shin: '/s' };
    const manifest = { id: 'atlas', paperDoll: { version: 1 as const, heads: { boy: '/boy' }, outfits: { student: parts, teal: { ...parts, torso: '/teal' } }, characters: { boy: { headId: 'boy', outfitId: 'student' } } } };
    const initial = resolveCharacterSprite(manifest, 'it:entity/boy');
    const changed = resolveCharacterSprite(manifest, 'it:entity/boy', 'teal');
    expect(changed?.paperDoll?.headSrc).toBe(initial?.paperDoll?.headSrc);
    expect(changed?.paperDoll?.parts.torso).toBe('/teal');
    expect(canCharacterSit(initial)).toBe(true);
    expect(canCharacterSit({ src: '/flat' })).toBe(false);
  });
  it('resolves full-body art by canonical and short IDs without using portraits', () => {
    const sprite = { src: '/dog.png', height: 90, groundAnchor: .96 };
    expect(resolveCharacterSprite({ id: 'test', spritesByCharacter: { dog: sprite } }, 'it:entity/dog')).toEqual(sprite);
    expect(resolveCharacterSprite({ id: 'test', spritesByCharacter: { 'it:entity/dog': sprite } }, 'it:entity/dog')).toEqual(sprite);
    expect(resolveCharacterSprite({ id: 'test', portraitsByCharacter: { dog: '/portrait.png' } }, 'dog')).toBeUndefined();
  });
  beforeEach(() => {
    modAssetsStore.setState({
      manifest: null,
      revision: 0,
      loading: false,
      error: null,
    });
  });

  it('loads the GPT Image 2 production manifest with cache busting', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'gpt-image-2-pack',
      model: 'gpt-image-2',
      backgrounds: { pavlov: '/mods/gpt-image-2-pack/backgrounds/pavlov.png' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await modAssetsStore.getState().reload();

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl.startsWith(`${PRODUCTION_ASSET_MANIFEST_URL}?`)).toBe(true);
    const query = new URLSearchParams(requestedUrl.split('?')[1]);
    expect(query.get('rev')).toBe('1');
    expect(query.get('t')).toMatch(/^\d+$/);
    expect(modAssetsStore.getState()).toMatchObject({
      loading: false,
      error: null,
      revision: 1,
      manifest: { id: 'gpt-image-2-pack', model: 'gpt-image-2' },
    });
  });
});
