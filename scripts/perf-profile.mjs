#!/usr/bin/env node
/**
 * Benchmark Ditto's major pages: boots a profiling build (`VITE_PROFILE=1`:
 * names kept, source maps) in headless Chromium, logged out, against the real
 * default relays, and measures each page's load and a scroll through it.
 *
 *   npm run perf:profile                        # build + every scenario
 *   node scripts/perf-profile.mjs --skip-build --only home,profile
 *   node scripts/perf-profile.mjs --skip-build --cpu-profile   # + hot functions
 *   node scripts/perf-profile.mjs --cpu-throttle 4 --mobile     # nearer a phone
 *
 * Options:
 *   --only a,b        scenarios to run (see SCENARIOS below)
 *   --settle <s>      seconds to let a page load before measuring its scroll (12)
 *   --scrolls <n>     wheel steps of most of a screen each, 600ms apart (20)
 *   --cpu-throttle <n> slow the main thread n×
 *   --mobile          phone-sized viewport with touch
 *   --warm            load each page once, then measure a reload (IndexedDB warm)
 *   --cpu-profile     sample a CPU profile per phase: top self-time functions,
 *                     mapped back to src/ (skews the other numbers a little)
 *
 * Per phase it reports Chromium's main-thread busy time (TaskDuration) split
 * into script, style and layout, long tasks and total blocking time, frames
 * slower than 50ms, and the long-animation-frame scripts behind them, with the
 * forced style/layout each one caused. Relays are live, so compare runs
 * against each other, a few at a time, not against a phone.
 *
 * Output: perf-reports/<scenario>.json (+ .cpuprofile) and a summary on stdout.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { nip19 } from 'nostr-tools';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const DIST = resolve(root, 'dist-perf');
const OUT = resolve(root, 'perf-reports');
const PORT = 4199;
const ORIGIN = `http://localhost:${PORT}`;
const SETTLE_MS = Number(option('settle', 12)) * 1000;
const SCROLLS = Number(option('scrolls', 20));
const THROTTLE = Number(option('cpu-throttle', 1));

/** Alex Gleason: a busy profile with media, and a post with a long thread. */
const PROFILE_PUBKEY = '0461fcbecc4c3374439932d6b8f11269ccdb7cc973ad7a50ae362db135a474dd';
const THREAD_ID = '38485e19b0ff39fa6545aa1d6fffbb12ea3030ffaa3828f83803e5d0794f499d';

const SCENARIOS = {
  home: { path: '/', scroll: true },
  profile: { path: `/${nip19.npubEncode(PROFILE_PUBKEY)}`, scroll: true },
  thread: { path: `/${nip19.neventEncode({ id: THREAD_ID, author: PROFILE_PUBKEY })}`, scroll: true },
  hashtag: { path: '/t/nostr', scroll: true },
  search: { path: '/search?q=nostr', scroll: true },
  trends: { path: '/trends', scroll: true },
  photos: { path: '/photos', scroll: true },
  videos: { path: '/videos', scroll: true },
  shorts: { path: '/shorts', scroll: false },
  articles: { path: '/articles', scroll: true },
  music: { path: '/music', scroll: true },
  settings: { path: '/settings', scroll: false },
};

const only = option('only', '').split(',').filter(Boolean);
const selected = only.length ? only : Object.keys(SCENARIOS);
for (const name of selected) {
  if (!SCENARIOS[name]) {
    console.error(`unknown scenario: ${name} (have ${Object.keys(SCENARIOS).join(', ')})`);
    process.exit(2);
  }
}

// ─── Build and serve ────────────────────────────────────────────────────────

if (!flag('skip-build') || !existsSync(DIST)) {
  console.log('▶ building the profiling bundle into dist-perf/…');
  const built = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-perf', '--emptyOutDir', '-l', 'error'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_PROFILE: '1' },
  });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-perf', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});
const stopServer = () => server.kill('SIGTERM');
process.on('exit', stopServer);
process.on('SIGINT', () => process.exit(130));

for (let i = 0; ; i++) {
  try {
    if ((await fetch(ORIGIN)).ok) break;
  } catch {
    // not up yet
  }
  if (i > 100) throw new Error('vite preview did not start');
  await new Promise((r) => setTimeout(r, 200));
}

