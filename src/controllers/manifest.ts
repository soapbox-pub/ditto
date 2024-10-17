import { AppController } from '@/app.ts';
import { Storages } from '@/storages.ts';
import { WebManifestCombined } from '@/types/webmanifest.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

export const manifestController: AppController = async (c) => {
  const meta = await getInstanceMetadata(await Storages.db(), c.req.raw.signal);

  const manifest: WebManifestCombined = {
    description: meta.about,
    display: 'standalone',
    icons: [{
      src: meta.picture,
      sizes: '192x192',
    }, {
      src: meta.picture,
      sizes: '512x512',
    }],
    name: meta.name,
    scope: '/',
    short_name: meta.name,
    start_url: '/',
  };

  return c.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
};
