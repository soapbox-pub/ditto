import { useMutation } from "@tanstack/react-query";
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { N64 } from '@nostrify/nostrify/utils';

import type { NostrSigner } from '@nostrify/nostrify';

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { getEffectiveBlossomServers } from "@/lib/appBlossom";

export function useUploadFile() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) {
        throw new Error('Must be logged in to upload files');
      }

      const servers = getEffectiveBlossomServers(
        config.blossomServerMetadata,
        config.useAppBlossomServers,
      );

      const uploader = new BlossomUploader({
        servers,
        signer: user.signer,
      });

      const tags = await uploader.upload(file);

      // If the returned URL is missing a file extension, append one from the
      // source file name. Blossom URLs are content-addressed (`/<sha256>`) and
      // may omit the extension. Adding it helps clients infer the media type.
      const ext = getFileExtension(file.name);
      if (ext) {
        tags[0][1] = appendExtensionIfMissing(tags[0][1], ext);
      }

      const url = tags[0][1];

      // Mirror to all other servers in the background (fire-and-forget).
      // BlossomUploader uses Promise.any(), so only one server has the blob.
      // We mirror to the rest for redundancy (BUD-04).
      const uploadedServer = servers.find((s) => url.startsWith(s));
      const mirrorServers = servers.filter((s) => s !== uploadedServer);

      if (mirrorServers.length > 0) {
        mirrorToServers(url, mirrorServers, user.signer).catch(() => {
          // Mirroring is best-effort — don't fail the upload if it fails.
        });
      }

      return tags;
    },
  });
}

/** Extract the file extension (with leading dot) from a filename, or empty string if none. */
function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return filename.slice(dotIndex).toLowerCase();
}

/** Append a file extension to a URL if its path doesn't already have one. */
function appendExtensionIfMissing(urlString: string, ext: string): string {
  const url = new URL(urlString);
  const lastSegment = url.pathname.split('/').pop() ?? '';
  // Check if the last path segment already contains a dot (has an extension)
  if (lastSegment.includes('.')) return urlString;
  url.pathname = url.pathname + ext;
  return url.toString();
}

/** Mirror a blob to additional Blossom servers (BUD-04). */
async function mirrorToServers(
  sourceUrl: string,
  servers: string[],
  signer: NostrSigner,
): Promise<void> {
  const now = Date.now();

  const event = await signer.signEvent({
    kind: 24242,
    content: 'Mirror blob',
    created_at: Math.floor(now / 1000),
    tags: [
      ['t', 'mirror'],
      ['expiration', Math.floor((now + 60_000) / 1000).toString()],
    ],
  });

  const authorization = `Nostr ${N64.encodeEvent(event)}`;

  await Promise.allSettled(
    servers.map((server) =>
      fetch(new URL('/mirror', server), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorization,
        },
        body: JSON.stringify({ url: sourceUrl }),
      }),
    ),
  );
}
