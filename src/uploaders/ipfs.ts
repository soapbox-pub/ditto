import { z } from '@/deps.ts';

import type { Uploader } from './types.ts';

const ipfsAddResultSchema = z.object({
  Name: z.string(),
  Hash: z.string(),
  Size: z.string(),
});

const ipfsUploader: Uploader = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('http://localhost:5001/api/v0/add', {
    method: 'POST',
    body: formData,
  });

  const { Hash } = ipfsAddResultSchema.parse(await response.json());

  return {
    cid: Hash,
  };
};

export { ipfsUploader };
