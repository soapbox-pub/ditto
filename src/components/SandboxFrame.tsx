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
  /** Called after the ready → init handshake completes. */
  onReady?: () => void;
}

/** Imperative handle exposed via ref. */
export interface SandboxFrameHandle {
  /** Send a postMessage to the sandbox iframe. */
  postMessage: (msg: Record<string, unknown>, transfer?: Transferable[]) => void;
  /** Focus the iframe element. */
  focus: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders an iframe sandbox on a unique subdomain (`<id>.<sandboxDomain>`)
 * and implements the sandbox handshake + fetch proxy protocol.
 *
 * All file serving is delegated to the `resolveFile` callback.
 * Custom RPC methods are delegated to the optional `onRpc` callback.
 *
 * The sandbox domain is read from `AppConfig.sandboxDomain` (default:
 * `iframe.diy`). This is the single component that would be swapped out
 * for a native implementation on Capacitor builds.
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

        // Notification: ready → respond with init
        if (msg.method === 'ready' && msg.id === undefined) {
          post({ jsonrpc: '2.0', method: 'init', params: { version: 1 } });
          onReadyRef.current?.();
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
      // Fetch handler
      // ---------------------------------------------------------------

      async function handleFetch(id: string | number, params: { request?: SerialisedRequest }) {
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

        const scripts = injectedScriptsRef.current ?? [];
        const activeCsp = cspRef.current;

        // Check if the request is for a virtual injected script.
        const virtualScript = scripts.find((s) => pathname === `/${s.path}` || pathname === s.path);
        if (virtualScript) {
          const headers: Record<string, string> = {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-cache',
          };
          if (activeCsp) headers['Content-Security-Policy'] = activeCsp;

          post({
            jsonrpc: '2.0',
            id,
            result: {
              status: 200,
              statusText: 'OK',
              headers,
              body: utf8ToBase64(virtualScript.content),
            },
          });
          return;
        }

        // Delegate to the consumer's file resolver.
        try {
          const file = await resolveFileRef.current(pathname);

          if (!file) {
            const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
            if (activeCsp) headers['Content-Security-Policy'] = activeCsp;

            post({
              jsonrpc: '2.0',
              id,
              result: {
                status: 404,
                statusText: 'Not Found',
                headers,
                body: utf8ToBase64('Not Found'),
              },
            });
            return;
          }

          // For HTML responses, inject script tags.
          let bodyBase64: string;
          if (file.contentType === 'text/html' && scripts.length > 0) {
            const html = new TextDecoder().decode(file.body);
            const injected = injectScriptTags(html, scripts.map((s) => `/${s.path}`));
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

          post({
            jsonrpc: '2.0',
            id,
            result: {
              status: file.status,
              statusText: 'OK',
              headers,
              body: bodyBase64,
            },
          });
        } catch (err) {
          post({
            jsonrpc: '2.0',
            id,
            error: { code: -32002, message: String(err) },
          });
        }
      }

      // ---------------------------------------------------------------
      // Custom RPC handler
      // ---------------------------------------------------------------

      async function handleRpc(id: string | number, method: string, params: unknown) {
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

export default SandboxFrame;
