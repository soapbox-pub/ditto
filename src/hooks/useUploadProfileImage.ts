import { useCallback } from 'react';

import { useUploadFile } from '@/hooks/useUploadFile';
import { readFileMeta } from '@/lib/fileMetadata';
import { imetaTagFromUpload } from '@/lib/profileImeta';

/**
 * Upload a profile picture or banner and describe it for the kind 0's `imeta`
 * tags (see `profileImetaTags`): what the Blossom server reported, plus the
 * `dim` and `blurhash` probed from the file while it uploads.
 */
export function useUploadProfileImage() {
  const { mutateAsync: uploadFile, isPending } = useUploadFile();

  const upload = useCallback(async (file: File): Promise<{ url: string; imeta: string[] }> => {
    const [tags, meta] = await Promise.all([uploadFile(file), readFileMeta(file, file.type)]);

    // Anything the server already said about the blob wins.
    for (const [name, value] of meta.fields) {
      if (!tags.some(([n]) => n === name)) tags.push([name, value]);
    }

    return { url: tags[0][1], imeta: imetaTagFromUpload(tags) };
  }, [uploadFile]);

  return { upload, isPending };
}
