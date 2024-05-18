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

    return {
      id: data.url,
      sha256: data.sha256,
      url: data.url,
      blurhash: data.blurhash,
      width: data.dimensions?.width,
      height: data.dimensions?.height,
    };
  },
  // deno-lint-ignore require-await
  async delete(): Promise<void> {
    return;
  },
};
