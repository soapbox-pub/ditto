import { LRUCache } from 'lru-cache';

import { Time } from '@/utils/time.ts';

export interface DittoUpload {
  id: string;
  pubkey: string;
  url: string;
  tags: string[][];
  uploadedAt: Date;
}

export const dittoUploads = new LRUCache<string, DittoUpload>({
  max: 1000,
  ttl: Time.hours(6),
});
