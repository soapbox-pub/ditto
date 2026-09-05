import process from "node:process";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv, searchForWorkspaceRoot, type Plugin } from "vite";

import { DittoConfigSchema } from "./src/lib/schemas";

/**
 * Load and validate the build-time ditto.json configuration file.
 * Returns the parsed config object, or `undefined` if the file doesn't exist.
 * Set the DITTO_CONFIG_FILE env var to override the default path ("./ditto.json").
 *
 * Why DITTO_CONFIG_FILE and not CONFIG_FILE: GitLab Runner sets CONFIG_FILE in
 * its job environment to point at its own TOML config (~/.gitlab-runner/config.toml),
 * so a generic name silently breaks every CI build that runs on a self-hosted runner.
 */
function loadDittoConfig(): object | undefined {
  const configPath = path.resolve(process.env.DITTO_CONFIG_FILE ?? "./ditto.json");

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch {
    // File not found — no build-time config
    return undefined;
  }

  const json = JSON.parse(raw);
  const result = DittoConfigSchema.parse(json);
  return result;
}

/**
 * Copy all files from `src` into `dest`, overwriting existing files.
 * Recursively handles subdirectories.
 */
function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    // A symlink-to-file reports isDirectory() === false, so it would otherwise
    // fall through to copyFileSync — which copies the *target's* contents into
    // dist/ as a real file. One planted link and the build bakes an arbitrary
    // host file into the artifact CI then publishes.
    if (entry.isSymbolicLink()) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Resolve a request path inside `root`, or return `null` if it escapes.
 *
 * Decode *then* normalise, and assert containment afterwards. Doing it the
 * other way round is what made this a traversal: `new URL()` collapses `../`
 * and `%2e%2e` segments, but it does not decode `%2f`, so running
 * `decodeURIComponent` afterwards turned `/..%2fsecret` back into `/../secret`
 * — reconstituting the escape after the only thing that looked like a check.
 */
function resolveWithinDir(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.includes("\0")) return null;

  const resolved = path.resolve(root, "." + path.posix.normalize(decoded));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/**
 * Vite plugin that merges an external public directory on top of the default one.
 * Set the PUBLIC_DIR env var to a directory path. Files in that directory take
 * precedence over files in the built-in `public/` directory.
 *
 * - In build mode, files are copied into the output after the default public dir.
 * - In dev mode, the external directory is served with higher priority.
 */
function mergePublicDir(externalDir: string): Plugin {
  const resolved = path.resolve(externalDir);

  return {
    name: "ditto:merge-public-dir",

    configureServer(server) {
      // Serve files from the external public dir before the default public dir.
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        const { pathname } = new URL(req.url, "http://localhost");
        const filePath = resolveWithinDir(resolved, pathname);
        if (!filePath) return next();

        try {
          // lstat, not stat: a symlink planted in the public dir would
          // otherwise be followed straight back out of it at serve time. This
          // middleware runs ahead of Vite's own server.fs deny-list, so
          // nothing downstream would catch it.
          const stat = fs.lstatSync(filePath);
          if (stat.isFile()) {
            // Let Vite's static middleware handle it by pointing to the file.
            res.setHeader("X-Content-Type-Options", "nosniff");
            const stream = fs.createReadStream(filePath);
            stream.pipe(res);
            return;
          }
        } catch {
          // File not found in external dir — fall through to default public dir
        }

        next();
      });
    },

    writeBundle(options) {
      const outDir = options.dir ?? path.resolve("dist");
      copyDirSync(resolved, outDir);
    },
  };
}

const dittoConfig = loadDittoConfig();
const publicDir = process.env.PUBLIC_DIR;
const require = createRequire(import.meta.url);
const pkg = require("./package.json") as { version: string };

