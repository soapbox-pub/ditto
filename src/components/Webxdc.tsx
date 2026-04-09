import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type IframeHTMLAttributes,
} from 'react';
import { unzipSync } from 'fflate';

import type { Webxdc as WebxdcAPI, ReceivedStatusUpdate } from '@webxdc/types/webxdc';

import { SandboxFrame, type SandboxFrameHandle } from '@/components/SandboxFrame';
import { getMimeType, bytesToBase64, injectScriptTags } from '@/lib/sandbox';
import type { FileResponse } from '@/lib/sandbox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebxdcProps
  extends Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'src' | 'id'> {
  /** Unique session identifier — used as the sandbox subdomain. */
  id: string;
  /** The `.xdc` archive: raw bytes or a URL to fetch them from. */
  xdc: Uint8Array | string;
  /** A `Webxdc` instance that backs the iframe's webxdc API calls. */
  webxdc: WebxdcAPI<unknown>;
}

/** Imperative handle exposed by the Webxdc component. */
export interface WebxdcHandle {
  /** Send a postMessage to the iframe (used for synthetic keyboard events). */
  postMessage: (msg: Record<string, unknown>, transfer?: Transferable[]) => void;
  /** Focus the iframe element. */
  focus: () => void;
}

// ---------------------------------------------------------------------------
// CSP applied to every response served from the archive.
//
// The webxdc spec requires that all internet access is denied. We enforce
// this with a strict Content-Security-Policy on every response. Permits
// same-origin, inline, eval, wasm, data: and blob: — all commonly needed
// by webxdc apps — but blocks any external network access.
// ---------------------------------------------------------------------------

