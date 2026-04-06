import {
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type IframeHTMLAttributes,
} from "react";
import { unzipSync } from "fflate";

import type { Webxdc as WebxdcAPI, ReceivedStatusUpdate } from "@webxdc/types/webxdc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebxdcProps
  extends Omit<IframeHTMLAttributes<HTMLIFrameElement>, "src" | "id"> {
  /** Unique session identifier — used as the subdomain: `<id>.iframe.diy`. */
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
// MIME type lookup (covers common web-relevant file types)
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html", ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript", ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".ico": "image/x-icon", ".bmp": "image/bmp", ".avif": "image/avif",
  ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
  ".opus": "audio/opus", ".weba": "audio/webm",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".xml": "application/xml", ".txt": "text/plain",
  ".wasm": "application/wasm", ".pdf": "application/pdf",
  ".toml": "application/toml",
};

function getMimeType(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  const ext = path.slice(dot).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve `xdc` prop to a Uint8Array. */
async function resolveXdc(xdc: Uint8Array | string): Promise<Uint8Array> {
  if (typeof xdc === "string") {
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
    const normalised = path.replace(/^\/+/, "").replace(/\\/g, "/");
    if (normalised.endsWith("/")) continue; // skip directories
    fileMap.set(normalised, content);
  }
  return fileMap;
}

/** Encode a Uint8Array to base64. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Encode a UTF-8 string to base64. */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64(bytes);
}

/**
 * Generate the webxdc bridge script that will be injected into HTML responses.
 * This script implements window.webxdc by sending JSON-RPC requests to the
 * parent (Ditto) through iframe.diy's relay.
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

/** Virtual path used to serve the webxdc bridge script. */
const BRIDGE_SCRIPT_PATH = "webxdc.js";

/**
 * Inject a `<script src="/webxdc.js">` tag into an HTML document string.
 * Uses DOMParser so we don't rely on fragile regex against HTML.
 * The tag is prepended inside `<head>` so it runs before any app scripts.
 */