// ─── Source maps ────────────────────────────────────────────────────────────

let TraceMap, originalPositionFor;
try {
  ({ TraceMap, originalPositionFor } = await import('@jridgewell/trace-mapping'));
} catch {
  // Sites stay as chunk:line:col.
}
const maps = new Map();

/** `src/…:line` for a position in a built chunk, or the chunk position. */
function sourceSite(url, line, column) {
  const file = url.replace(/^.*\/assets\//, '');
  const fallback = `${file}:${line + 1}:${column + 1}`;
  if (!TraceMap || !url.includes('/assets/')) return fallback;
  let map = maps.get(file);
  if (map === undefined) {
    const path = resolve(DIST, 'assets', `${file}.map`);
    map = existsSync(path) ? new TraceMap(readFileSync(path, 'utf8')) : null;
    maps.set(file, map);
  }
  if (!map) return fallback;
  const pos = originalPositionFor(map, { line: line + 1, column });
  if (!pos.source) return fallback;
  return `${pos.source.replace(/^(\.\.\/)+/, '')}:${pos.line}`;
}

const lineStarts = new Map();

/** `sourceSite` for a character offset into a built chunk (what LoAF reports). */
function sourceSiteAt(url, offset) {
  const file = url.replace(/^.*\/assets\//, '');
  let starts = lineStarts.get(file);
  if (starts === undefined) {
    const path = resolve(DIST, 'assets', file);
    starts = null;
    if (url.includes('/assets/') && existsSync(path)) {
      starts = [0];
      const text = readFileSync(path, 'utf8');
      for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
    }
    lineStarts.set(file, starts);
  }
  if (!starts) return sourceSite(url, 0, offset);
  let line = 0;
  while (line + 1 < starts.length && starts[line + 1] <= offset) line++;
  return sourceSite(url, line, offset - starts[line]);
}

// ─── In-page instrumentation ────────────────────────────────────────────────

/** Installed before any app script: buffers what the page observes for `take()`. */
function instrument() {
  const perf = {
    longTasks: [],
    loafs: [],
    lcp: 0,
    lcpNode: '',
    cls: 0,
    shifts: [],
    frames: [],
    framing: false,
  };
  window.__perf = perf;
  const observe = (type, fn) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true });
    } catch {
      // unsupported entry type
    }
  };
  observe('longtask', (e) => perf.longTasks.push({ start: e.startTime, duration: e.duration }));
  observe('long-animation-frame', (e) => {
    perf.loafs.push({
      start: e.startTime,
      duration: e.duration,
      blocking: e.blockingDuration,
      styleAndLayoutStart: e.styleAndLayoutStart,
      renderStart: e.renderStart,
      scripts: e.scripts.map((s) => ({
        invoker: s.invoker,
        invokerType: s.invokerType,
        sourceURL: s.sourceURL,
        sourceFunctionName: s.sourceFunctionName,
        sourceCharPosition: s.sourceCharPosition,
        duration: s.duration,
        forced: s.forcedStyleAndLayoutDuration,
      })),
    });
  });
  observe('largest-contentful-paint', (e) => {
    perf.lcp = e.startTime;
    perf.lcpNode = e.element ? `${e.element.tagName.toLowerCase()} ${(e.url || '').slice(0, 80)}` : '';
  });
  const describe = (node) => {
    if (!node || node.nodeType !== 1) return node ? node.nodeName : '?';
    const cls = typeof node.className === 'string' ? node.className.split(/\s+/).slice(0, 4).join('.') : '';
    const testid = node.getAttribute('data-testid') || node.getAttribute('aria-label') || '';
    return `${node.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${testid ? `[${testid}]` : ''}`;
  };
  observe('layout-shift', (e) => {
    if (e.hadRecentInput) return;
    perf.cls += e.value;
    perf.shifts.push({
      at: Math.round(e.startTime),
      value: Number(e.value.toFixed(4)),
      sources: (e.sources ?? []).slice(0, 3).map((s) => ({
        node: describe(s.node),
        from: s.previousRect && Math.round(s.previousRect.y),
        to: s.currentRect && Math.round(s.currentRect.y),
      })),
    });
  });
  let last = 0;
  const tick = (t) => {
    if (perf.framing && last) perf.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const METRICS = [
  'TaskDuration',
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration',
  'LayoutCount',
  'RecalcStyleCount',
  'JSHeapUsedSize',
  'Nodes',
  'JSEventListeners',
];

async function metrics(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.filter((m) => METRICS.includes(m.name)).map((m) => [m.name, m.value]));
}

