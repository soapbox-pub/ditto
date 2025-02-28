import { AppController } from '@/app.ts';
import { WebManifestCombined } from '@/types/webmanifest.ts';
import { getInstanceMetadata } from '@/utils/instance.ts';

export const manifestController: AppController = async (c) => {
  const meta = await getInstanceMetadata(c.var);

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
    screenshots: meta.screenshots,
  };

  return c.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
};
