#!/usr/bin/env node
// Visual regression test for the mobile compose sheet's keyboard/viewport
// handling (the iOS "gap above the keyboard / truncated GIF picker" bug).
//
// Why this exists outside the Vitest suite: the bug is a CSS layout failure of
// a `position: fixed` element against the visual viewport. jsdom computes no
// layout, so it can only assert that the hook publishes the right CSS variables
// (see src/hooks/useVisualViewportVar.test.ts) — it can never SHOW the sheet
// clipping off-screen or floating above the keyboard. This runner renders the
// real sheet CSS in headless Chromium, simulates the keyboard opening, measures
// actual element geometry, and captures before/after screenshots.
//
// Zero npm dependencies: it drives the Chromium that Playwright cached in this
// environment directly over the DevTools Protocol using Node's built-in
// fetch/WebSocket. It is intentionally NOT part of `npm run test` (and thus not
// run in CI, which has no browser) — run it locally with `npm run test:visual`.
//
// Exit code 0 = fixed-mode geometry correct AND buggy-mode reproduces the bug.
// Exit code 1 = the fix regressed, or the harness no longer reproduces the bug.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'out');
const HARNESS = readFileSync(join(__dirname, 'keyboard-viewport.html'), 'utf-8');

// Device + keyboard model (iPhone-ish portrait).
const DEVICE = { width: 390, height: 844, deviceScaleFactor: 2 };
const KEYBOARD_HEIGHT = 336;
// When the keyboard raises, iOS scrolls the layout viewport to reveal the
// focused input: the visual viewport shifts down by offsetTop and shrinks.
const OFFSET_TOP = 150;
const VV_HEIGHT = DEVICE.height - KEYBOARD_HEIGHT; // 508
const VISIBLE_BOTTOM = OFFSET_TOP + VV_HEIGHT;     // 658 — where the keyboard starts
const TOL = 2; // px tolerance for sub-pixel rounding

