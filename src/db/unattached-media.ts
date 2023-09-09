import { db } from '@/db.ts';
import { uuid62 } from '@/deps.ts';

interface UnattachedMedia {
  id: string;
  pukey: string;
  cid: string;
  data: {
    name?: string;
    mime?: string;
    width?: number;
    height?: number;
    size?: number;
    description?: string;
  };
  uploaded_at: Date;
}

function insertUnattachedMedia(media: Omit<UnattachedMedia, 'id' | 'uploaded_at'>) {
  return db.insertInto('unattached_media')
    .values({
      id: uuid62.v4(),
      uploaded_at: new Date(),
      ...media,
      data: JSON.stringify(media.data),
    })
    .execute();
}

export { insertUnattachedMedia };
