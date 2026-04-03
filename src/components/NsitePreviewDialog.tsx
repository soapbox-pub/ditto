import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

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
  /** The nsite URL to preview (e.g. https://abc.nsite.lol). */
  nsiteUrl: string;
  /** Display name for the app. */
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * An in-app preview dialog that loads an nsite in a sandboxed iframe,
 * using the Shakespeare iframe-fetch-client protocol over local-shakespeare.dev.
 *
 * The parent window intercepts JSON-RPC `fetch` requests from the iframe and
 * proxies them to the live nsite URL, so the SPA can run without needing CORS
 * headers on the origin server.
 */
export function NsitePreviewDialog({ nsiteUrl, appName, open, onOpenChange }: NsitePreviewDialogProps) {
  const sessionIdRef = useRef<string>(makeSessionId());
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [history, setHistory] = useState<string[]>(['/']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
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
    const path = params.currentUrl;
    setCurrentPath(path);
    setHistory((prev) => {
      if (path !== prev[historyIndex]) {
        const next = [...prev.slice(0, historyIndex + 1), path];
        setHistoryIndex(next.length - 1);
        return next;
      }
      return prev;
    });
  }, [historyIndex]);

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

  const sendNavCommand = useCallback((method: string, params?: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(
      { jsonrpc: '2.0', method, params: params ?? {}, id: Date.now() },
      iframeOrigin,
    );
  }, [iframeOrigin]);

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentPath(history[newIndex]);
      sendNavCommand('navigate', { url: history[newIndex] });
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCurrentPath(history[newIndex]);
      sendNavCommand('navigate', { url: history[newIndex] });
    }
  };

  const handleRefresh = () => {
    sendNavCommand('refresh');
  };

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setCurrentPath('/');
      setHistory(['/']);
      setHistoryIndex(0);
      setIsFullscreen(false);
      // Generate a fresh session id each time the dialog opens
      sessionIdRef.current = makeSessionId();
    }
  }, [open]);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  // Derive the display URL shown in the address bar
  const displayUrl = (() => {
    try {
      const base = new URL(nsiteUrl);
      return `${base.hostname}${currentPath === '/' ? '' : currentPath}`;
    } catch {
      return nsiteUrl;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isFullscreen
            ? 'fixed inset-0 max-w-none w-screen h-screen rounded-none p-0 flex flex-col gap-0 [&>button]:hidden'
            : 'max-w-4xl w-full h-[80vh] p-0 flex flex-col gap-0'
        }
      >
        <VisuallyHidden>
          <DialogTitle>{appName} — Preview</DialogTitle>
        </VisuallyHidden>

        {/* Browser chrome toolbar */}
        <div className="h-11 flex items-center gap-1.5 px-2 border-b bg-muted/30 shrink-0 rounded-t-lg">
          {/* Back / Forward / Refresh */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleBack}
            disabled={!canGoBack}
            title="Back"
          >
            <ArrowLeft className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleForward}
            disabled={!canGoForward}
            title="Forward"
          >
            <ArrowRight className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleRefresh}
            title="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </Button>

          {/* Address bar */}
          <div className="flex-1 mx-1">
            <div className="h-7 bg-background border rounded-md flex items-center px-2.5 text-xs text-muted-foreground font-mono truncate select-none">
              {displayUrl}
            </div>
          </div>

          {/* Open in new tab */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => window.open(nsiteUrl, '_blank', 'noopener,noreferrer')}
            title="Open in new tab"
          >
            <ExternalLink className="size-3.5" />
          </Button>

          {/* Fullscreen toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setIsFullscreen((f) => !f)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>

          {/* Close */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
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
      </DialogContent>
    </Dialog>
  );
}
