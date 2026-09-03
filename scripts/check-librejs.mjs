#!/usr/bin/env node

/**
 * Verifies that `dist/` is GNU LibreJS compliant.
 *
 * LibreJS blocks every *external* script lacking a machine-readable free-license
 * declaration. For external scripts it skips the triviality heuristic outright
 * (`checkScriptSource(..., external = true)` returns "External script with no
 * known license" for anything outside a license block), so there is no
 * "too small to matter" exemption. Firefox types `<script type="module">` and
 * dynamic `import()` subresources as `script`, so every chunk is checked
 * individually — and a blocked chunk is not cancelled, its body is replaced
 * with a comment, so the module that imported it dies on a missing export.
 * One unlabelled chunk breaks the entire app under LibreJS.
 *
 * That failure is invisible in a normal browser, which is why this runs in CI.
 *
 * The regexes and the magnet comparison below are ported verbatim from LibreJS
 * 7.21.1 (`common/checks.js`, bundled as `bundle.js` in the published XPI) so
 * that what we assert is what the extension actually does.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// --- Ported from LibreJS 7.21.1 -------------------------------------------
// common/checks.js
const OPENING_LICENSE_RE1 = /^\s*\/\/\s*@license\s+(\S+)\s+(\S+).*$/mi;
const OPENING_LICENSE_RE2 = /\/\*\s*?@license\s+(\S+)\s+([^/*]+).*\*\//mi;
const CLOSING_LICENSE_RE1 = /^\s*\/\/\s*@license-end\s*/mi;
const CLOSING_LICENSE_RE2 = /\/\*\s*@license-end\s*\*\//mi;

// common/license_definitions.json, the AGPL-3.0 entry. LibreJS validates the
// magnet link only (`checkMagnet`); the human-readable identifier beside it is
// not checked. It compares after replacing &amp; with &.
const AGPL3_MAGNET =
  'magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt';
const AGPL3_CANONICAL_URL = 'http://www.gnu.org/licenses/agpl-3.0.html';
// --------------------------------------------------------------------------

const DIST = path.resolve('dist');
const errors = [];

function fail(file, message) {
  errors.push(`${file}: ${message}`);
}

/** Every `.js` file LibreJS will see as an external script request. */
function findScripts(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findScripts(full, base));
    else if (entry.name.endsWith('.js')) out.push(path.relative(base, full));
  }
  return out.sort();
}

/**
 * Replays LibreJS's accept/reject decision for one external script.
 *
 * `checkScriptSource` consumes the source in a loop: everything before an
 * opening tag is triviality-checked (auto-denied when external), the licensed
 * block is accepted, and the remainder goes round again — which is why nothing
 * but whitespace may follow @license-end.
 */
function checkScript(relPath) {
  const src = fs.readFileSync(path.join(DIST, relPath), 'utf-8');
  const inSrc = src.trim();
  if (!inSrc) return; // LibreJS: "Empty source."

  const opening = OPENING_LICENSE_RE1.exec(inSrc) ?? OPENING_LICENSE_RE2.exec(inSrc);
  if (!opening) {
    fail(relPath, 'no @license tag — LibreJS will block this as "External script with no known license"');
    return;
  }
  if (opening.index !== 0) {
    fail(
      relPath,
      `@license tag is at offset ${opening.index}, not 0; the ${opening.index} bytes before it ` +
        'are treated as an unlicensed external script and blocked',
    );
  }

  const magnet = opening[1].replace(/&amp;/g, '&');
  if (magnet !== AGPL3_MAGNET) {
    fail(relPath, `unrecognized license magnet ${JSON.stringify(magnet)}`);
    return;
  }

  const closing = CLOSING_LICENSE_RE1.exec(inSrc) ?? CLOSING_LICENSE_RE2.exec(inSrc);
  if (!closing) {
    fail(relPath, '@license with no @license-end');
    return;
  }

  const trailing = inSrc.substring(closing.index + closing[0].length).trim();
  if (trailing) {
    fail(
      relPath,
      `${trailing.length} bytes follow @license-end (starting ${JSON.stringify(trailing.slice(0, 60))}); ` +
        'only whitespace is allowed there',
    );
  }
}

const scripts = findScripts(DIST);
if (!scripts.length) {
  console.error('check-librejs: no .js files under dist/ — did the build run?');
  process.exit(1);
}
for (const script of scripts) checkScript(script);

// --- The Web Labels page --------------------------------------------------
// LibreJS reads it with fetch() + DOMParser and never executes JavaScript, so
// it has to be a static file rather than a client-side route. The row selector
// is `table#jslicense-labels1 > tbody > tr`, and the first cell's href must
// resolve to the exact URL of the script request.
const labelsPath = path.join(DIST, 'jslicense.html');
if (!fs.existsSync(labelsPath)) {
  fail('jslicense.html', 'missing — the librejsLicense() plugin did not emit it');
} else {
  const labels = fs.readFileSync(labelsPath, 'utf-8');
  if (!/<table id="jslicense-labels1">\s*<tbody>/.test(labels)) {
    fail('jslicense.html', 'no <table id="jslicense-labels1"> with an explicit <tbody>');
  }
  if (!labels.includes(AGPL3_CANONICAL_URL)) {
    fail('jslicense.html', `license links must use ${AGPL3_CANONICAL_URL} verbatim (http, not https)`);
  }
  const listed = new Set([...labels.matchAll(/<td><a href="\/([^"]+\.js)"/g)].map((m) => m[1]));
  for (const script of scripts) {
    if (!listed.has(script)) fail('jslicense.html', `no Web Labels row for /${script}`);
  }
}

// --- The entry document ---------------------------------------------------
const indexPath = path.join(DIST, 'index.html');
if (!fs.existsSync(indexPath)) {
  fail('index.html', 'missing');
} else {
  // Strip HTML comments first. LibreJS parses the document with DOMParser, so a
  // comment mentioning <script> is not a script; a regex over the raw text is.
  const html = fs.readFileSync(indexPath, 'utf-8').replace(/<!--[\s\S]*?-->/g, '');
  const linkIndex = html.search(/<(?:link|a)[^>]*\b(?:rel="jslicense"|data-jslicense="1")/i);
  if (linkIndex === -1) {
    fail('index.html', 'no <link rel="jslicense"> pointing at the Web Labels page');
  } else {
    // If any <script> precedes the link, LibreJS relocates it, which means
    // re-serializing the whole document through DOMParser.
    const firstScript = html.search(/<script\b/i);
    if (firstScript !== -1 && firstScript < linkIndex) {
      fail('index.html', 'a <script> precedes the jslicense link; LibreJS will rewrite the document');
    }
  }
  // Inline classic scripts are checked as part of the page. Inline modules are
  // skipped by LibreJS, and scripts with a src are handled as separate requests.
  for (const [, attrs, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc=/i.test(attrs)) continue;
    if (/\btype\s*=\s*["']?(?!text\/javascript)/i.test(attrs)) continue;
    if (!body.trim()) continue;
    if (!OPENING_LICENSE_RE1.test(body) && !OPENING_LICENSE_RE2.test(body)) {
      fail('index.html', `inline <script${attrs}> has no @license tag`);
    }
  }
}

if (errors.length) {
  console.error(`check-librejs: ${errors.length} problem(s) found:\n`);
  for (const error of errors) console.error(`  ${error}`);
  console.error('\nSee the librejsLicense() plugin in vite.config.ts.');
  process.exit(1);
}

console.log(`check-librejs: ${scripts.length} scripts labelled AGPL-3.0-or-later.`);
