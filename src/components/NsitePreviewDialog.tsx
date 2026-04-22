import type { NostrEvent } from '@nostrify/nostrify';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

import { Button } from '@/components/ui/button';
import { SandboxFrame } from '@/components/SandboxFrame';
import { useCenterColumn } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { APP_BLOSSOM_SERVERS, getEffectiveBlossomServers } from '@/lib/appBlossom';
import { deriveIframeSubdomain } from '@/lib/iframeSubdomain';
import { getNsiteSubdomain } from '@/lib/nsiteSubdomain';
import { getPreviewInjectedScript } from '@/lib/previewInjectedScript';
import { getMimeType } from '@/lib/sandbox';
import type { FileResponse, InjectedScript } from '@/lib/sandbox';

interface Rect { left: number; top: number; width: number; height: number }

/** Track the viewport-relative bounding rect of an element, updating on resize. */
function useElementRect(el: HTMLElement | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!el) { setRect(null); return; }

    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [el]);

  return rect;
}

/**
 * Build the path→sha256 manifest from a nsite event's `path` tags.
 * Each path tag has the format: ["path", "/file/path", "<sha256>"]
 */
function buildManifest(event: NostrEvent): Map<string, string> {
  const manifest = new Map<string, string>();
  for (const tag of event.tags) {
    if (tag[0] === 'path' && tag[1] && tag[2]) {
      manifest.set(tag[1], tag[2]);
    }
  }
  return manifest;
}

/**
 * Resolve the Blossom servers for a nsite event.
 * Prefers the `server` tags on the event; falls back to the provided app servers.
 */
function resolveServers(event: NostrEvent, appServers: string[]): string[] {
  const eventServers = event.tags
    .filter(([name]) => name === 'server')
    .map(([, url]) => url)
    .filter((url) => {
      try { new URL(url); return true; } catch { return false; }
    });

  return eventServers.length > 0 ? eventServers : appServers;
}

/**
 * Module-level preferred server. Once a Blossom server successfully serves
 * a blob, it is promoted here so subsequent requests try it first — avoiding
 * the round-trip penalty of 404s on servers that don't have the content.
 */
let preferredServer: string | null = null;

/**
 * Fetch a blob from the given sha256 by trying Blossom servers.
 *
 * If a server previously succeeded (the "preferred" server), it is tried
 * first. On success the preferred server is reinforced; on failure we fall
 * through to the remaining servers in order. Whichever server ultimately
 * succeeds is promoted to preferred for the next call.
 */
