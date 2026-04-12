import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  type IframeHTMLAttributes,
} from 'react';

import { Capacitor } from '@capacitor/core';
import { Loader2 } from 'lucide-react';

import { useAppContext } from '@/hooks/useAppContext';
import {
  bytesToBase64,
  utf8ToBase64,
  injectScriptTags,
} from '@/lib/sandbox';
import type {
  FileResponse,
  InjectedScript,
  JsonRpcResponse,
  SerialisedRequest,
} from '@/lib/sandbox';
import {
  SandboxPlugin,
  type SandboxFetchEvent,
} from '@/lib/sandboxPlugin';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SandboxFrameProps
  extends Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'src' | 'id'> {
  /** HMAC-derived subdomain identifier. */
  id: string;
  /**
   * Resolve a pathname to file content.
   * Return a `FileResponse` to serve the file, or `null` for a 404.
   */
  resolveFile: (pathname: string) => Promise<FileResponse | null>;
  /**
   * Handle non-fetch, non-lifecycle JSON-RPC methods (e.g. `webxdc.*`).
   * Receives the method name, params, and a `post` function for sending
   * arbitrary messages back into the sandbox (e.g. push notifications).
   * Return the result value to send as the JSON-RPC response.
   */
  onRpc?: (
    method: string,
    params: unknown,
    post: (msg: Record<string, unknown>) => void,
  ) => Promise<unknown>;
  /**
   * Virtual scripts to inject into HTML responses.
   * Each entry is served at its `path` and a `<script src="...">` tag is
   * prepended into `<head>` of every HTML response.
   */
  injectedScripts?: InjectedScript[];
  /** Optional Content-Security-Policy header added to every response. */
  csp?: string;
  /**
   * Called when the sandbox sends `ready`, **before** `init` is sent back.
   * If the returned promise is pending, `init` is deferred until it resolves,
   * which prevents fetch requests from arriving before the consumer is ready
   * to serve files (e.g. while an archive is still being downloaded).
   */
  onReady?: () => void | Promise<void>;
}

/** Imperative handle exposed via ref. */
export interface SandboxFrameHandle {
  /** Send a postMessage to the sandbox iframe. */
  postMessage: (msg: Record<string, unknown>, transfer?: Transferable[]) => void;
  /** Focus the iframe element. */
  focus: () => void;
}

// ---------------------------------------------------------------------------
// Shared fetch/RPC handler logic
// ---------------------------------------------------------------------------

/**
 * Build a serialised HTTP response and call `respond` with it.
 * Shared between the web (postMessage) and native (respondToFetch) paths.
 */
async function handleFetchRequest(
  pathname: string,
  resolveFile: (pathname: string) => Promise<FileResponse | null>,
  scripts: InjectedScript[],
  activeCsp: string | undefined,
  respond: (result: Record<string, unknown>) => void,
  respondError: (code: number, message: string) => void,
): Promise<void> {
  // Check if the request is for a virtual injected script.
  const virtualScript = scripts.find(
    (s) => pathname === `/${s.path}` || pathname === s.path,
  );
  if (virtualScript) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache',
    };
    if (activeCsp) headers['Content-Security-Policy'] = activeCsp;

    respond({
      status: 200,
      statusText: 'OK',
      headers,
      body: utf8ToBase64(virtualScript.content),
    });
    return;
  }

  // Delegate to the consumer's file resolver.
  try {
    const file = await resolveFile(pathname);

    if (!file) {
      const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
      if (activeCsp) headers['Content-Security-Policy'] = activeCsp;

      respond({
        status: 404,
        statusText: 'Not Found',
        headers,
        body: utf8ToBase64('Not Found'),
      });
      return;
    }

    // For HTML responses, inject script tags.
    let bodyBase64: string;
    if (file.contentType === 'text/html' && scripts.length > 0) {
      const html = new TextDecoder().decode(file.body);
      const injected = injectScriptTags(
        html,
        scripts.map((s) => `/${s.path}`),
      );
      bodyBase64 = utf8ToBase64(injected);
    } else {
      bodyBase64 = bytesToBase64(file.body);
    }

    const headers: Record<string, string> = {
      'Content-Type': file.contentType,
      'Cache-Control': 'no-cache',
    };
    if (activeCsp) headers['Content-Security-Policy'] = activeCsp;
    // Include Content-Length for non-HTML (binary) responses.
    if (file.contentType !== 'text/html') {
      headers['Content-Length'] = String(file.body.byteLength);
    }

    respond({
      status: file.status,
      statusText: 'OK',
      headers,
      body: bodyBase64,
    });
  } catch (err) {
    respondError(-32002, String(err));
  }
}