const WEBXDC_CSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' data: blob:",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve `xdc` prop to a Uint8Array. */
async function resolveXdc(xdc: Uint8Array | string): Promise<Uint8Array> {
  if (typeof xdc === 'string') {
    const res = await fetch(xdc);
    if (!res.ok) throw new Error(`Failed to fetch xdc: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return xdc;
}

/** Unzip a `.xdc` archive into a normalised file map. */
function unzipXdc(bytes: Uint8Array): Map<string, Uint8Array> {
  const unzipped = unzipSync(bytes);
  const fileMap = new Map<string, Uint8Array>();
  for (const [path, content] of Object.entries(unzipped)) {
    const normalised = path.replace(/^\/+/, '').replace(/\\/g, '/');
    if (normalised.endsWith('/')) continue; // skip directories
    fileMap.set(normalised, content);
  }
  return fileMap;
}

/**
 * Generate the webxdc bridge script that will be injected into HTML responses.
 * This script implements window.webxdc by sending JSON-RPC requests to the
 * parent through the sandbox frame's relay.
 */
function generateWebxdcBridge(api: WebxdcAPI<unknown>): string {
  return `(function(){
  var nextId = 1;
  var pending = {};
  var updateListener = null;
  var updateListenerReady = null;
  var realtimeDataListener = null;
  var realtimeChannelId = null;

  function send(msg) {
    window.parent.postMessage(msg, "*");
  }

  function sendRequest(method, params) {
    var id = nextId++;
    return new Promise(function(resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      send({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }

  function sendNotification(method, params) {
    send({ jsonrpc: "2.0", method: method, params: params });
  }

  window.addEventListener("message", function(event) {
    var data = event.data;
    if (!data || typeof data !== "object" || data.jsonrpc !== "2.0") return;

    // JSON-RPC response
    if (data.id !== undefined && !data.method) {
      var p = pending[data.id];
      if (p) {
        delete pending[data.id];
        if (data.error) {
          p.reject(new Error(data.error.message));
        } else {
          p.resolve(data.result);
        }
      }
      return;
    }

    // Notifications from parent
    if (data.method && data.id === undefined) {
      switch (data.method) {
        case "webxdc.update":
          if (updateListener) updateListener(data.params.update);
          break;
        case "webxdc.realtimeChannel.data":
          if (realtimeDataListener) realtimeDataListener(new Uint8Array(data.params.data));
          break;
        case "webxdc.keyboard":
          var p2 = data.params;
          var evt = new KeyboardEvent(p2.type, {
            key: p2.key, code: p2.code, keyCode: p2.keyCode,
            bubbles: true, cancelable: true, composed: true
          });
          window.dispatchEvent(evt);
          document.dispatchEvent(new KeyboardEvent(p2.type, {
            key: p2.key, code: p2.code, keyCode: p2.keyCode,
            bubbles: true, cancelable: true
          }));
          break;
      }
    }
  });

  window.webxdc = {
    selfAddr: ${JSON.stringify(api.selfAddr)},
    selfName: ${JSON.stringify(api.selfName)},
    sendUpdateInterval: ${api.sendUpdateInterval},
    sendUpdateMaxSize: ${api.sendUpdateMaxSize},

    sendUpdate: function(update, descr) {
      sendRequest("webxdc.sendUpdate", { update: update, descr: descr });
    },

    setUpdateListener: function(cb, serial) {
      updateListener = cb;
      return new Promise(function(resolve) {
        updateListenerReady = resolve;
        sendRequest("webxdc.setUpdateListener", { serial: serial || 0 }).then(function() {
          if (updateListenerReady) { updateListenerReady(); updateListenerReady = null; }
        });
      });
    },

    getAllUpdates: function() {
      return sendRequest("webxdc.getAllUpdates");
    },

    sendToChat: function(message) {
      return sendRequest("webxdc.sendToChat", { message: message });
    },

    importFiles: function(filter) {
      return sendRequest("webxdc.importFiles", { filter: filter || {} });
    },

    joinRealtimeChannel: function() {
      if (realtimeChannelId) throw new Error("Already joined a realtime channel. Leave first.");
      var channelIdPromise = sendRequest("webxdc.joinRealtimeChannel");
      var joined = true;
      channelIdPromise.then(function(r) { realtimeChannelId = r.channelId; });
      return {
        setListener: function(cb) {
          if (!joined) throw new Error("Channel has been left.");
          realtimeDataListener = cb;
        },
        send: function(data) {
          if (!joined) throw new Error("Channel has been left.");
          channelIdPromise.then(function(r) {
            sendRequest("webxdc.realtimeChannel.send", { channelId: r.channelId, data: Array.from(data) });
          });
        },
        leave: function() {
          if (!joined) return;
          joined = false;
          realtimeDataListener = null;
          channelIdPromise.then(function(r) {
            sendRequest("webxdc.realtimeChannel.leave", { channelId: r.channelId });
            realtimeChannelId = null;
          });
        }
      };
    }
  };
})();`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a webxdc app inside a sandboxed iframe.
 *
 * The component handles the full lifecycle:
 *  1. Fetches and unzips the `.xdc` archive on the parent side.
 *  2. Serves files from the archive via the sandbox frame's fetch proxy.
 *  3. Injects the webxdc bridge script into HTML responses.
 *  4. Handles `webxdc.*` RPC requests from the bridge script and proxies
 *     them to the provided `WebxdcAPI` instance.
 */
export const Webxdc = forwardRef<WebxdcHandle, WebxdcProps>(function Webxdc(
  { id, xdc, webxdc, ...iframeProps },
  ref,
) {
  const sandboxRef = useRef<SandboxFrameHandle>(null);

  // Keep latest props in refs so callbacks always see current values.
  const webxdcRef = useRef(webxdc);
  const xdcRef = useRef(xdc);
  useEffect(() => { webxdcRef.current = webxdc; }, [webxdc]);
  useEffect(() => { xdcRef.current = xdc; }, [xdc]);

  // The unzipped file map, populated on first `onReady`.
  const fileMapRef = useRef<Map<string, Uint8Array> | null>(null);
  // The generated bridge script, cached per webxdc instance.
  const bridgeScriptRef = useRef<string>('');

  // Realtime channel handles, keyed by channelId.
  const realtimeChannels = useRef<
    Map<string, ReturnType<WebxdcAPI<unknown>['joinRealtimeChannel']>>
  >(new Map());

  // Expose imperative handle so parent components can post messages and focus.
  useImperativeHandle(ref, () => ({
    postMessage: (msg: Record<string, unknown>, transfer?: Transferable[]) => {
      sandboxRef.current?.postMessage(msg, transfer);
    },
    focus: () => {
      sandboxRef.current?.focus();
    },
  }), []);

  // Clean up realtime channels on unmount.
  useEffect(() => {
    const channels = realtimeChannels.current;
    return () => {
      for (const ch of channels.values()) ch.leave();
      channels.clear();
    };
  }, []);

  // -----------------------------------------------------------------
  // onReady: fetch and unzip the archive when the sandbox is ready
  // -----------------------------------------------------------------

  const onReady = useCallback(async () => {
    try {
      const bytes = await resolveXdc(xdcRef.current);
      fileMapRef.current = unzipXdc(bytes);
      bridgeScriptRef.current = generateWebxdcBridge(webxdcRef.current);
    } catch (err) {
      console.error('[Webxdc] Failed to initialise:', err);
    }
  }, []);

  // -----------------------------------------------------------------
  // File resolver: serve files from the unzipped archive
  // -----------------------------------------------------------------

  const resolveFile = useCallback(async (pathname: string): Promise<FileResponse | null> => {
    const fileMap = fileMapRef.current;
    if (!fileMap) {
      // Archive not loaded yet — return a 503.
      return {
        status: 503,
        contentType: 'text/plain',
        body: new TextEncoder().encode('Archive not loaded'),
      };
    }

    // Normalise: "/" and "/index.html" both resolve to "index.html".
    const filePath =
      pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));

    const fileBytes = fileMap.get(filePath);
    if (!fileBytes) return null;

    const contentType = getMimeType(filePath);
    return { status: 200, contentType, body: fileBytes };
  }, []);

  // -----------------------------------------------------------------
  // File resolver with bridge script injection
  //
  // The webxdc bridge is generated dynamically in onReady (it embeds
  // runtime values like selfAddr), so we can't use SandboxFrame's
  // static injectedScripts prop. Instead we:
  //  1. Serve /webxdc.js ourselves from bridgeScriptRef
  //  2. Inject <script src="/webxdc.js"> into HTML responses here
  // -----------------------------------------------------------------

  const resolveFileWithBridge = useCallback(async (pathname: string): Promise<FileResponse | null> => {
    // Serve the virtual webxdc bridge script.
    if (pathname === '/webxdc.js') {
      return {
        status: 200,
        contentType: 'application/javascript',
        body: new TextEncoder().encode(bridgeScriptRef.current),
      };
    }

    const file = await resolveFile(pathname);
    if (!file) return null;

    // Inject <script src="/webxdc.js"> into HTML responses.
    if (file.contentType.includes('text/html')) {
      const html = new TextDecoder().decode(file.body);
      const injected = injectScriptTags(html, ['/webxdc.js']);
      return { ...file, body: new TextEncoder().encode(injected) };
    }

    return file;
  }, [resolveFile]);

  // -----------------------------------------------------------------
  // Custom RPC handler: webxdc.* methods
  // -----------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onRpc = useCallback(async (method: string, params: any, post: (msg: Record<string, unknown>) => void): Promise<unknown> => {
    const api = webxdcRef.current;

    switch (method) {
      case 'webxdc.sendUpdate': {
        api.sendUpdate(params.update, '');
        return null;
      }

      case 'webxdc.setUpdateListener': {
        const serial: number = params.serial ?? 0;
        // Forward every update into the frame as a notification.
        await api.setUpdateListener(
          (update: ReceivedStatusUpdate<unknown>) => {
            post({
              jsonrpc: '2.0',
              method: 'webxdc.update',
              params: { update },
            });
          },
          serial,
        );
        return null;
      }

      case 'webxdc.getAllUpdates': {
        return await api.getAllUpdates();
      }

      case 'webxdc.sendToChat': {
        await api.sendToChat(params.message);
        return null;
      }

      case 'webxdc.importFiles': {
        const files = await api.importFiles(params.filter ?? {});
        // File objects can't be serialised — convert to transferable form.
        return await Promise.all(
          files.map(async (f) => ({
            name: f.name,
            type: f.type,
            data: bytesToBase64(new Uint8Array(await f.arrayBuffer())),
          })),
        );
      }

      case 'webxdc.joinRealtimeChannel': {
        const rt = api.joinRealtimeChannel();
        const channelId = crypto.randomUUID();

        rt.setListener((data: Uint8Array) => {
          post({
            jsonrpc: '2.0',
            method: 'webxdc.realtimeChannel.data',
            params: { channelId, data: Array.from(data) },
          });
        });

        realtimeChannels.current.set(channelId, rt);
        return { channelId };
      }

      case 'webxdc.realtimeChannel.send': {
        const ch = realtimeChannels.current.get(params.channelId);
        if (ch) ch.send(new Uint8Array(params.data));
        return null;
      }

      case 'webxdc.realtimeChannel.leave': {
        const ch = realtimeChannels.current.get(params.channelId);
        if (ch) {
          ch.leave();
          realtimeChannels.current.delete(params.channelId);
        }
        return null;
      }

      default:
        throw new Error(`Method not found: ${method}`);
    }
  }, []);

  return (
    <SandboxFrame
      ref={sandboxRef}
      id={id}
      resolveFile={resolveFileWithBridge}
      onRpc={onRpc}
      csp={WEBXDC_CSP}
      onReady={onReady}
      {...iframeProps}
    />
  );
});

export default Webxdc;
