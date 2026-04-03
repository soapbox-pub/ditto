import type { NostrEvent } from '@nostrify/nostrify';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCenterColumn } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { APP_BLOSSOM_SERVERS, getEffectiveBlossomServers } from '@/lib/appBlossom';

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

/** The wildcard-to-localhost preview domain used by Shakespeare's iframe-fetch-client. */
const PREVIEW_DOMAIN = 'local-shakespeare.dev';

/** A stable session ID for the iframe origin (one per component mount). */
function makeSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface JSONRPCFetchRequest {
  jsonrpc: '2.0';
  method: 'fetch';
  params: {
    request: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string | null;
    };
  };
  id: number;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  result?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string | null;
  };
  error?: {
    code: number;
    message: string;
  };
  id: number;
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

/**
 * Guess a MIME type from a file path extension.
 * Falls back to 'application/octet-stream' for unknown extensions.
 */
function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    mjs: 'application/javascript',
    json: 'application/json',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    wasm: 'application/wasm',
    xml: 'application/xml',
    txt: 'text/plain',
    md: 'text/markdown',
  };
  return map[ext] ?? 'application/octet-stream';
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
 * a sandboxed iframe, using the Shakespeare iframe-fetch-client protocol over
 * local-shakespeare.dev.
 *
 * Instead of proxying requests through an nsite gateway, this component serves
 * files directly from Blossom servers using the manifest data embedded in the
 * nsite event's `path` tags. Each path tag maps a file path to its sha256 hash,
 * which is used to construct a Blossom content-addressed URL.
 *
 * The panel is portaled into the center column DOM element (via CenterColumnContext)
 * and uses `position: fixed` to fill the viewport column area.
 *
 * The parent window intercepts JSON-RPC `fetch` requests from the iframe and
 * serves them directly from Blossom, so the SPA can run without any gateway dependency.
 */
export function NsitePreviewDialog({ event, appName, appPicture, open, onOpenChange }: NsitePreviewDialogProps) {
  const sessionIdRef = useRef<string>(makeSessionId());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const centerColumn = useCenterColumn();
  const columnRect = useElementRect(open ? centerColumn : null);
  const { config } = useAppContext();

  // Derive a stable iframe origin from the session id and preview domain
  const iframeOrigin = `https://${sessionIdRef.current}.${PREVIEW_DOMAIN}`;
  const iframeSrc = `${iframeOrigin}/`;

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

  /** Send a JSON-RPC response back to the iframe. */
  const sendResponse = useCallback((message: JSONRPCResponse) => {
    iframeRef.current?.contentWindow?.postMessage(message, iframeOrigin);
  }, [iframeOrigin]);

  /** Handle a fetch request from the iframe by serving files directly from Blossom. */
  const handleFetch = useCallback(async (request: JSONRPCFetchRequest) => {
    const { params, id } = request;
    const { request: fetchRequest } = params;

    try {
      const requestedUrl = new URL(fetchRequest.url);

      // Only serve requests for our iframe origin
      if (requestedUrl.origin !== iframeOrigin) {
        sendResponse({
          jsonrpc: '2.0',
          error: { code: -32003, message: 'Origin mismatch' },
          id,
        });
        return;
      }

      // Strip query string from path for manifest lookup
      const requestedPath = requestedUrl.pathname;

      // Look up the sha256 for this path in the manifest.
      // If not found, fall back to /index.html (SPA client-side routing).
      let sha256 = manifest.current.get(requestedPath);
      let servingPath = requestedPath;

      if (!sha256) {
        sha256 = manifest.current.get('/index.html');
        servingPath = '/index.html';
      }

      if (!sha256) {
        sendResponse({
          jsonrpc: '2.0',
          result: {
            status: 404,
            statusText: 'Not Found',
            headers: { 'Content-Type': 'text/plain' },
            body: btoa('Not Found'),
          },
          id,
        });
        return;
      }

      // Fetch the blob from Blossom, trying each server in order
      const res = await fetchFromBlossom(sha256, servers.current);

      // Read as ArrayBuffer → base64 so binary assets work correctly
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const bodyBase64 = btoa(binary);

      // Determine the content type. Prefer the response header from Blossom,
      // but fall back to a guess based on the file extension since Blossom
      // may return a generic content-type for all blobs.
      const blossomContentType = res.headers.get('content-type')?.split(';')[0].trim();
      const contentType = (blossomContentType && blossomContentType !== 'application/octet-stream')
        ? blossomContentType
        : guessMimeType(servingPath);

      // The iframe-fetch-client (main.js) checks headers with Title-Case keys
      // (e.g. "Content-Type"), and does an exact equality check against "text/html"
      // for routing decisions.
      const responseHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
      };

      sendResponse({
        jsonrpc: '2.0',
        result: {
          status: 200,
          statusText: 'OK',
          headers: responseHeaders,
          body: bodyBase64,
        },
        id,
      });
    } catch (err) {
      sendResponse({
        jsonrpc: '2.0',
        error: { code: -32002, message: String(err) },
        id,
      });
    }
  }, [iframeOrigin, sendResponse]);

  /** Handle navigation state updates from the iframe (no-op). */
  const handleNavigationState = useCallback((_params: {
    currentUrl: string;
    canGoBack: boolean;
    canGoForward: boolean;
  }) => {
    // intentionally empty
  }, []);

  // Listen for messages from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== iframeOrigin) return;
      const message = event.data;
      if (message?.jsonrpc !== '2.0') return;
      if (message.method === 'fetch') {
        handleFetch(message as JSONRPCFetchRequest);
      } else if (message.method === 'updateNavigationState') {
        handleNavigationState(message.params);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeOrigin, handleFetch, handleNavigationState]);

  // Reset state when panel opens/closes
  useEffect(() => {
    if (open) {
      // Generate a fresh session id each time the panel opens
      sessionIdRef.current = makeSessionId();
    }
  }, [open]);

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
      <div className="h-11 flex items-center gap-2 px-3 border-b bg-muted/30 shrink-0">
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

      {/* iframe */}
      <div className="flex-1 min-h-0 bg-background">
        <iframe
          key={`${sessionIdRef.current}-${open}`}
          ref={iframeRef}
          src={iframeSrc}
          className="w-full h-full border-0"
          title={`${appName} preview`}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    </div>,
    document.body,
  );
}