// ---------------------------------------------------------------------------
// Web (iframe.diy) implementation
// ---------------------------------------------------------------------------

const SandboxFrameWeb = forwardRef<SandboxFrameHandle, SandboxFrameProps>(
  function SandboxFrameWeb(
    { id, resolveFile, onRpc, injectedScripts, csp, onReady, ...iframeProps },
    ref,
  ) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const { config } = useAppContext();

    const origin = useMemo(
      () => `https://${id}.${config.sandboxDomain}`,
      [id, config.sandboxDomain],
    );

    // Keep latest callbacks in refs so the message handler always sees
    // current values without re-registering the listener.
    const resolveFileRef = useRef(resolveFile);
    const onRpcRef = useRef(onRpc);
    const injectedScriptsRef = useRef(injectedScripts);
    const cspRef = useRef(csp);
    const onReadyRef = useRef(onReady);

    useEffect(() => { resolveFileRef.current = resolveFile; }, [resolveFile]);
    useEffect(() => { onRpcRef.current = onRpc; }, [onRpc]);
    useEffect(() => { injectedScriptsRef.current = injectedScripts; }, [injectedScripts]);
    useEffect(() => { cspRef.current = csp; }, [csp]);
    useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

    // -----------------------------------------------------------------
    // Post a message to the iframe
    // -----------------------------------------------------------------

    const post = useCallback(
      (msg: Record<string, unknown>, transfer?: Transferable[]) => {
        iframeRef.current?.contentWindow?.postMessage(msg, origin, transfer ?? []);
      },
      [origin],
    );

    // Expose imperative handle.
    useImperativeHandle(ref, () => ({
      postMessage: (msg: Record<string, unknown>, transfer?: Transferable[]) => {
        iframeRef.current?.contentWindow?.postMessage(msg, origin, transfer ?? []);
      },
      focus: () => {
        iframeRef.current?.focus();
      },
    }), [origin]);

    // -----------------------------------------------------------------
    // Message handler
    // -----------------------------------------------------------------

    useEffect(() => {
      function onMessage(event: MessageEvent) {
        if (event.origin !== origin) return;
        if (event.source !== iframeRef.current?.contentWindow) return;

        const msg = event.data;
        if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return;

        // Notification: ready -> await onReady, then respond with init
        if (msg.method === 'ready' && msg.id === undefined) {
          handleReady();
          return;
        }

        // Requests (have an `id`)
        if (msg.id !== undefined && msg.method) {
          if (msg.method === 'fetch') {
            handleFetch(msg.id, msg.params);
          } else if (onRpcRef.current) {
            handleRpc(msg.id, msg.method, msg.params ?? {});
          }
        }
      }

      // ---------------------------------------------------------------
      // Ready handler: run consumer setup, then send init
      // ---------------------------------------------------------------

      async function handleReady() {
        try {
          await onReadyRef.current?.();
        } catch (err) {
          console.error('[SandboxFrame] onReady failed:', err);
        }
        post({ jsonrpc: '2.0', method: 'init', params: { version: 1 } });
      }

      // ---------------------------------------------------------------
      // Fetch handler
      // ---------------------------------------------------------------

      async function handleFetch(
        id: string | number,
        params: { request?: SerialisedRequest },
      ) {
        const reqUrl = params?.request?.url;
        if (!reqUrl) {
          post({ jsonrpc: '2.0', id, error: { code: -32001, message: 'Invalid request' } });
          return;
        }

        let pathname: string;
        try {
          const url = new URL(reqUrl);
          // Only serve requests for our sandbox origin.
          if (url.origin !== origin) {
            post({ jsonrpc: '2.0', id, error: { code: -32003, message: 'Origin mismatch' } });
            return;
          }
          pathname = url.pathname;
        } catch {
          post({ jsonrpc: '2.0', id, error: { code: -32003, message: 'Invalid URL' } });
          return;
        }

        await handleFetchRequest(
          pathname,
          resolveFileRef.current,
          injectedScriptsRef.current ?? [],
          cspRef.current,
          (result) => post({ jsonrpc: '2.0', id, result }),
          (code, message) => post({ jsonrpc: '2.0', id, error: { code, message } }),
        );
      }

      // ---------------------------------------------------------------
      // Custom RPC handler
      // ---------------------------------------------------------------

      async function handleRpc(
        id: string | number,
        method: string,
        params: unknown,
      ) {
        try {
          const result = await onRpcRef.current!(method, params, post);
          post({ jsonrpc: '2.0', id, result: result ?? null } satisfies JsonRpcResponse);
        } catch (err) {
          post({
            jsonrpc: '2.0',
            id,
            error: { code: -1, message: String(err) },
          } satisfies JsonRpcResponse);
        }
      }

      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, [origin, post]);

    return (
      <iframe
        ref={iframeRef}
        src={`${origin}/`}
        {...iframeProps}
      />
    );
  },
);