/** Short commit SHA — prefer CI env var, fall back to git. */
function getCommitSha(): string {
  if (process.env.CI_COMMIT_SHORT_SHA) return process.env.CI_COMMIT_SHORT_SHA;
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

/** Git tag for the current commit — prefer CI env var, fall back to git. Empty string if untagged. */
function getCommitTag(): string {
  if (process.env.CI_COMMIT_TAG) return process.env.CI_COMMIT_TAG;
  try {
    return execSync("git describe --exact-match --tags HEAD 2>/dev/null", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

/**
 * Vite plugin that removes legacy `.woff` fallback sources from @font-face
 * `src` lists in imported CSS (the static @fontsource packages ship each font
 * as `url(x.woff2) format('woff2'), url(x.woff) format('woff')`).
 *
 * Every runtime Ditto supports — modern browsers, iOS WKWebView, Android
 * WebView — supports WOFF2 (universal since ~2016; the app's `esnext` build
 * target excludes anything older), so the `format()` negotiation never selects
 * the WOFF branch. Stripping the reference before Vite's CSS pipeline resolves
 * `url()`s means the ~46 duplicate .woff assets (~1 MB) are never emitted:
 * they'd otherwise be packed verbatim into the APK/IPA (already-compressed
 * font data, so zip can't shrink it) and published to nsite.
 *
 * Variable fonts (@fontsource-variable/*) are woff2-only and unaffected.
 */
function stripWoffFallbacks(): Plugin {
  return {
    name: "ditto:strip-woff-fallbacks",
    enforce: "pre", // run before vite:css resolves url() references
    transform(code, id) {
      if (!id.includes("@fontsource") || !/\.css(\?|$)/.test(id)) return;
      // Remove `, url(<anything>.woff) format('woff')` fallback clauses.
      // Only matches bare .woff (the woff2 clause says format('woff2')).
      const stripped = code.replace(
        /,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g,
        "",
      );
      if (stripped === code) return;
      return { code: stripped, map: null };
    },
  };
}

/**
 * GNU LibreJS support. LibreJS blocks every *external* script that doesn't
 * carry a machine-readable free-license declaration — for external scripts it
 * skips the triviality heuristic entirely, so there is no "too small to
 * matter" escape hatch. Firefox types both `<script type="module">` and
 * dynamic `import()` subresources as `script`, so every one of the ~330 chunks
 * is checked individually. A blocked chunk isn't cancelled, it's replaced with
 * a comment, which means the importing module dies on a missing export: one
 * unlabelled chunk breaks the whole app.
 *
 * Two mechanisms, deliberately both:
 *
 *  - The per-chunk `@license` comment is the reliable one, and it survives a
 *    file being copied somewhere else.
 *  - The Web Labels table lets LibreJS accept a chunk from its `onHeadersReceived`
 *    handler without buffering and regex-scanning the response body, which it
 *    otherwise does for all ~12 MB of output.
 *
 * `scripts/check-librejs.mjs` verifies the result against LibreJS's own
 * regexes; run it after touching anything here.
 */
const LIBREJS_MAGNET =
  "magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt";
/** Must match a `canonicalUrl` in LibreJS's license_definitions.json verbatim — http, not https. */
const LIBREJS_LICENSE_URL = "http://www.gnu.org/licenses/agpl-3.0.html";
const LIBREJS_LICENSE_LABEL = "AGPL-3.0-or-later";

/**
 * Corresponding-source URL for this exact build, per AGPL-3.0 section 7.
 * Memoized: it appears once per Web Labels row, and each call would otherwise
 * shell out to git twice (`git describe` throws when HEAD is untagged, which
 * is the common case, so the fallback to `rev-parse` always runs too).
 */
let cachedSourceUrl: string | undefined;
function sourceUrl(): string {
  if (cachedSourceUrl === undefined) {
    const ref = getCommitTag() || getCommitSha() || "main";
    cachedSourceUrl = `https://gitlab.com/soapbox-pub/ditto/-/tree/${ref}`;
  }
  return cachedSourceUrl;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** `.js` files copied verbatim from a public dir, which never pass through the bundler. */
function publicScripts(): string[] {
  const dirs = [path.resolve("public"), ...(publicDir ? [path.resolve(publicDir)] : [])];
  const names = new Set<string>();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".js")) names.add(entry.name);
    }
  }
  return [...names].sort();
}

/** Public path of the Web Labels page. Referenced by the link in index.html. */
const JSLICENSE_PAGE = "jslicense.html";

/**
 * Render the Web Labels page.
 *
 * `scripts` are paths relative to the site root. The href in the first cell has
 * to resolve to the exact URL of the script request: LibreJS keys the table on
 * the absolute `a.href` and looks each script up by URL. The row selector is
 * `table#jslicense-labels1 > tbody > tr`, so the <tbody> must be explicit.
 */
function renderJsLicensePage(scripts: string[], { dev }: { dev: boolean }): string {
  const rows = scripts.map((name) =>
    [
      "        <tr>",
      `          <td><a href="/${escapeHtml(name)}">${escapeHtml(name)}</a></td>`,
      `          <td><a href="${escapeHtml(LIBREJS_LICENSE_URL)}">${LIBREJS_LICENSE_LABEL}</a></td>`,
      `          <td><a href="${escapeHtml(sourceUrl())}">Ditto source</a></td>`,
      "        </tr>",
    ].join("\n"),
  );

  const scope = dev
    ? `<p><strong>This is a development server.</strong> Vite serves unbundled ES
      modules straight from <code>src/</code> and pre-bundled dependencies from
      <code>node_modules/.vite/deps/</code>. Those are not passed through the
      bundler, carry no <code>@license</code> tags, and are <em>not</em> listed
      below — LibreJS will block them. Only a production build is compliant.
      The table below covers the static scripts served verbatim from
      <code>public/</code>.</p>`
    : `<p>Each file below is a bundled, minified combined work. Alongside Ditto's
      own code it contains dependencies under the Expat (MIT), ISC, Apache-2.0,
      BSD-2-Clause, BSD-3-Clause and MPL-2.0 licenses, all of which are
      GPL-compatible; the combined work is distributed under the AGPL. Their
      individual copyright notices are in the source tree linked above.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JavaScript License Information — Ditto</title>
  </head>
  <body>
    <h1>JavaScript License Information</h1>
    <p>
      Ditto is free software, licensed under the
      <a href="${escapeHtml(LIBREJS_LICENSE_URL)}">GNU Affero General Public License</a>,
      version 3 or later. The complete corresponding source for this build is at
      <a href="${escapeHtml(sourceUrl())}">${escapeHtml(sourceUrl())}</a>.
    </p>
    ${scope}
    <table id="jslicense-labels1">
      <tbody>
${rows.join("\n")}
      </tbody>
    </table>
  </body>
</html>
`;
}

function librejsLicense(): Plugin {
  return {
    name: "ditto:librejs-license",

    // generateBundle is build-only, so without this the page 404s in dev (and
    // the SPA fallback serves index.html for it, which is worse than a 404).
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const { pathname } = new URL(req.url, "http://localhost");
        if (pathname !== `/${JSLICENSE_PAGE}`) return next();

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.end(renderJsLicensePage(publicScripts(), { dev: true }));
      });
    },

    generateBundle: {
      // Rolldown's minifier runs during the renderChunk stage, so a banner added
      // there gets stripped. generateBundle is after all of it.
      order: "post",
      handler(_options, bundle) {
        const banner =
          `// @license ${LIBREJS_MAGNET} ${LIBREJS_LICENSE_LABEL}\n` +
          `// @source: ${sourceUrl()}\n`;

        const chunks: string[] = [];
        for (const [fileName, output] of Object.entries(bundle)) {
          if (output.type !== "chunk") continue;
          chunks.push(fileName);
          // Nothing but whitespace may follow @license-end, and both tags must
          // start their own line (LibreJS matches /^\s*\/\/\s*@license.../m).
          output.code = `${banner}${output.code}\n// @license-end\n`;
        }

        // Chunk fileNames are already `assets/…`; public scripts sit at the root.
        this.emitFile({
          type: "asset",
          fileName: JSLICENSE_PAGE,
          source: renderJsLicensePage(
            [...chunks.sort(), ...publicScripts()],
            { dev: false },
          ),
        });
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
  server: {
    host: "::",
    port: 8080,
    allowedHosts: env.ALLOWED_HOSTS === "*" ? true : undefined,
    fs: {
      // The Blobbi packages are npm `file:` dependencies on the sibling
      // blobbi-kit checkout (see package.json). npm symlinks them into
      // node_modules and Vite resolves the symlink to its real path outside
      // this project root, so their built `dist/` must be allowed to be served.
      allow: [searchForWorkspaceRoot(process.cwd()), "../blobbi-kit/packages"],
    },
  },
  plugins: [
    react(),
    stripWoffFallbacks(),
    librejsLicense(),
    visualizer({
      filename: "dist/bundle.html",
      template: "treemap",
      gzipSize: true,
    }),
    ...(publicDir ? [mergePublicDir(publicDir)] : []),
  ],
  define: {
    'import.meta.env.DITTO_CONFIG': JSON.stringify(JSON.stringify(dittoConfig ?? null)),
    'import.meta.env.VERSION': JSON.stringify(pkg.version),
    'import.meta.env.BUILD_DATE': JSON.stringify(new Date().toISOString()),
    'import.meta.env.COMMIT_SHA': JSON.stringify(getCommitSha()),
    'import.meta.env.COMMIT_TAG': JSON.stringify(getCommitTag()),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Only run Ditto's own tests. The Blobbi packages (@blobbi-kit/core,
    // @blobbi-kit/react, @blobbi/renderer) are consumed from their built
    // `dist/`; their own test suites run in the blobbi-kit repository.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    onConsoleLog(log) {
      return !log.includes("React Router Future Flag Warning");
    },
    env: {
      DEBUG_PRINT_LIMIT: '0', // Suppress DOM output that exceeds AI context windows
    },
    server: {
      deps: {
        // Inline the Blobbi packages so Vitest transforms them through its
        // pipeline. Without this they could resolve as externalized modules,
        // and `vi.mock()` calls in tests (e.g. mocking '@nostrify/react')
        // would never intercept the imports made inside them. Matched on the
        // package specifier and on the linked real path under blobbi-kit.
        inline: [/@blobbi-kit\//, /@blobbi\/renderer/, /blobbi-kit\/packages\//],
      },
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Consolidate lucide icons into a single chunk instead of 60+ micro-chunks.
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide-icons';
          }
        },
      },
    },
  },
  optimizeDeps: {
    exclude: [
      '@capacitor/filesystem',
      '@capacitor/share',
      '@capacitor/app-launcher',
      // Linked from the sibling blobbi-kit checkout: kept out of dependency
      // pre-bundling so a rebuild there shows up without clearing Vite's cache.
      '@blobbi-kit/core',
      '@blobbi-kit/react',
      '@blobbi/renderer',
    ],
  },
  resolve: {
    alias: [
      // @blobbi-kit/core, @blobbi-kit/react and @blobbi/renderer resolve through
      // their package exports in node_modules (`file:` links to the sibling
      // blobbi-kit checkout), not source aliases.
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
      // The linked packages live outside this project, where a second copy of
      // React (blobbi-kit's own devDependency) is reachable by plain Node
      // resolution. Pin React to this project's copy so there is exactly one
      // runtime; `dedupe` below covers the same for the other singletons.
      { find: "react", replacement: path.resolve(import.meta.dirname, "node_modules/react") },
      { find: "react-dom", replacement: path.resolve(import.meta.dirname, "node_modules/react-dom") },
    ],
    // Dedupe the React-context-bearing singletons so a dependency can't pull in a
    // second copy of them (which breaks useContext).
    dedupe: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@nostrify/react',
      '@tanstack/react-query',
    ],
  },
};
});