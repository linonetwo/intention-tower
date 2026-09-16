import { beforeEach, describe, expect, it, vi } from 'vitest';
import { modAssetsStore, PRODUCTION_ASSET_MANIFEST_URL } from './useModAssets';

describe('production mod assets', () => {
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
