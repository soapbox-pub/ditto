import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  type IframeHTMLAttributes,
} from 'react';

import { Capacitor } from '@capacitor/core';

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
  type SandboxScriptMessageEvent,
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
// Native (Capacitor) implementation
// ---------------------------------------------------------------------------

const SandboxFrameNative = forwardRef<SandboxFrameHandle, SandboxFrameProps>(
  function SandboxFrameNative(
    { id, resolveFile, onRpc, injectedScripts, csp, onReady, className, style, title },
    ref,
  ) {
    const placeholderRef = useRef<HTMLDivElement>(null);
    const createdRef = useRef(false);
    const destroyedRef = useRef(false);

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
    // Post a message into the native sandbox
    // -----------------------------------------------------------------

    const postToSandbox = useCallback(
      (msg: Record<string, unknown>) => {
        if (!createdRef.current || destroyedRef.current) return;
        SandboxPlugin.postMessage({ id, message: msg }).catch((err) => {
          console.error('[SandboxFrame] postMessage failed:', err);
        });
      },
      [id],
    );

    // Expose imperative handle.
    useImperativeHandle(
      ref,
      () => ({
        postMessage: (msg: Record<string, unknown>) => {
          postToSandbox(msg);
        },
        focus: () => {
          // No-op on native — the WebView is overlaid, not an iframe.
        },
      }),
      [postToSandbox],
    );

    // -----------------------------------------------------------------
    // Lifecycle: onReady -> create WebView -> listen for events -> destroy
    // -----------------------------------------------------------------

    useEffect(() => {
      if (createdRef.current) return;

      const listeners: Array<{ remove: () => void }> = [];
      let cancelled = false;

      async function setup() {
        // Measure the placeholder position.
        const el = placeholderRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();

        // Register listeners BEFORE creating the WebView. On Android,
        // `shouldInterceptRequest` fires on a background thread as soon
        // as the WebView starts loading — if the fetch listener isn't
        // registered yet, the event is lost and the request times out
        // (the thread blocks via CountDownLatch waiting for a response
        // that never arrives).
        const fetchListener = await SandboxPlugin.addListener(
          'fetch',
          (event: SandboxFetchEvent) => {
            if (event.id !== id) return;
            handleNativeFetch(event);
          },
        );
        listeners.push(fetchListener);

        const scriptListener = await SandboxPlugin.addListener(
          'scriptMessage',
          (event: SandboxScriptMessageEvent) => {
            if (event.id !== id) return;
            handleNativeScriptMessage(event);
          },
        );
        listeners.push(scriptListener);

        if (cancelled || destroyedRef.current) return;

        // Create the native WebView with a loading spinner — does NOT
        // navigate yet, so no fetch events fire at this point.
        await SandboxPlugin.create({
          id,
          frame: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });

        if (cancelled || destroyedRef.current) {
          SandboxPlugin.destroy({ id }).catch(() => {});
          return;
        }

        createdRef.current = true;

        // Run onReady while the spinner is visible and animating.
        // On Android this pre-fetches all blobs so every resolveFile call
        // after navigation is an instant cache hit.
        // On iOS/web this is typically a no-op or instant.
        try {
          await onReadyRef.current?.();
        } catch (err) {
          console.error('[SandboxFrame] onReady failed:', err);
        }

        if (cancelled || destroyedRef.current) return;

        // Start loading the sandbox content — fetch events will now fire
        // and be handled by the listeners registered above.
        await SandboxPlugin.navigate({ id });
      }

      // ---------------------------------------------------------------
      // Handle a fetch request from the native WebView
      // ---------------------------------------------------------------

      async function handleNativeFetch(event: SandboxFetchEvent) {
        const reqUrl = event.request.url;

        let pathname: string;
        try {
          pathname = new URL(reqUrl).pathname;
        } catch {
          // The native handler rewrites custom-scheme URLs to
          // https://<id>.sandbox.native/<path> so we can parse them.
          // If that fails, try extracting the path directly.
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
              id,
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
              id,
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

      // ---------------------------------------------------------------
      // Handle a script message from the native WebView
      // ---------------------------------------------------------------

      async function handleNativeScriptMessage(event: SandboxScriptMessageEvent) {
        const msg = event.message;
        if (!msg || typeof msg !== 'object') return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rpc = msg as any;
        if (rpc.jsonrpc !== '2.0') return;

        // Handle RPC requests (have both `id` and `method`).
        if (rpc.id !== undefined && rpc.method && onRpcRef.current) {
          try {
            const result = await onRpcRef.current(
              rpc.method,
              rpc.params ?? {},
              postToSandbox,
            );
            postToSandbox({
              jsonrpc: '2.0',
              id: rpc.id,
              result: result ?? null,
            });
          } catch (err) {
            postToSandbox({
              jsonrpc: '2.0',
              id: rpc.id,
              error: { code: -1, message: String(err) },
            });
          }
        }
      }

      setup().catch((err) => {
        console.error('[SandboxFrame] native setup failed:', err);
      });

      return () => {
        cancelled = true;
        destroyedRef.current = true;
        for (const listener of listeners) {
          listener.remove();
        }
        if (createdRef.current) {
          SandboxPlugin.destroy({ id }).catch((err) => {
            console.error('[SandboxFrame] destroy failed:', err);
          });
          createdRef.current = false;
        }
      };
    }, [id, postToSandbox]);

    // -----------------------------------------------------------------
    // Keep frame in sync with placeholder size/position
    //
    // Both consumers (WebxdcEmbed, NsitePreviewDialog) render inside
    // position:fixed panels, so the placeholder never moves on scroll.
    // A ResizeObserver is sufficient to track layout changes.
    // -----------------------------------------------------------------

    useEffect(() => {
      const el = placeholderRef.current;
      if (!el) return;

      function updateFrame() {
        if (!createdRef.current || destroyedRef.current) return;
        const rect = el!.getBoundingClientRect();
        SandboxPlugin.updateFrame({
          id,
          frame: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        }).catch(() => {
          // Ignore — WebView may not be created yet.
        });
      }

      const ro = new ResizeObserver(updateFrame);
      ro.observe(el);

      return () => {
        ro.disconnect();
      };
    }, [id]);

    return (
      <div
        ref={placeholderRef}
        className={className}
        style={style}
        title={title}
        data-sandbox-id={id}
      />
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
 * On native platforms (iOS/Android via Capacitor), this creates a native
 * WKWebView/WebView overlay with a custom URL scheme handler that intercepts
 * all requests and routes them through the same `resolveFile` callback.
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
