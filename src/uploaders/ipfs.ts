import { Conf } from '@/config.ts';
import { z } from '@/deps.ts';

import type { Uploader } from './types.ts';

const ipfsAddResultSchema = z.object({
  Name: z.string(),
  Hash: z.string(),
  Size: z.string(),
});

const ipfsUploader: Uploader = async (file) => {
  const url = new URL('/api/v0/add', Conf.ipfs.apiUrl);

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  const { Hash } = ipfsAddResultSchema.parse(await response.json());

  return {
    cid: Hash,
  };
};

export { ipfsUploader };
