import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
  type IframeHTMLAttributes,
} from 'react';

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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SandboxFrameProps
  extends Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'src' | 'id' | 'sandbox'> {
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
// Shared fetch request handler
// ---------------------------------------------------------------------------

/**
 * Build a serialised HTTP response and call `respond` with it.
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
// Permissions Policy — capabilities delegated to the sandbox iframe
// ---------------------------------------------------------------------------

/**
 * Broad permissions-policy grant for sandbox iframes.
 *
 * A cross-origin iframe is blocked from most capability APIs unless the
 * parent explicitly delegates them via `allow="…"`. We grant every
 * directive that a general-purpose web app might legitimately use so
 * nsites and webxdc apps can access media, sensors, downloads, etc.
 *
 * **Deliberately omitted** — capabilities whose UX or security guarantees
 * make them unsafe to expose to untrusted third-party content:
 *   - `payment`                        — Payment Request autofill, charge-the-user risk.
 *   - `publickey-credentials-get/create` — WebAuthn/passkey phishing.
 *   - `otp-credentials`                — WebOTP SMS-code autofill (account takeover).
 *   - `identity-credentials-get`       — FedCM federated login phishing.
 *   - `local-fonts`                    — High-entropy fingerprinting, no real utility.
 *
 * **Also omitted — require more thought before enabling:**
 *   - `bluetooth`, `hid`, `serial`, `usb` — Raw device APIs (even though user-gesture gated).
 *   - `clipboard-read`                 — Passive clipboard read (allowed by gesture but omitted for now).
 */
const SANDBOX_ALLOW = [
  'accelerometer',
  'ambient-light-sensor',
  'autoplay',
  'battery',
  'camera',
  'clipboard-write',
  'compute-pressure',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'gamepad',
  'geolocation',
  'gyroscope',
  'idle-detection',
  'keyboard-map',
  'magnetometer',
  'microphone',
  'midi',
  'picture-in-picture',
  'screen-wake-lock',
  'speaker-selection',
  'storage-access',
  'web-share',
  'window-management',
  'xr-spatial-tracking',
].join('; ');

// ---------------------------------------------------------------------------
// SandboxFrame — iframe.diy implementation
// ---------------------------------------------------------------------------

/**
 * Renders a sandboxed content frame.
 *
 * Creates an iframe on a unique subdomain (`<id>.<sandboxDomain>`) and
 * implements the iframe.diy handshake + fetch proxy protocol. The same
 * implementation runs on web and inside Capacitor's WKWebView (iOS) /
 * WebView (Android), since the WebView handles iframe.diy's Service Worker
 * and cross-origin subdomain isolation the same way a browser does.
 *
 * All file serving is delegated to the `resolveFile` callback.
 * Custom RPC methods are delegated to the optional `onRpc` callback.
 * Consumers (Webxdc, NsitePreviewDialog) are platform-agnostic.
 */
export const SandboxFrame = forwardRef<SandboxFrameHandle, SandboxFrameProps>(
  function SandboxFrame(
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
        allow={SANDBOX_ALLOW}
        // Defense-in-depth on top of the cross-origin subdomain isolation.
        // - allow-scripts + allow-same-origin: required for apps to run JS and
        //   use origin-keyed storage (localStorage, IndexedDB) and to register
        //   the iframe.diy Service Worker that proxies fetches. Because the
        //   iframe lives on a distinct HMAC-derived subdomain, it is still a
        //   different origin from the parent app.
        // - allow-forms / allow-modals / allow-popups(+escape-sandbox) /
        //   allow-downloads: normal web-app affordances (form submission,
        //   alert/confirm/prompt, opening links in new tabs, exporting files)
        //   that webxdc/nsite content may legitimately rely on.
        // Notably omitted: allow-top-navigation (prevents window.top.location
        // phishing redirects) and allow-pointer-lock / allow-presentation /
        // allow-orientation-lock (unused niche capabilities).
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
        {...iframeProps}
      />
    );
  },
);

export default SandboxFrame;