async function fetchFromBlossom(sha256: string, servers: string[]): Promise<Response> {
  let lastError: unknown;

  /** Try a single server. Returns the Response on success, or null. */
  async function tryServer(server: string): Promise<Response | null> {
    const base = server.replace(/\/+$/, '');
    const url = `${base}/${sha256}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        preferredServer = server;
        return res;
      }
    } catch (err) {
      lastError = err;
    }
    return null;
  }

  // Try the preferred server first if it's in the list.
  if (preferredServer && servers.includes(preferredServer)) {
    const res = await tryServer(preferredServer);
    if (res) return res;
  }

  // Fall through to the full list, skipping the preferred (already tried).
  for (const server of servers) {
    if (server === preferredServer) continue;
    const res = await tryServer(server);
    if (res) return res;
  }

  throw lastError ?? new Error(`Failed to fetch blob ${sha256} from all servers`);
}

/** Max concurrent Blossom fetches during pre-fetch. */
const PREFETCH_CONCURRENCY = 12;

/**
 * Pre-fetch all unique blobs from the manifest into an in-memory cache.
 *
 * **Android only.** Android's WebView uses `shouldInterceptRequest` which
 * blocks a pool of ~6 IO threads via `CountDownLatch` until JS responds.
 * If each response requires a network round-trip to Blossom, the 6-at-a-time
 * serialisation makes loading 200+ files extremely slow. By downloading
 * every blob *before* the WebView starts loading, each bridge round-trip
 * drops from seconds (network) to ~1-5ms (memory).
 *
 * iOS does NOT need this — `WKURLSchemeHandler` is fully async and can
 * handle many concurrent requests without any thread pool bottleneck.
 *
 * Uses bounded concurrency to saturate the network without overwhelming it.
 */
async function prefetchAllBlobs(
  manifest: Map<string, string>,
  servers: string[],
  cache: Map<string, Uint8Array>,
): Promise<void> {
  // Deduplicate — many paths may share the same hash (e.g. SPA fallbacks).
  const uniqueHashes = [...new Set(manifest.values())];
  // Skip hashes already in the cache (e.g. from a previous open).
  const toFetch = uniqueHashes.filter((h) => !cache.has(h));
  if (toFetch.length === 0) return;

  let cursor = 0;
  const total = toFetch.length;

  async function worker(): Promise<void> {
    while (cursor < total) {
      const idx = cursor++;
      const sha256 = toFetch[idx];
      try {
        const res = await fetchFromBlossom(sha256, servers);
        const buffer = await res.arrayBuffer();
        cache.set(sha256, new Uint8Array(buffer));
      } catch {
        // Non-fatal — resolveFile will fetch on demand for cache misses.
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(PREFETCH_CONCURRENCY, total) },
    () => worker(),
  );
  await Promise.all(workers);
}

interface NsitePreviewDialogProps {
  /** The nsite event (kind 15128 or 35128) containing path and server tags. */
  event: NostrEvent;
  /** Display name for the app. */
  appName: string;
  /** Optional app icon URL. */
  appPicture?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * An in-app preview panel that covers the center column and loads an nsite in
 * a sandboxed iframe.
 *
 * Files are served directly from Blossom servers using the manifest data
 * embedded in the nsite event's `path` tags. Each path tag maps a file path
 * to its sha256 hash, which is used to construct a Blossom content-addressed URL.
 *
 * The panel is portaled into the center column DOM element (via CenterColumnContext)
 * and uses `position: fixed` to fill the viewport column area.
 */
export function NsitePreviewDialog({ event, appName, appPicture, open, onOpenChange }: NsitePreviewDialogProps) {
  const centerColumn = useCenterColumn();
  const columnRect = useElementRect(open ? centerColumn : null);
  const { config } = useAppContext();

  // Use the NIP-5A canonical subdomain as the stable identifier, then derive
  // a private HMAC-SHA256 subdomain so the raw identifier is never exposed as
  // a sandbox origin (preventing cross-app localStorage/IndexedDB collisions).
  const nsiteSubdomain = getNsiteSubdomain(event);
  const previewSubdomain = useMemo(() => deriveIframeSubdomain(config.appId, 'nsite', nsiteSubdomain), [config.appId, nsiteSubdomain]);

  // Build the manifest and server list from the event (memoised per event identity)
  const manifest = useRef<Map<string, string>>(new Map());
  const servers = useRef<string[]>([]);

  /**
   * In-memory blob cache: sha256 → raw bytes.
   * On Android, populated by a blocking pre-fetch in `onReady` so every
   * `resolveFile` call is an instant cache hit with no network wait.
   */
  const blobCache = useRef<Map<string, Uint8Array>>(new Map());

  useEffect(() => {
    manifest.current = buildManifest(event);
    const appServers = getEffectiveBlossomServers(
      config.blossomServerMetadata,
      config.useAppBlossomServers ?? true,
    );
    servers.current = resolveServers(event, appServers.length > 0 ? appServers : APP_BLOSSOM_SERVERS.servers);
  }, [event, config.blossomServerMetadata, config.useAppBlossomServers]);

  /** Injected scripts: just the path normalisation snippet for SPA support. */
  const injectedScripts = useMemo<InjectedScript[]>(() => [{
    path: '__injected__/preview.js',
    content: getPreviewInjectedScript(),
  }], []);

  /**
   * Called by SandboxFrame before the native WebView is created.
   *
   * On Android: blocks until all blobs are pre-fetched. Android's WebView
   * uses `shouldInterceptRequest` which blocks ~6 IO threads — if each
   * response requires a network fetch the whole thing is painfully slow.
   * The native ProgressBar spinner (render thread) stays visible and
   * animating during the download. Once the WebView starts, every
   * resolveFile call is an instant cache hit.
   *
   * On iOS: no-op. WKURLSchemeHandler is async and handles concurrent
   * requests without a thread pool bottleneck.
   *
   * On web: no-op. iframe.diy's service worker handles fetches efficiently.
   */
  const onReady = useCallback(async () => {
    if (Capacitor.getPlatform() !== 'android') return;
    await prefetchAllBlobs(manifest.current, servers.current, blobCache.current);
  }, []);

  /** Resolve a pathname to file content from the Blossom manifest. */
  const resolveFile = useCallback(async (pathname: string): Promise<FileResponse | null> => {
    // Look up the sha256 for this path in the manifest.
    // If not found, fall back to /index.html (SPA client-side routing).
    let sha256 = manifest.current.get(pathname);
    let servingPath = pathname;

    if (!sha256) {
      sha256 = manifest.current.get('/index.html');
      servingPath = '/index.html';
    }

    if (!sha256) return null;

    // Serve from cache if available (pre-fetched on Android).
    const cached = blobCache.current.get(sha256);
    if (cached) {
      const contentType = getMimeType(servingPath);
      return { status: 200, contentType, body: cached };
    }

    // Cache miss — fetch from Blossom (normal path on iOS/web).
    const res = await fetchFromBlossom(sha256, servers.current);
    const buffer = await res.arrayBuffer();
    const body = new Uint8Array(buffer);

    // Store in cache for future requests (e.g. SPA navigations).
    blobCache.current.set(sha256, body);

    // Always determine content type from the file extension.
    // Blossom servers commonly return incorrect types (e.g. text/plain for .js
    // files), which causes browsers to reject module scripts. The file path from
    // the manifest is authoritative for the correct MIME type.
    const contentType = getMimeType(servingPath);

    return { status: 200, contentType, body };
  }, []);

  if (!open || !centerColumn || !columnRect) return null;

  // If the user has scrolled down, columnRect.top is negative (the column top
  // is above the viewport). Clamp to 0 so the panel always starts at the
  // viewport top edge and never grows taller than the viewport.
  const panelTop = Math.max(0, columnRect.top);
  const panelHeight = window.innerHeight - panelTop;

  return createPortal(
    <div
      className="fixed z-50 flex flex-col bg-background"
      style={{
        left: columnRect.left,
        top: panelTop,
        width: columnRect.width,
        height: panelHeight,
      }}
    >
      {/* Nav bar */}
      <div className="min-h-11 flex items-center gap-2 px-3 border-b bg-muted/30 shrink-0 safe-area-top">
        {/* App icon + name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {appPicture ? (
            <img
              src={appPicture}
              alt={appName}
              className="size-6 rounded-md object-cover shrink-0"
            />
          ) : (
            <div className="size-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="size-3.5 text-primary/50" />
            </div>
          )}
          <span className="text-sm font-medium truncate">{appName}</span>
        </div>

        {/* Close */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={() => onOpenChange(false)}
          title="Close"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Sandboxed iframe */}
      <div className="flex-1 min-h-0 bg-background">
        <SandboxFrame
          key={`${previewSubdomain}-${open}`}
          id={previewSubdomain}
          resolveFile={resolveFile}
          onReady={onReady}
          injectedScripts={injectedScripts}
          className="w-full h-full border-0"
          title={`${appName} preview`}
        />
      </div>
    </div>,
    document.body,
  );
}