function injectScriptTag(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const script = doc.createElement("script");
  script.src = `/${BRIDGE_SCRIPT_PATH}`;
  // Prepend as first child of <head> so it loads before the app's own scripts.
  doc.head.prepend(script);
  // Serialise back to an HTML string.  doctype is lost by DOMParser, so
  // we re-add it when the original document had one.
  const hasDoctype = /^<!doctype\s/i.test(html.trimStart());
  const serialised = doc.documentElement.outerHTML;
  return hasDoctype ? "<!DOCTYPE html>\n" + serialised : serialised;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a webxdc app inside an iframe hosted on `<id>.iframe.diy`.
 *
 * The component handles the full lifecycle:
 *  1. Waits for `ready` from the iframe.diy frame.
 *  2. Fetches and unzips the `.xdc` archive on the parent side.
 *  3. Sends `init` to signal the frame to start.
 *  4. Responds to `fetch` RPC requests by serving files from the archive,
 *     injecting the webxdc bridge script into HTML responses.
 *  5. Handles `webxdc.*` RPC requests from the bridge script (relayed by
 *     iframe.diy) and proxies them to the provided `WebxdcAPI` instance.
 */
export const Webxdc = forwardRef<WebxdcHandle, WebxdcProps>(function Webxdc(
  { id, xdc, webxdc, ...iframeProps },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Keep latest props in refs so the message handler always sees current values
  // without needing to re-register the listener.
  const webxdcRef = useRef(webxdc);
  const xdcRef = useRef(xdc);
  useEffect(() => {
    webxdcRef.current = webxdc;
  }, [webxdc]);
  useEffect(() => {
    xdcRef.current = xdc;
  }, [xdc]);

  // The unzipped file map, populated on first `ready` message.
  const fileMapRef = useRef<Map<string, Uint8Array> | null>(null);
  // The generated bridge script, cached per webxdc instance.
  const bridgeScriptRef = useRef<string>("");

  const origin = `https://${id}.iframe.diy`;

  // ------------------------------------------------------------------
  // Post a JSON-RPC message to the iframe
  // ------------------------------------------------------------------
  const post = useCallback(
    (msg: Record<string, unknown>, transfer?: Transferable[]) => {
      iframeRef.current?.contentWindow?.postMessage(
        msg,
        origin,
        transfer ?? [],
      );
    },
    [origin],
  );

  // Expose imperative handle so parent components can post messages and focus.
  useImperativeHandle(ref, () => ({
    postMessage: (msg: Record<string, unknown>, transfer?: Transferable[]) => {
      iframeRef.current?.contentWindow?.postMessage(
        msg,
        origin,
        transfer ?? [],
      );
    },
    focus: () => {
      iframeRef.current?.focus();
    },
  }), [origin]);

  // ------------------------------------------------------------------
  // Handle messages coming from the iframe
  // ------------------------------------------------------------------
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Only accept messages from our iframe's origin.
      if (event.origin !== origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = event.data as any;
      if (!msg || msg.jsonrpc !== "2.0") return;

      // --- Notification: ready → fetch xdc, unzip, send init -----------
      if (msg.method === "ready" && msg.id === undefined) {
        handleReady();
        return;
      }

      // --- Requests (have an `id`) ------------------------------------
      if (msg.id !== undefined && msg.method) {
        if (msg.method === "fetch") {
          handleFetch(msg.id, msg.params);
        } else {
          // webxdc.* RPC methods relayed from the bridge script
          handleWebxdcRequest(msg.id, msg.method, msg.params ?? {});
        }
      }
    }

    async function handleReady() {
      try {
        // Fetch and unzip the .xdc archive on the parent side.
        const bytes = await resolveXdc(xdcRef.current);
        fileMapRef.current = unzipXdc(bytes);

        // Generate the bridge script with current webxdc API values.
        bridgeScriptRef.current = generateWebxdcBridge(webxdcRef.current);

        // Send init notification (iframe.diy protocol).
        post({
          jsonrpc: "2.0",
          method: "init",
          params: { version: 1 },
        });
      } catch (err) {
        console.error("[Webxdc] Failed to initialise:", err);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function handleFetch(id: string | number, params: any) {
      const reqUrl: string | undefined = params?.request?.url;
      if (!reqUrl) {
        post({ jsonrpc: "2.0", id, error: { code: -32001, message: "Invalid request" } });
        return;
      }

      let pathname: string;
      try {
        pathname = new URL(reqUrl).pathname;
      } catch {
        post({ jsonrpc: "2.0", id, error: { code: -32003, message: "Invalid URL" } });
        return;
      }

      const fileMap = fileMapRef.current;
      if (!fileMap) {
        post({
          jsonrpc: "2.0", id,
          result: {
            status: 503, statusText: "Not Ready",
            headers: { "Content-Type": "text/plain" },
            body: utf8ToBase64("Archive not loaded"),
          },
        });
        return;
      }

      // Normalise: "/" and "/index.html" both resolve to "index.html".
      const filePath =
        pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));

      // Serve the virtual webxdc bridge script.
      if (filePath === BRIDGE_SCRIPT_PATH) {
        post({
          jsonrpc: "2.0", id,
          result: {
            status: 200, statusText: "OK",
            headers: { "Content-Type": "application/javascript", "Cache-Control": "no-cache" },
            body: utf8ToBase64(bridgeScriptRef.current),
          },
        });
        return;
      }

      const fileBytes = fileMap.get(filePath);
      if (!fileBytes) {
        post({
          jsonrpc: "2.0", id,
          result: {
            status: 404, statusText: "Not Found",
            headers: { "Content-Type": "text/plain" },
            body: utf8ToBase64("Not Found: " + pathname),
          },
        });
        return;
      }

      const contentType = getMimeType(filePath);

      // Inject a <script src="/webxdc.js"> tag into HTML responses.
      if (contentType.includes("text/html")) {
        const html = new TextDecoder().decode(fileBytes);
        const injected = injectScriptTag(html);
        post({
          jsonrpc: "2.0", id,
          result: {
            status: 200, statusText: "OK",
            headers: { "Content-Type": contentType, "Cache-Control": "no-cache" },
            body: utf8ToBase64(injected),
          },
        });
      } else {
        post({
          jsonrpc: "2.0", id,
          result: {
            status: 200, statusText: "OK",
            headers: {
              "Content-Type": contentType,
              "Content-Length": String(fileBytes.byteLength),
            },
            body: bytesToBase64(fileBytes),
          },
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function handleWebxdcRequest(id: string | number, method: string, params: any) {
      const api = webxdcRef.current;

      const respond = (result: unknown) =>
        post({ jsonrpc: "2.0", id, result });
      const respondError = (code: number, message: string) =>
        post({ jsonrpc: "2.0", id, error: { code, message } });

      try {
        switch (method) {
          case "webxdc.sendUpdate": {
            api.sendUpdate(params.update, "");
            respond(null);
            break;
          }

          case "webxdc.setUpdateListener": {
            const serial: number = params.serial ?? 0;
            // Forward every update into the frame as a notification.
            await api.setUpdateListener(
              (update: ReceivedStatusUpdate<unknown>) => {
                post({
                  jsonrpc: "2.0",
                  method: "webxdc.update",
                  params: { update },
                });
              },
              serial,
            );
            respond(null);
            break;
          }

          case "webxdc.getAllUpdates": {
            const updates = await api.getAllUpdates();
            respond(updates);
            break;
          }

          case "webxdc.sendToChat": {
            await api.sendToChat(params.message);
            respond(null);
            break;
          }

          case "webxdc.importFiles": {
            const files = await api.importFiles(params.filter ?? {});
            // File objects can't be serialised — convert to transferable form.
            const result = await Promise.all(
              files.map(async (f) => ({
                name: f.name,
                type: f.type,
                data: bytesToBase64(new Uint8Array(await f.arrayBuffer())),
              })),
            );
            respond(result);
            break;
          }

          case "webxdc.joinRealtimeChannel": {
            const rt = api.joinRealtimeChannel();
            // Generate a channel id to track this listener.
            const channelId = crypto.randomUUID();

            rt.setListener((data: Uint8Array) => {
              post({
                jsonrpc: "2.0",
                method: "webxdc.realtimeChannel.data",
                params: { channelId, data: Array.from(data) },
              });
            });

            // Store on ref so subsequent calls can find it.
            realtimeChannels.current.set(channelId, rt);
            respond({ channelId });
            break;
          }

          case "webxdc.realtimeChannel.send": {
            const ch = realtimeChannels.current.get(params.channelId);
            if (ch) ch.send(new Uint8Array(params.data));
            respond(null);
            break;
          }

          case "webxdc.realtimeChannel.leave": {
            const ch = realtimeChannels.current.get(params.channelId);
            if (ch) {
              ch.leave();
              realtimeChannels.current.delete(params.channelId);
            }
            respond(null);
            break;
          }

          default:
            respondError(-32601, `Method not found: ${method}`);
        }
      } catch (err) {
        respondError(-1, String(err));
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, post]);

  // Realtime channel handles, keyed by channelId.
  const realtimeChannels = useRef<
    Map<string, ReturnType<WebxdcAPI<unknown>["joinRealtimeChannel"]>>
  >(new Map());

  // Clean up realtime channels on unmount.
  useEffect(() => {
    const channels = realtimeChannels.current;
    return () => {
      for (const ch of channels.values()) ch.leave();
      channels.clear();
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={`${origin}/`}
      {...iframeProps}
    />
  );
});

export default Webxdc;
