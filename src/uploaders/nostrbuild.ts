import { Conf } from '@/config.ts';
import { nostrbuildSchema } from '@/schemas/nostrbuild.ts';

import type { Uploader } from './types.ts';

/** nostr.build uploader. */
export const nostrbuildUploader: Uploader = {
  async upload(file) {
    const formData = new FormData();
    formData.append('fileToUpload', file);

    const response = await fetch(Conf.nostrbuildEndpoint, {
      method: 'POST',
      body: formData,
    });

    const json = await response.json();
    const [data] = nostrbuildSchema.parse(json).data;

    const tags: [['url', string], ...string[][]] = [
      ['url', data.url],
      ['m', data.mime],
      ['x', data.sha256],
      ['ox', data.original_sha256],
      ['size', file.size.toString()],
      ['blurhash', data.blurhash],
    ];

    if (data.dimensions) {
      tags.push(['dim', `${data.dimensions.width}x${data.dimensions.height}`]);
    }

    return tags;
  },
};