const CHROME = join(
  process.env.HOME,
  '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Tiny CDP client over the built-in WebSocket ──────────────────────────────
async function connectCDP(port) {
  let pages;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (r.ok) {
        pages = await r.json();
        if (pages.find((p) => p.type === 'page')) break;
      }
    } catch { /* not up yet */ }
    await wait(100);
  }
  const page = pages?.find((p) => p.type === 'page');
  if (!page) throw new Error('No Chromium page target found');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const eventWaiters = new Map(); // method -> [resolve, ...]
  // Track the page's current default execution context. Without pinning
  // Runtime.evaluate to it, consecutive calls after a navigation
  // nondeterministically hit the destroyed about:blank context.
  let contextId;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.executionContextCreated') {
      if (m.params.context.auxData?.isDefault) contextId = m.params.context.id;
      return;
    }
    if (m.method === 'Runtime.executionContextsCleared') { contextId = undefined; return; }
    if (m.method && eventWaiters.has(m.method)) {
      const waiters = eventWaiters.get(m.method);
      eventWaiters.set(m.method, []);
      for (const r of waiters) r(m.params);
    }
  });
  const once = (method) =>
    new Promise((res) => {
      const arr = eventWaiters.get(method) ?? [];
      arr.push(res);
      eventWaiters.set(method, arr);
    });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  const send = (method, params = {}) =>
    new Promise((res) => {
      const mid = ++id;
      pending.set(mid, res);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  // Returns the by-value result of an expression evaluated in the page's
  // current default execution context.
  const evaluate = async (expression) => {
    const params = { expression, returnByValue: true, awaitPromise: true };
    if (contextId !== undefined) params.contextId = contextId;
    const m = await send('Runtime.evaluate', params);
    if (m.result?.exceptionDetails) {
      throw new Error('Page eval failed: ' + JSON.stringify(m.result.exceptionDetails));
    }
    return m.result.result.value;
  };

  return { send, evaluate, once, close: () => ws.close() };
}

async function rectOf(cdp, id) {
  return cdp.evaluate(
    `(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, left: r.left }; })()`,
  );
}

// ── Assertion helpers ────────────────────────────────────────────────────────
const failures = [];
function check(desc, ok, detail) {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${desc}${detail ? ` — ${detail}` : ''}`;
  console.log('  ' + line);
  if (!ok) failures.push(desc);
}
const near = (a, b, tol = TOL) => Math.abs(a - b) <= tol;

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Serve the harness.
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HARNESS);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--remote-debugging-port=0',
    `--window-size=${DEVICE.width},${DEVICE.height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Chromium prints the actual devtools port to stderr when asked for port 0.
  const devtoolsPort = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chromium did not report a devtools port')), 15000);
    proc.stderr.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) { clearTimeout(t); resolve(Number(m[1])); }
    });
  });

  const cdp = await connectCDP(devtoolsPort);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  async function loadAndOpenKeyboard(mode) {
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?mode=${mode}` });
    await loaded; // fresh execution context is ready once the load event fires
    await wait(120);
    // Paint the keyboard + scrolled-off band so screenshots read clearly, then
    // fire the simulated keyboard-open.
    await cdp.evaluate(`(() => {
      const ot = ${OFFSET_TOP}, vh = ${VV_HEIGHT}, dev = ${DEVICE.height};
      const off = document.getElementById('offtop');
      off.style.height = ot + 'px';
      const kb = document.getElementById('keyboard');
      kb.style.top = (ot + vh) + 'px';
      kb.style.height = (dev - (ot + vh)) + 'px';
      kb.textContent = 'virtual keyboard';
      window.__openKeyboard(${OFFSET_TOP}, ${VV_HEIGHT});
    })()`);
    await wait(120);
  }

  async function screenshot(name) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = join(OUT_DIR, name);
    writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    return file;
  }

  let ok = true;
  try {
    // ── BUGGY: confirm the harness actually reproduces the reported bug ───────
    console.log('\nmode=buggy (pre-fix) — expect the bug to reproduce:');
    await loadAndOpenKeyboard('buggy');
    const bSheet = await rectOf(cdp, 'sheet');
    const bBar = await rectOf(cdp, 'actionbar');
    await screenshot('keyboard-buggy.png');
    const bGap = VISIBLE_BOTTOM - bBar.bottom;
    // Header clipped off the top: the sheet starts above the visible viewport.
    check('bug reproduces: sheet top is clipped above the visible viewport',
      bSheet.top < OFFSET_TOP - 10, `sheet.top=${bSheet.top.toFixed(1)} < visibleTop=${OFFSET_TOP}`);
    // Large empty gap between the action bar and the keyboard.
    check('bug reproduces: large gap between action bar and keyboard',
      bGap > 20, `gap=${bGap.toFixed(1)}px above the keyboard`);

    // ── FIXED: the shipped behaviour must align the sheet to the viewport ─────
    console.log('\nmode=fixed (post-fix) — expect correct alignment:');
    await loadAndOpenKeyboard('fixed');
    const fSheet = await rectOf(cdp, 'sheet');
    const fBar = await rectOf(cdp, 'actionbar');
    const fTray = await rectOf(cdp, 'tray');
    await screenshot('keyboard-fixed.png');
    check('sheet is anchored to the visual-viewport offset (not clipped off the top)',
      near(fSheet.top, OFFSET_TOP), `sheet.top=${fSheet.top.toFixed(1)} ≈ ${OFFSET_TOP}`);
    check('sheet height matches the visual viewport',
      near(fSheet.height, VV_HEIGHT), `sheet.height=${fSheet.height.toFixed(1)} ≈ ${VV_HEIGHT}`);
    check('action bar sits flush above the keyboard (no gap, not covered)',
      near(fBar.bottom, VISIBLE_BOTTOM), `actionbar.bottom=${fBar.bottom.toFixed(1)} ≈ keyboardTop=${VISIBLE_BOTTOM}`);
    check('GIF tray stays within the visible sheet (not truncated by the keyboard)',
      fTray.bottom <= VISIBLE_BOTTOM + TOL, `tray.bottom=${fTray.bottom.toFixed(1)} ≤ ${VISIBLE_BOTTOM}`);

    // ── Source contract: keep the harness honest against the real files ───────
    console.log('\nsource contract — harness must reflect the shipped code:');
    const hook = readFileSync(join(__dirname, '../../src/hooks/useVisualViewportVar.ts'), 'utf-8');
    const dialog = readFileSync(join(__dirname, '../../src/components/ComposeDialogContent.tsx'), 'utf-8');
    check('hook publishes --visual-viewport-offset-top', hook.includes('--visual-viewport-offset-top'));
    check('hook listens for scroll (offsetTop changes)', /addEventListener\(\s*['"]scroll['"]/.test(hook));
    check('hook reads visualViewport.offsetTop', hook.includes('vv.offsetTop'));
    check('sheet anchors top to the offset variable',
      dialog.includes('top-[var(--visual-viewport-offset-top'));
  } finally {
    cdp.close();
    proc.kill();
    server.close();
  }

  console.log(`\nScreenshots written to ${OUT_DIR}`);
  if (failures.length) {
    console.error(`\n✗ ${failures.length} visual check(s) failed.`);
    ok = false;
  } else {
    console.log('\n✓ All visual checks passed.');
  }
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
