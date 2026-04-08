import type { NostrEvent } from '@nostrify/nostrify';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SandboxFrame } from '@/components/SandboxFrame';
import { useCenterColumn } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useIsMobile } from '@/hooks/useIsMobile';
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
 * Fetch a blob from the given sha256 by trying each Blossom server in order.
 * Returns a Response from the first server that responds successfully, or
 * throws if all servers fail.
 */
async function fetchFromBlossom(sha256: string, servers: string[]): Promise<Response> {
  let lastError: unknown;
  for (const server of servers) {
    const base = server.replace(/\/+$/, '');
    const url = `${base}/${sha256}`;
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error(`Failed to fetch blob ${sha256} from all servers`);
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
  const isMobile = useIsMobile();
  const columnRect = useElementRect(open && !isMobile ? centerColumn : null);
  const { config } = useAppContext();

  // Use the NIP-5A canonical subdomain as the stable identifier, then derive
  // a private HMAC-SHA256 subdomain so the raw identifier is never exposed as
  // a sandbox origin (preventing cross-app localStorage/IndexedDB collisions).
  const nsiteSubdomain = getNsiteSubdomain(event);
  const previewSubdomain = useMemo(() => deriveIframeSubdomain('nsite', nsiteSubdomain), [nsiteSubdomain]);

  // Build the manifest and server list from the event (memoised per event identity)
  const manifest = useRef<Map<string, string>>(new Map());
  const servers = useRef<string[]>([]);

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

    // Fetch the blob from Blossom, trying each server in order.
    const res = await fetchFromBlossom(sha256, servers.current);
    const buffer = await res.arrayBuffer();
    const body = new Uint8Array(buffer);

    // Always determine content type from the file extension.
    // Blossom servers commonly return incorrect types (e.g. text/plain for .js
    // files), which causes browsers to reject module scripts. The file path from
    // the manifest is authoritative for the correct MIME type.
    const contentType = getMimeType(servingPath);

    return { status: 200, contentType, body };
  }, []);

  if (!open || !centerColumn) return null;

  // On desktop, align the panel to the center column.
  // On mobile, go full-viewport with `inset-0` so the panel correctly fills
  // the screen and safe-area padding handles the notch / home indicator.
  const useColumnRect = !isMobile && columnRect;

  const panelStyle: React.CSSProperties = useColumnRect
    ? {
        left: columnRect.left,
        top: Math.max(0, columnRect.top),
        width: columnRect.width,
        height: window.innerHeight - Math.max(0, columnRect.top),
      }
    : {
        inset: 0,
      };

  return createPortal(
    <div
      className="fixed z-50 flex flex-col bg-background"
      style={panelStyle}
    >
      {/* Nav bar */}
      <div className="h-11 flex items-center gap-2 px-3 border-b bg-muted/30 shrink-0 safe-area-top">
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
      <div className="flex-1 min-h-0 bg-background safe-area-bottom">
        <SandboxFrame
          key={`${previewSubdomain}-${open}`}
          id={previewSubdomain}
          resolveFile={resolveFile}
          injectedScripts={injectedScripts}
          className="w-full h-full border-0"
          title={`${appName} preview`}
        />
      </div>
    </div>,
    document.body,
  );
}
