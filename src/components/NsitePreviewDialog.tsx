import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useCenterColumn } from '@/contexts/LayoutContext';

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

interface NsitePreviewDialogProps {
  /** The nsite.lol gateway URL used for proxying (e.g. https://<b36><dtag>.nsite.lol). */
  nsiteUrl: string;
  /** The bare nsite identifier shown in the address bar (e.g. "<b36><dtag>"). */
  nsiteName: string;
  /** Display name for the app. */
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * An in-app preview panel that covers the center column and loads an nsite in
 * a sandboxed iframe, using the Shakespeare iframe-fetch-client protocol over
 * local-shakespeare.dev.
 *
 * The panel is portaled into the center column DOM element (via CenterColumnContext)
 * and uses `position: absolute; inset: 0` to fill it exactly — no viewport
 * math or responsive inset hacks required.
 *
 * The parent window intercepts JSON-RPC `fetch` requests from the iframe and
 * proxies them to the live nsite URL, so the SPA can run without needing CORS
 * headers on the origin server.
 */
export function NsitePreviewDialog({ nsiteUrl, nsiteName, appName, open, onOpenChange }: NsitePreviewDialogProps) {
  const sessionIdRef = useRef<string>(makeSessionId());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentPath, setCurrentPath] = useState('/');
  const centerColumn = useCenterColumn();

  // Derive a stable iframe origin from the session id and preview domain
  const iframeOrigin = `https://${sessionIdRef.current}.${PREVIEW_DOMAIN}`;
  const iframeSrc = `${iframeOrigin}/`;

  /** Send a JSON-RPC response back to the iframe. */
  const sendResponse = useCallback((message: JSONRPCResponse) => {
    iframeRef.current?.contentWindow?.postMessage(message, iframeOrigin);
  }, [iframeOrigin]);

  /** Handle a fetch request from the iframe by proxying it to the nsite. */
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

      // Build the proxied URL: replace the iframe origin with the nsite origin
      const nsiteBase = new URL(nsiteUrl);
      const proxyUrl = `${nsiteBase.origin}${requestedUrl.pathname}${requestedUrl.search}`;

      const res = await fetch(proxyUrl, {
        method: fetchRequest.method,
        headers: fetchRequest.headers,
        body: fetchRequest.body ?? undefined,
        // Don't follow redirects automatically so we can handle them
        redirect: 'follow',
      });

      // Read as ArrayBuffer → base64 so binary assets work correctly
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const bodyBase64 = btoa(binary);

      // The iframe-fetch-client (main.js) checks headers with Title-Case keys
      // (e.g. "Content-Type"), but the browser's fetch() API normalizes all
      // header names to lowercase. Re-key everything to Title-Case so the
      // client can find what it needs.
      const toTitleCase = (s: string) =>
        s.replace(/(^|-)([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase());
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        const titleKey = toTitleCase(key);
        // main.js does an exact equality check against "text/html" — strip any
        // charset or other parameters (e.g. "text/html; charset=UTF-8" → "text/html")
        responseHeaders[titleKey] = titleKey === 'Content-Type'
          ? value.split(';')[0].trim()
          : value;
      });

      sendResponse({
        jsonrpc: '2.0',
        result: {
          status: res.status,
          statusText: res.statusText,
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
  }, [iframeOrigin, nsiteUrl, sendResponse]);

  /** Handle navigation state updates from the iframe. */
  const handleNavigationState = useCallback((params: {
    currentUrl: string;
    canGoBack: boolean;
    canGoForward: boolean;
  }) => {
    setCurrentPath(params.currentUrl);
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
      setCurrentPath('/');
      // Generate a fresh session id each time the panel opens
      sessionIdRef.current = makeSessionId();
    }
  }, [open]);

  // Display URL shown in the nav bar: nsite://<name><path>
  const path = currentPath === '/' ? '' : currentPath;
  const displayUrl = `nsite://${nsiteName}${path}`;

  if (!open || !centerColumn) return null;

  return createPortal(
    <div className="absolute inset-0 z-50 flex flex-col bg-background">
      {/* Nav bar */}
      <div className="h-11 flex items-center gap-2 px-3 border-b bg-muted/30 shrink-0">
        {/* Address bar */}
        <div className="flex-1 min-w-0">
          <div className="h-7 bg-background border rounded-md flex items-center px-2.5 text-xs text-muted-foreground font-mono truncate select-none">
            {displayUrl}
          </div>
        </div>

        {/* Open in new tab */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={() => window.open(nsiteUrl, '_blank', 'noopener,noreferrer')}
          title="Open in new tab"
        >
          <ExternalLink className="size-3.5" />
        </Button>

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
    centerColumn,
  );
}
