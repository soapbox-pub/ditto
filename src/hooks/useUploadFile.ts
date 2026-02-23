import { useMutation } from "@tanstack/react-query";
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { N64 } from '@nostrify/nostrify/utils';

import type { NostrSigner } from '@nostrify/nostrify';

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";

export function useUploadFile() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) {
        throw new Error('Must be logged in to upload files');
      }

      const uploader = new BlossomUploader({
        servers: config.blossomServers,
        signer: user.signer,
      });

      const tags = await uploader.upload(file);
      const url = tags[0][1];

      // Prefer the first configured server for the returned URL.
      // BlossomUploader uses Promise.any(), so any server may win the race.
      // Since all servers serve blobs at /<sha256>, the URL is interchangeable.
      const preferredServer = config.blossomServers[0];
      if (preferredServer && !url.startsWith(preferredServer)) {
        const pathname = new URL(url).pathname;
        tags[0][1] = new URL(pathname, preferredServer).toString();
      }

      // Mirror to all other servers in the background (fire-and-forget).
      // BlossomUploader uses Promise.any(), so only one server has the blob.
      // We mirror to the rest for redundancy (BUD-04).
      const uploadedServer = config.blossomServers.find((s) => url.startsWith(s));
      const mirrorServers = config.blossomServers.filter((s) => s !== uploadedServer);

      if (mirrorServers.length > 0) {
        mirrorToServers(url, mirrorServers, user.signer).catch(() => {
          // Mirroring is best-effort — don't fail the upload if it fails.
        });
      }

      return tags;
    },
  });
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
