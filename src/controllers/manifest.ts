import { AppController } from '@/app.ts';
import { Storages } from '@/storages.ts';
import { WebManifestCombined } from '@/types/webmanifest.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

export const manifestController: AppController = async (c) => {
  const meta = await getInstanceMetadata(await Storages.db(), c.req.raw.signal);

  const manifest: WebManifestCombined = {
    name: meta.name,
    short_name: meta.name,
    start_url: '/',
    display: 'standalone',
    scope: '/',
    description: meta.about,
  };

  return c.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
};
