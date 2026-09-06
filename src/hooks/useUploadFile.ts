import { useMutation } from "@tanstack/react-query";
import { BlossomUploader } from '@nostrify/nostrify/uploaders';

import type { NostrSigner } from '@nostrify/nostrify';

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { getEffectiveBlossomServers } from "@/lib/appBlossom";

/** Every Blossom request gets its own deadline, so one hung server never holds a promise open. */
const REQUEST_TIMEOUT_MS = 30_000;

const fetchWithTimeout: typeof fetch = (input, init) =>
  globalThis.fetch(input, {
    ...init,
    signal: AbortSignal.any([
      init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ]),
  });

/**
 * Upload a file to the user's Blossom servers (BUD-02), racing every server
 * and taking the first success, then mirroring to the rest in the background
 * (BUD-04). Returns NIP-94-style tags describing the blob.
 */
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
        // Promise.any() resolves as soon as any server succeeds; the per-request
        // timeout ensures every other promise still settles, so the
        // AggregateError path fires promptly when every server is slow or down.
        fetch: fetchWithTimeout,
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
      // BlossomUploader uses Promise.any(), so only one server is known to have
      // the blob. Matched by ORIGIN: a configured server may lack the trailing
      // slash the returned URL has, and a prefix match would then re-mirror to
      // the server that already holds the blob while missing none.
      const uploadedOrigin = originOf(url);
      const mirrorServers = servers.filter((s) => originOf(s) !== uploadedOrigin);

      if (mirrorServers.length > 0) {
        mirrorToServers(url, mirrorServers, user.signer).catch(() => {
          // Mirroring is best-effort — don't fail the upload if it fails.
        });
      }

      return tags;
    },
  });
}

function originOf(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Extract the file extension (with leading dot) from a filename, or empty string if none. */
function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0) return '';
  return filename.slice(dotIndex).toLowerCase();
}

/** Append a file extension to a URL if its path doesn't already have one. */
function appendExtensionIfMissing(urlString: string, ext: string): string {
  try {
    const url = new URL(urlString);
    const lastSegment = url.pathname.split('/').pop() ?? '';
    // Check if the last path segment already contains a dot (has an extension)
    if (lastSegment.includes('.')) return urlString;
    url.pathname = url.pathname + ext;
    return url.toString();
  } catch {
    return urlString;
  }
}

/**
 * Mirror a blob to additional Blossom servers (BUD-04), one `PUT /mirror` per
 * server so every server gets a copy rather than the first to answer.
 *
 * Goes through nostrify's `mirror()` so the authorization is the one a
 * conforming server validates (BUD-11): verb `upload` — there is no `mirror`
 * verb — an `x` tag naming the blob, base64url-encoded. The earlier hand-built
 * `t=mirror` token had none of those and was refused, so nothing was ever
 * mirrored and every upload lived on exactly one server. Exported for testing.
 */
export async function mirrorToServers(
  sourceUrl: string,
  servers: string[],
  signer: NostrSigner,
): Promise<void> {
  await Promise.allSettled(
    servers.map((server) =>
      new BlossomUploader({ servers: [server], signer, fetch: fetchWithTimeout }).mirror(sourceUrl),
    ),
  );
}
