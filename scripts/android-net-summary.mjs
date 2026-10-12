#!/usr/bin/env node
/**
 * Reconcile and attribute one scripts/android-net.sh run: the kernel's count
 * for the app UID against what the WebView recorder and the service profiler
 * saw, per minute, then every inbound EVENT byte by the REQ shape that asked
 * for it (`since` ages listed apart, so one reader's rounds group together),
 * REQ upload by shape, and WebSocket opens per host (a reconnect loop shows here).
 *
 *   node scripts/android-net-summary.mjs perf-reports/android-net-<ts>/<scenario> [--brief]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const brief = process.argv.includes("--brief");
if (!dir) {
  console.error("usage: android-net-summary.mjs <run dir> [--brief]");
  process.exit(2);
}
const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
const mb = (b) => `${(b / 1e6).toFixed(2).padStart(7)}MB`;
const kern = (f) => read(f).trim().split(/\s+/).map(Number);

const [rb0, , tb0] = kern("k_start");
const [rb1, , tb1] = kern("k_end");
const events = read("net.jsonl").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const wsIn = events.filter((e) => e.ev === "in");
const wsOut = events.filter((e) => e.ev === "out");
const http = events.filter((e) => e.ev === "http" && e.host !== "localhost");
const sum = (rows) => rows.reduce((a, e) => a + (e.bytes ?? 0), 0);

let svc = "unreadable";
try {
  const t = read("prof.txt");
  const p = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  const op = (k, f = "count") => p.ops[k]?.[f] ?? 0;
  svc = `frames in=${mb(op("frame.in bytes", "units"))} conns=${p.gauges.connections} open=${p.gauges.socketsOpen} ` +
    `connects=${op("socket.connect")} failures=${op("socket.failure")} probes=${op("keepalive.probe")}`;
} catch { /* no service dump */ }

console.log(`== ${dir}`);
console.log(`KERNEL  rx=${mb(rb1 - rb0)} tx=${mb(tb1 - tb0)}`);
console.log(`WEBVIEW ws in=${mb(sum(wsIn))} out=${mb(sum(wsOut))} http=${mb(sum(http))} (${http.length} req)`);
console.log(`SERVICE ${svc}`);
if (brief) process.exit(0);

console.log("\n-- kernel per sample (rx/tx MB since the previous)");
let prev;
for (const line of read("k_series").split("\n").filter(Boolean)) {
  const [t, rb, , tb] = line.split(/\s+/).map(Number);
  if (prev) console.log(`  t=${String(t).padStart(4)}s +rx=${((rb - prev[0]) / 1e6).toFixed(2)} +tx=${((tb - prev[1]) / 1e6).toFixed(2)}`);
  prev = [rb, tb];
}

console.log("\n-- webview per minute: ws in / ws out / http");
const byMin = new Map();
const bump = (e, i) => {
  const m = Math.floor(e.t / 60);
  const row = byMin.get(m) ?? [0, 0, 0];
  row[i] += e.bytes ?? 0;
  byMin.set(m, row);
};
wsIn.forEach((e) => bump(e, 0));
wsOut.forEach((e) => bump(e, 1));
http.forEach((e) => bump(e, 2));
for (const [m, r] of [...byMin].sort((a, b) => a[0] - b[0])) console.log(`  min ${String(m).padStart(2)}: ${mb(r[0])} ${mb(r[1])} ${mb(r[2])}`);

function top(rows, key, label, n = 12) {
  const bytes = new Map(), count = new Map();
  for (const e of rows) {
    const k = key(e);
    bytes.set(k, (bytes.get(k) ?? 0) + (e.bytes ?? 0));
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  console.log(`\n-- ${label}`);
  for (const [k, b] of [...bytes].sort((a, b2) => b2[1] - a[1]).slice(0, n)) {
    console.log(`  ${mb(b)} ${String(count.get(k)).padStart(6)}x  ${k}`);
  }
}
top(wsIn, (e) => e.host, "ws in by host");
top(wsIn, (e) => `${e.verb} ${e.kind ?? ""}`, "ws in by verb/kind");
top(wsOut, (e) => `${e.verb} ${e.kind ?? ""}`, "ws out by verb/kind");
top(http, (e) => e.host, "http by host", 8);

// Every inbound EVENT → the REQ (by host + sub id) that asked for it.
const shapes = new Map();
for (const e of wsOut) if (e.verb === "REQ" && e.subId) shapes.set(`${e.host}\u0000${e.subId}`, e.shape ?? "?");
const norm = (s) => s.replace(/(since|until)-\S+?(?=[ }])/g, "$1").slice(0, 170);
const attr = new Map();
for (const e of wsIn) {
  if (e.verb !== "EVENT") continue;
  const s = shapes.get(`${e.host}\u0000${e.subId}`) ?? `unmatched(kind ${e.kind})`;
  const k = norm(s);
  const a = attr.get(k) ?? { bytes: 0, n: 0, hosts: new Set(), ages: new Set(), mins: new Set() };
  a.bytes += e.bytes; a.n += 1; a.hosts.add(e.host); a.mins.add(Math.floor(e.t / 60));
  for (const m of s.matchAll(/since-(\S+?)[ }]/g)) a.ages.add(m[1]);
  attr.set(k, a);
}
console.log("\n-- inbound EVENT bytes by REQ shape (relays; since ages; minutes)");
for (const [k, a] of [...attr].sort((x, y) => y[1].bytes - x[1].bytes).slice(0, 20)) {
  console.log(`  ${mb(a.bytes)} ${String(a.n).padStart(5)}ev rel=${a.hosts.size} since=[${[...a.ages].slice(0, 4)}] min=[${[...a.mins].sort((x, y) => x - y).slice(0, 8)}]  ${k}`);
}
top(wsOut.filter((e) => e.verb === "REQ"), (e) => norm(e.shape ?? "?"), "REQ upload by shape", 8);

const opens = new Map();
for (const e of events) if (e.ev === "wsopen") opens.set(e.host, (opens.get(e.host) ?? 0) + 1);
console.log("\n-- websocket opens by host:", [...opens].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h, n]) => `${h}×${n}`).join(" "));
