import { useMutation } from "@tanstack/react-query";
import { BlossomUploader } from '@nostrify/nostrify/uploaders';

import type { NostrSigner } from '@nostrify/nostrify';

import { useCurrentUser } from "./useCurrentUser";
import { useAppContext } from "./useAppContext";
import { getEffectiveBlossomServers } from "@/lib/appBlossom";
import { bestMime } from "@/lib/mediaUrls";

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
 * Upload a file to the user's Blossom servers (BUD-02): to the first server
 * that takes it, one at a time in configured order, then mirrored to the
 * servers not yet tried in the background (BUD-04). Returns NIP-94-style tags
 * describing the blob.
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

      const ext = getFileExtension(file.name);

      // Browsers report an empty type for some files (`.avi`, `.flac`, `.xdc`,
      // `.glb`, …) and a wrong one for others (Windows calls `.stl` a
      // certificate trust list). Uploaded as-is, the blob gets no usable
      // Content-Type and the `m` tag says nothing, so nothing downstream can
      // tell what it is. Fall back to the extension.
      const mime = bestMime(file.type, ext.slice(1));
      const uploadable = mime !== file.type
        ? new File([file], file.name, { type: mime, lastModified: file.lastModified })
        : file;

      const placement = await writeToFirstServer(servers, user.signer, (uploader) => uploader.upload(uploadable));
      if (!placement.tags) throw placement.error;
      const { tags } = placement;

      // Servers type what they don't recognise as `octet-stream`; keep ours.
      const mTag = tags.find(([name]) => name === 'm');
      if (mTag) mTag[1] = bestMime(mTag[1], ext.slice(1));
      else tags.push(['m', mime]);

      // If the returned URL is missing a file extension, append one from the
      // source file name. Blossom URLs are content-addressed (`/<sha256>`) and
      // may omit the extension. Adding it helps clients infer the media type.
      if (ext) {
        tags[0][1] = appendExtensionIfMissing(tags[0][1], ext);
      }

      const url = tags[0][1];

      // Mirror to the untried servers in the background (fire-and-forget).
      mirrorToServers(url, mirrorTargets(placement.untried, url), user.signer).catch(() => {
        // Mirroring is best-effort — don't fail the upload if it fails.
      });

      return tags;
    },
  });
}

/**
 * Copy a remote file onto the user's own Blossom servers and return the new
 * URL, so content borrowed from someone else (e.g. an adopted theme's
 * background) keeps working if the original owner deletes or swaps it.
 *
 * Tries a server-side BUD-04 mirror first, which only works for Blossom blob
 * URLs (it needs the sha256 in the path); otherwise downloads the file and
 * uploads it. Either way servers are tried one at a time, like
 * `useUploadFile`. Files already on one of the user's servers are returned
 * as-is.
 */
export function useRehostFile() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  return useMutation({
    mutationFn: async (sourceUrl: string): Promise<string> => {
      if (!user) {
        throw new Error('Must be logged in to upload files');
      }

      const servers = getEffectiveBlossomServers(
        config.blossomServerMetadata,
        config.useAppBlossomServers,
      );

      const sourceOrigin = originOf(sourceUrl);
      if (servers.some((s) => originOf(s) === sourceOrigin)) return sourceUrl;

      let placement: Placement = { untried: [], refused: servers };
      // A mirror needs the blob's sha256 in the path; anything else can only be uploaded.
      if (/[0-9a-f]{64}/.test(new URL(sourceUrl).pathname)) {
        placement = await writeToFirstServer(servers, user.signer, (uploader) => uploader.mirror(sourceUrl));
      }

      if (!placement.tags) {
        // Only upload where the mirror was refused outright. A server whose
        // mirror timed out may still be fetching the blob, and an upload
        // there now would be a second write of it in flight.
        const targets = placement.refused;
        if (targets.length === 0) throw placement.error;

        const response = await fetchWithTimeout(sourceUrl);
        if (!response.ok) throw new Error(`Failed to download ${sourceUrl}: ${response.status}`);
        const blob = await response.blob();
        const name = new URL(sourceUrl).pathname.split('/').pop() || 'file';
        const file = new File([blob], name, { type: blob.type });
        placement = await writeToFirstServer(targets, user.signer, (uploader) => uploader.upload(file));
        if (!placement.tags) throw placement.error;
      }

      const url = placement.tags[0][1];

      mirrorToServers(url, mirrorTargets(placement.untried, url), user.signer).catch(() => {});

      return url;
    },
  });
}

/** Where a blob landed after {@link writeToFirstServer}. */
interface Placement {
  /** NIP-94 tags from the server that took the blob, if one did. */
  tags?: string[][];
  /** Servers that were never sent a request, so are safe to mirror to. */
  untried: string[];
  /** Servers that answered with a refusal, so nothing of ours is still in flight there. */
  refused: string[];
  /** Why the last server failed, when none took the blob. */
  error?: unknown;
}

/**
 * Write a blob to the first server that takes it, one server at a time in
 * configured order. Racing every server and then mirroring to the losers
 * (what this replaced) left a mirror and a direct upload of the same blob in
 * flight on one server at once, and servers stored it twice.
 *
 * A server whose request timed out or dropped is neither `untried` nor
 * `refused`: it may still be processing the write, so it gets nothing more.
 * Exported for testing.
 */
export async function writeToFirstServer(
  servers: string[],
  signer: NostrSigner,
  write: (uploader: BlossomUploader) => Promise<string[][]>,
): Promise<Placement> {
  const refused: string[] = [];
  let error: unknown = new Error('No Blossom servers configured');

  for (const [i, server] of servers.entries()) {
    let answered = false;
    const uploader = new BlossomUploader({
      servers: [server],
      signer,
      fetch: async (input, init) => {
        const response = await fetchWithTimeout(input, init);
        answered = true;
        return response;
      },
    });

    try {
      const tags = await write(uploader);
      const origin = originOf(server);
      return { tags, untried: servers.slice(i + 1).filter((s) => originOf(s) !== origin), refused };
    } catch (e) {
      error = e;
      if (answered) refused.push(server);
    }
  }

  return { untried: [], refused, error };
}

/**
 * Drop servers that already hold `url`. Matched by ORIGIN: a configured server
 * may lack the trailing slash the returned URL has.
 */
function mirrorTargets(servers: string[], url: string): string[] {
  const origin = originOf(url);
  return servers.filter((s) => originOf(s) !== origin);
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
