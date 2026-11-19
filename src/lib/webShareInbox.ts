/**
 * The Web Share Target's file half (`share_target` in manifest.webmanifest).
 * A POSTed share lands in the service worker (`src/sw/worker.ts`), which parks
 * the files in Cache Storage and redirects to `/share` with the text in the
 * query and an `inbox` id naming the files; SharePage takes them from there.
 * Cache Storage rather than a message to the page, because the worker may be
 * stopped before the redirected page is ready to ask. Shared by `sw.js` and
 * the page, so no React or Capacitor here.
 */

/** The manifest's `share_target.action`. */
export const SHARE_ACTION = '/share';

/** Cache Storage bucket holding the files of at most one unclaimed share. */
export const SHARE_INBOX_CACHE = 'ditto-share-inbox';

const ENTRY_PREFIX = '/__share-inbox/';
const ID_RE = /^[0-9a-f]{32}$/;

function newInboxId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function entryUrl(origin: string, id: string, index: number): string {
  return `${origin}${ENTRY_PREFIX}${id}/${index}`;
}

/**
 * Answer the share target's POST: park its files, then 303 to `/share` so the
 * page loads with GET and a reload can't re-submit the form.
 */
export async function receiveSharePost(
  request: Request,
  cacheStorage: CacheStorage,
  origin: string,
): Promise<Response> {
  const target = new URL(SHARE_ACTION, origin);
  try {
    const form = await request.formData();
    for (const name of ['title', 'text', 'url']) {
      const value = form.get(name);
      if (typeof value === 'string' && value) target.searchParams.set(name, value);
    }
    const files = form
      .getAll('files')
      .filter((f): f is File => typeof f !== 'string' && (f.size > 0 || f.name !== ''));
    if (files.length > 0) {
      // One share at a time: an unclaimed earlier one goes.
      await cacheStorage.delete(SHARE_INBOX_CACHE);
      const cache = await cacheStorage.open(SHARE_INBOX_CACHE);
      const id = newInboxId();
      await Promise.all(
        files.map((file, i) =>
          cache.put(
            entryUrl(origin, id, i),
            new Response(file, {
              headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'X-File-Name': encodeURIComponent(file.name),
                'X-File-Type': file.type,
              },
            }),
          ),
        ),
      );
      target.searchParams.set('inbox', id);
    }
  } catch {
    // An unreadable form still opens the composer, with whatever text came through.
  }
  return Response.redirect(target.href, 303);
}

/** Take (and remove) the files a share parked under `id`, in their shared order. */
export async function takeSharedFiles(id: string, cacheStorage: CacheStorage): Promise<File[]> {
  if (!ID_RE.test(id) || !(await cacheStorage.has(SHARE_INBOX_CACHE))) return [];
  const cache = await cacheStorage.open(SHARE_INBOX_CACHE);
  const prefix = `${ENTRY_PREFIX}${id}/`;
  const entries = (await cache.keys())
    .map((req) => ({ req, path: new URL(req.url).pathname }))
    .filter(({ path }) => path.startsWith(prefix))
    .map(({ req, path }) => ({ req, index: Number(path.slice(prefix.length)) }))
    .sort((a, b) => a.index - b.index);
  // A stale id must not take a newer share down with it.
  if (entries.length === 0) return [];
  const files: File[] = [];
  for (const { req, index } of entries) {
    const res = await cache.match(req);
    if (!res) continue;
    const blob = await res.blob();
    let name = `shared-${index + 1}`;
    try {
      name = decodeURIComponent(res.headers.get('X-File-Name') ?? '') || name;
    } catch { /* keep the fallback */ }
    files.push(new File([blob], name, { type: res.headers.get('X-File-Type') ?? '' }));
  }
  await cacheStorage.delete(SHARE_INBOX_CACHE);
  return files;
}

const claims = new Map<string, Promise<File[]>>();

/**
 * Take a share's parked files once per id: a remount (StrictMode, or the
 * composer reopening) gets the same promise rather than an emptied inbox.
 */
export function claimSharedFiles(id: string): Promise<File[]> {
  let claim = claims.get(id);
  if (!claim) {
    claim = typeof caches === 'undefined'
      ? Promise.resolve([])
      : takeSharedFiles(id, caches).catch(() => []);
    claims.set(id, claim);
  }
  return claim;
}