/** Take and clear what the page buffered since the last call. */
async function take(page) {
  return page.evaluate(() => {
    const p = window.__perf;
    const out = { longTasks: p.longTasks, loafs: p.loafs, lcp: p.lcp, lcpNode: p.lcpNode, cls: p.cls, shifts: p.shifts, frames: p.frames };
    p.longTasks = [];
    p.loafs = [];
    p.frames = [];
    p.shifts = [];
    p.cls = 0;
    return out;
  });
}

/** Long-animation-frame scripts summed by what ran them, with their forced layouts. */
function loafScripts(loafs) {
  const by = new Map();
  for (const loaf of loafs) {
    for (const s of loaf.scripts) {
      const site = s.sourceURL
        ? sourceSiteAt(s.sourceURL, Math.max(0, s.sourceCharPosition))
        : '(no source)';
      const key = `${s.invokerType} ${s.sourceFunctionName || s.invoker || '?'} @ ${site}`;
      const agg = by.get(key) ?? { key, ms: 0, forced: 0, count: 0 };
      agg.ms += s.duration;
      agg.forced += s.forced;
      agg.count++;
      by.set(key, agg);
    }
  }
  return [...by.values()].sort((a, b) => b.ms - a.ms).slice(0, 15)
    .map((a) => `${Math.round(a.ms)}ms (forced layout ${Math.round(a.forced)}ms) ×${a.count} ${a.key}`);
}