// ---------------------------------------------------------------------------
// Native (Capacitor) implementation — uses a real <iframe> served by native
// ---------------------------------------------------------------------------

/**
 * Compute the iframe origin for native platforms.
 *
 * - iOS: `sbx://<sandbox-id>` — served by IframeSandboxSchemeHandler on the
 *   main WKWebView.
 * - Android: `https://<sandbox-id>.sandbox.native` — intercepted by the
 *   custom BridgeWebViewClient subclass.
 */
function getNativeOrigin(id: string): string {
  if (Capacitor.getPlatform() === 'ios') {
    return `sbx://${id}`;
  }
  // Android
  return `https://${id}.sandbox.native`;
}

const SandboxFrameNative = forwardRef<SandboxFrameHandle, SandboxFrameProps>(
  function SandboxFrameNative(
    { id, resolveFile, onRpc, injectedScripts, csp, onReady, className, style, ...iframeProps },
    ref,
  ) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const readyRef = useRef(false);
    const [loading, setLoading] = useState(true);

    const origin = useMemo(() => getNativeOrigin(id), [id]);

    // Keep latest callbacks in refs.
    const resolveFileRef = useRef(resolveFile);
    const onRpcRef = useRef(onRpc);
    const injectedScriptsRef = useRef(injectedScripts);
    const cspRef = useRef(csp);
    const onReadyRef = useRef(onReady);

    useEffect(() => { resolveFileRef.current = resolveFile; }, [resolveFile]);
    useEffect(() => { onRpcRef.current = onRpc; }, [onRpc]);
    useEffect(() => { injectedScriptsRef.current = injectedScripts; }, [injectedScripts]);
    useEffect(() => { cspRef.current = csp; }, [csp]);
    useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

    // -----------------------------------------------------------------
    // Post a message to the iframe via postMessage
    // -----------------------------------------------------------------

    const post = useCallback(
      (msg: Record<string, unknown>) => {
        iframeRef.current?.contentWindow?.postMessage(msg, '*');
      },
      [],
    );

    // Expose imperative handle.
    useImperativeHandle(
      ref,
      () => ({
        postMessage: (msg: Record<string, unknown>) => {
          post(msg);
        },
        focus: () => {
          iframeRef.current?.focus();
        },
      }),
      [post],
    );

    // -----------------------------------------------------------------
    // Handle fetch events from the native scheme handler
    // -----------------------------------------------------------------

    useEffect(() => {
      let cancelled = false;
      const listeners: Array<{ remove: () => void }> = [];

      async function setup() {
        // Register the fetch listener BEFORE doing anything else.
        // On Android, shouldInterceptRequest fires on a background thread
        // as soon as the iframe src is set — the listener must be ready.
        const fetchListener = await SandboxPlugin.addListener(
          'fetch',
          (event: SandboxFetchEvent) => {
            if (event.id !== id) return;
            handleNativeFetch(event);
          },
        );
        listeners.push(fetchListener);

        if (cancelled) return;

        // Run onReady (e.g. Android pre-fetches all blobs here).
        try {
          await onReadyRef.current?.();
        } catch (err) {
          console.error('[SandboxFrame] onReady failed:', err);
        }

        if (cancelled) return;

        // Now set the iframe src to start loading content.
        // This triggers native fetch interception.
        readyRef.current = true;
        if (iframeRef.current) {
          iframeRef.current.src = `${origin}/index.html`;
        }
      }

      async function handleNativeFetch(event: SandboxFetchEvent) {
        const reqUrl = event.request.url;

        let pathname: string;
        try {
          pathname = new URL(reqUrl).pathname;
        } catch {
          const pathMatch = reqUrl.match(/\/\/[^/]+(\/.*)/);
          pathname = pathMatch?.[1] ?? '/';
        }

        await handleFetchRequest(
          pathname,
          resolveFileRef.current,
          injectedScriptsRef.current ?? [],
          cspRef.current,
          (result) => {
            SandboxPlugin.respondToFetch({
              requestId: event.requestId,
              response: result as {
                status: number;
                statusText: string;
                headers: Record<string, string>;
                body: string | null;
              },
            }).catch((err) => {
              console.error('[SandboxFrame] respondToFetch failed:', err);
            });
          },
          (_code, message) => {
            SandboxPlugin.respondToFetch({
              requestId: event.requestId,
              response: {
                status: 500,
                statusText: 'Internal Error',
                headers: { 'Content-Type': 'text/plain' },
                body: btoa(message),
              },
            }).catch((err) => {
              console.error('[SandboxFrame] respondToFetch error failed:', err);
            });
          },
        );
      }

      setup().catch((err) => {
        console.error('[SandboxFrame] native setup failed:', err);
      });

      return () => {
        cancelled = true;
        for (const listener of listeners) {
          listener.remove();
        }
      };
    }, [id, origin]);

    // -----------------------------------------------------------------
    // Listen for postMessage from the iframe (RPC from injected scripts)
    // -----------------------------------------------------------------

    useEffect(() => {
      function onMessage(event: MessageEvent) {
        // On iOS the origin is "sbx://<id>", on Android "https://<id>.sandbox.native".
        if (event.origin !== origin) return;
        if (event.source !== iframeRef.current?.contentWindow) return;

        const msg = event.data;
        if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') return;

        // Handle RPC requests from injected scripts.
        if (msg.id !== undefined && msg.method && onRpcRef.current) {
          handleRpc(msg.id, msg.method, msg.params ?? {});
        }
      }

      async function handleRpc(
        rpcId: string | number,
        method: string,
        params: unknown,
      ) {
        try {
          const result = await onRpcRef.current!(method, params, post);
          post({ jsonrpc: '2.0', id: rpcId, result: result ?? null });
        } catch (err) {
          post({
            jsonrpc: '2.0',
            id: rpcId,
            error: { code: -1, message: String(err) },
          });
        }
      }

      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, [origin, post]);

    // Hide the spinner once the iframe fires its load event (initial HTML parsed).
    const handleLoad = useCallback(() => setLoading(false), []);

    // Don't set src initially — it's set after onReady completes in setup().
    return (
      <div className={className} style={{ ...style, position: 'relative' }}>
        <iframe
          ref={iframeRef}
          onLoad={handleLoad}
          style={{ width: '100%', height: '100%', border: 'none' }}
          {...iframeProps}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <Loader2 className="size-10 animate-spin text-primary/70" />
          </div>
        )}
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// Public component — delegates to web or native implementation
// ---------------------------------------------------------------------------

/**
 * Renders a sandboxed content frame.
 *
 * On web, this creates an iframe on a unique subdomain (`<id>.<sandboxDomain>`)
 * and implements the iframe.diy handshake + fetch proxy protocol.
 *
 * On native platforms (iOS/Android via Capacitor), this creates a regular
 * `<iframe>` element whose requests are intercepted by native code:
 *   - iOS: WKURLSchemeHandler for the `sbx` scheme on the main WKWebView
 *   - Android: Custom BridgeWebViewClient intercepting `*.sandbox.native`
 *
 * Each sandbox gets a unique origin (via hostname), so localStorage/IndexedDB
 * are isolated per sandbox. Since the sandbox is a regular DOM element, web UI
 * (permission dialogs, popovers) naturally layers on top.
 *
 * All file serving is delegated to the `resolveFile` callback.
 * Custom RPC methods are delegated to the optional `onRpc` callback.
 * Consumers (Webxdc, NsitePreviewDialog) are platform-agnostic.
 */
export const SandboxFrame = forwardRef<SandboxFrameHandle, SandboxFrameProps>(
  function SandboxFrame(props, ref) {
    if (Capacitor.isNativePlatform()) {
      return <SandboxFrameNative ref={ref} {...props} />;
    }
    return <SandboxFrameWeb ref={ref} {...props} />;
  },
);

export default SandboxFrame;
