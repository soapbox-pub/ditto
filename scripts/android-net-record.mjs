#!/usr/bin/env node
/**
 * Record every network event of the app's WebView (page and workers) over the
 * DevTools protocol, one JSON line each: HTTP requests with their wire size,
 * WebSocket opens/closes, and every frame with its verb, sub id and size. A
 * REQ also carries its parsed filter shape, so an EVENT joins to the reader
 * that asked for it. Attaches through the browser endpoint, so iframes
 * (embeds) and the service worker are recorded with the page. Driven by
 * scripts/android-net.sh; needs a debuggable build (the profiling APK) and an
 * `adb forward` to its devtools socket.
 *
 *   node scripts/android-net-record.mjs <port> <seconds> <out.jsonl>
 */
import { writeFileSync, appendFileSync } from "node:fs";
const [, , port, secs, outPath] = process.argv;
writeFileSync(outPath, "");
const t0 = Date.now();
const deadline = t0 + Number(secs) * 1000;
const log = (o) => appendFileSync(outPath, JSON.stringify({ t: Math.round((Date.now() - t0) / 1000), ...o }) + "\n");

let url;
while (!url && Date.now() < deadline) {
  try {
    // The browser endpoint, so every target is seen: the page, its workers,
    // iframes (embeds) and the service worker.
    const l = await (await fetch(`http://localhost:${port}/json`)).json();
    if (l.some((p) => p.type === "page" && p.url.startsWith("https://localhost"))) {
      url = (await (await fetch(`http://localhost:${port}/json/version`)).json()).webSocketDebuggerUrl;
    }
  } catch { /* not up yet */ }
  if (!url) await new Promise((r) => setTimeout(r, 200));
}
if (!url) { console.error("no page"); process.exit(1); }

const ws = new WebSocket(url);
let id = 0;
const send = (method, params = {}, sessionId) => ws.send(JSON.stringify({ id: ++id, method, params, ...(sessionId ? { sessionId } : {}) }));
const reqs = new Map(); // requestId → {url, type, bytes}
const kinds = new Map(); // sessionId → target type
const attached = new Set(); // targetIds
const srcOf = (s) => kinds.get(s) ?? "?";
const sockets = new Map(); // requestId → url
function subOf(data) { const m = /^\["\w+",\s*"([^"]*)"/.exec(data); return m ? m[1] : undefined; }
function shapeOf(data) {
  try {
    const [, , ...filters] = JSON.parse(data);
    const now = Date.now() / 1000;
    return filters.map((f) => {
      const parts = [];
      if (f.kinds) parts.push("k" + f.kinds.join(","));
      for (const [k, v] of Object.entries(f)) {
        if (k === "kinds") continue;
        if (Array.isArray(v)) parts.push(`${k}x${v.length}`);
        else if (k === "since" || k === "until") parts.push(`${k}-${fmtAge(now - v)}`);
        else parts.push(`${k}=${v}`);
      }
      return "{" + parts.join(" ") + "}";
    }).join("");
  } catch { return "unparsable"; }
}
function fmtAge(s) { return s < 3600 ? Math.round(s / 60) + "m" : s < 172800 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; }
const host = (u) => { try { return new URL(u).host + (new URL(u).pathname.length > 1 && u.startsWith("ws") ? new URL(u).pathname : ""); } catch { return u.slice(0, 60); } };

function enable(sessionId) {
  send("Network.enable", { maxTotalBufferSize: 0, maxResourceBufferSize: 0 }, sessionId);
  send("Runtime.runIfWaitingForDebugger", {}, sessionId);
}
function attach(info) {
  if (attached.has(info.targetId) || info.type === "browser") return;
  attached.add(info.targetId);
  send("Target.attachToTarget", { targetId: info.targetId, flatten: true });
}
ws.onopen = () => {
  send("Target.setDiscoverTargets", { discover: true });
};
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  const s = d.sessionId ?? "page";
  const p = d.params;
  switch (d.method) {
    case "Target.targetCreated":
      attach(p.targetInfo);
      break;
    case "Target.attachedToTarget":
      attached.add(p.targetInfo.targetId);
      kinds.set(p.sessionId, p.targetInfo.type);
      log({ ev: "target", kind: p.targetInfo.type, url: p.targetInfo.url.slice(0, 120) });
      // Discovery reaches every target; auto-attach as well would attach twice.
      enable(p.sessionId);
      break;
    case "Network.requestWillBeSent":
      reqs.set(s + p.requestId, { url: p.request.url, type: p.type, method: p.request.method, init: p.initiator?.type, bytes: 0 });
      break;
    case "Network.dataReceived": {
      // Summed too: some responses (media ranges, streams) finish without a total.
      const r = reqs.get(s + p.requestId);
      if (r) r.bytes += p.encodedDataLength ?? 0;
      break;
    }
    case "Network.loadingFinished": {
      const r = reqs.get(s + p.requestId);
      if (r) log({ ev: "http", src: srcOf(s), host: host(r.url), path: r.url.slice(0, 160), type: r.type, bytes: Math.max(p.encodedDataLength ?? 0, r.bytes) });
      reqs.delete(s + p.requestId);
      break;
    }
    case "Network.loadingFailed": {
      const r = reqs.get(s + p.requestId);
      if (r) log({ ev: "httpfail", src: srcOf(s), host: host(r.url), path: r.url.slice(0, 160), err: p.errorText, bytes: r.bytes });
      reqs.delete(s + p.requestId);
      break;
    }
    case "Network.webSocketCreated":
      sockets.set(s + p.requestId, p.url);
      log({ ev: "wsopen", src: srcOf(s), host: host(p.url) });
      break;
    case "Network.webSocketClosed":
      log({ ev: "wsclose", host: host(sockets.get(s + p.requestId) ?? "?") });
      break;
    case "Network.webSocketFrameReceived":
    case "Network.webSocketFrameSent": {
      const data = p.response.payloadData ?? "";
      let verb = "?", sub = "", kind;
      if (p.response.opcode === 1) {
        const m1 = /^\["(\w+)",\s*"?([^",]{0,40})/.exec(data);
        if (m1) { verb = m1[1]; sub = m1[2]; }
        const k = /"kind":(\d+)/.exec(data); if (k) kind = Number(k[1]);
      } else verb = "binary";
      log({
        ev: d.method.endsWith("Received") ? "in" : "out",
        src: srcOf(s),
        host: host(sockets.get(s + p.requestId) ?? "?"),
        bytes: data.length, verb, sub: sub.slice(0, 3), kind,
        // Full sub id (joins EVENTs to their REQ) and the REQ's parsed shape.
        subId: (verb === "EVENT" || verb === "EOSE" || verb === "REQ" || verb === "CLOSE" || verb === "CLOSED") ? subOf(data) : undefined,
        ...(verb === "REQ" ? { shape: shapeOf(data) } : {}),
      });
      break;
    }
  }
};
ws.onclose = () => { log({ ev: "detached" }); process.exit(0); };
// Requests still streaming at the end (media, long polls) count too.
function flushPending() {
  for (const r of reqs.values()) {
    if (r.bytes > 0) log({ ev: "httppending", host: host(r.url), path: r.url.slice(0, 160), type: r.type, bytes: r.bytes });
  }
}
setTimeout(() => {
  flushPending();
  process.exit(0);
}, Math.max(0, deadline - Date.now()));