/** Sampling CPU profile around `fn`, reduced to the top self-time sites. */
async function cpuProfile(cdp, name, fn) {
  if (!flag('cpu-profile')) return { result: await fn(), hot: undefined };
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const result = await fn();
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync(resolve(OUT, `${name}.cpuprofile`), JSON.stringify(profile));
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => {
    const { functionName, url, lineNumber, columnNumber } = byId.get(id).callFrame;
    if (functionName === '(idle)' || functionName === '(program)') return;
    const site = url ? sourceSite(url, lineNumber, columnNumber) : '(native)';
    const key = `${functionName || '(anonymous)'} ${site}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
  });
  const hot = [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([key, us]) => `${Math.round(us / 1000)}ms ${key}`);
  return { result, hot };
}

/** Run `fn` and report what the main thread did meanwhile. */
async function measurePhase(page, cdp, name, fn) {
  await take(page);
  const before = await metrics(cdp);
  const started = Date.now();
  const { hot } = await cpuProfile(cdp, name, fn);
  const wallMs = Date.now() - started;
  const after = await metrics(cdp);
  const seen = await take(page);
  const ms = (k) => Math.round((after[k] - before[k]) * 1000);
  const longTasks = seen.longTasks;
  const slowFrames = seen.frames.filter((f) => f > 50);
  return {
    wallMs,
    busyMs: ms('TaskDuration'),
    busyPct: Math.round((ms('TaskDuration') / wallMs) * 100),
    scriptMs: ms('ScriptDuration'),
    styleMs: ms('RecalcStyleDuration'),
    layoutMs: ms('LayoutDuration'),
    styleCount: after.RecalcStyleCount - before.RecalcStyleCount,
    layoutCount: after.LayoutCount - before.LayoutCount,
    longTasks: longTasks.length,
    longestTaskMs: Math.round(Math.max(0, ...longTasks.map((t) => t.duration))),
    blockingMs: Math.round(longTasks.reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0)),
    frames: seen.frames.length,
    slowFrames: slowFrames.length,
    worstFrameMs: Math.round(Math.max(0, ...seen.frames)),
    lcpMs: Math.round(seen.lcp),
    lcpNode: seen.lcpNode,
    cls: Number(seen.cls.toFixed(3)),
    shifts: seen.shifts.sort((a, b) => b.value - a.value).slice(0, 8),
    nodes: after.Nodes,
    heapMB: Math.round(after.JSHeapUsedSize / 1048576),
    listeners: after.JSEventListeners,
    loafScripts: loafScripts(seen.loafs),
    hot,
  };
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });
mkdirSync(OUT, { recursive: true });

const mobile = flag('mobile');
const contextOptions = mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  : { viewport: { width: 1280, height: 900 } };

async function runScenario(name) {
  const { path, scroll } = SCENARIOS[name];
  const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' });
  await context.addInitScript(instrument);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'timeTicks' });
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

  const report = { scenario: name, path, throttle: THROTTLE, mobile, phases: {} };

  if (flag('warm')) {
    await page.goto(ORIGIN + path, { waitUntil: 'load' });
    await page.waitForTimeout(SETTLE_MS);
  }

  report.phases.load = await measurePhase(page, cdp, `${name}-load`, async () => {
    if (flag('warm')) await page.reload({ waitUntil: 'load' });
    else await page.goto(ORIGIN + path, { waitUntil: 'load' });
    await page.waitForTimeout(SETTLE_MS);
  });

  if (scroll) {
    const { width, height } = page.viewportSize();
    await page.mouse.move(width / 2, height / 2);
    await page.evaluate(() => {
      window.__perf.framing = true;
    });
    report.phases.scroll = await measurePhase(page, cdp, `${name}-scroll`, async () => {
      for (let i = 0; i < SCROLLS; i++) {
        await page.mouse.wheel(0, Math.round(height * 0.8));
        await page.waitForTimeout(600);
      }
    });
    report.scrolledTo = await page.evaluate(() => Math.round(window.scrollY));
  }

  await context.close();
  writeFileSync(resolve(OUT, `${name}.json`), JSON.stringify(report, null, 2));
  return report;
}

function printPhase(label, p) {
  console.log(
    `  ${label.padEnd(6)} busy ${p.busyMs}ms (${p.busyPct}%)  script ${p.scriptMs}  style ${p.styleMs} ×${p.styleCount}` +
      `  layout ${p.layoutMs} ×${p.layoutCount}  long tasks ${p.longTasks} (max ${p.longestTaskMs}, TBT ${p.blockingMs})` +
      (p.frames ? `  slow frames ${p.slowFrames}/${p.frames} (worst ${p.worstFrameMs})` : '') +
      (label === 'load' ? `  LCP ${p.lcpMs} (${p.lcpNode})  CLS ${p.cls}` : `  CLS ${p.cls}`) +
      `  nodes ${p.nodes}  heap ${p.heapMB}MB`,
  );
  for (const line of p.loafScripts.slice(0, 6)) console.log(`         loaf  ${line}`);
  for (const shift of p.shifts.filter((s) => s.value >= 0.01).slice(0, 4)) {
    const what = shift.sources.map((s) => `${s.node} ${s.from}→${s.to}`).join(', ');
    console.log(`         shift ${shift.value} @${shift.at}ms ${what}`);
  }
  for (const line of (p.hot ?? []).slice(0, 12)) console.log(`         hot   ${line}`);
}

const reports = [];
try {
  for (const name of selected) {
    process.stdout.write(`▶ ${name} …\n`);
    const report = await runScenario(name);
    reports.push(report);
    console.log(`${name}  ${report.path}${report.scrolledTo !== undefined ? `  (scrolled to ${report.scrolledTo}px)` : ''}`);
    for (const [label, phase] of Object.entries(report.phases)) printPhase(label, phase);
  }
} finally {
  await browser.close();
  stopServer();
}

writeFileSync(
  resolve(OUT, 'summary.json'),
  JSON.stringify(
    reports.map((r) => ({
      scenario: r.scenario,
      ...Object.fromEntries(
        Object.entries(r.phases).map(([k, p]) => [k, { busyMs: p.busyMs, blockingMs: p.blockingMs, layoutCount: p.layoutCount, slowFrames: p.slowFrames }]),
      ),
    })),
    null,
    2,
  ),
);
