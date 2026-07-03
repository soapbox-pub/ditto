import process from "node:process";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv, type Plugin } from "vite";

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

        const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
        const filePath = path.join(resolved, urlPath);

        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            // Let Vite's static middleware handle it by pointing to the file.
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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // The nsite build (`vite build --mode nsite`) emits a minimal number of files.
  // nsite is published by signing a site *manifest* (the list of every file in
  // dist/) through a NIP-46 bunker, which NIP-44-encrypts the whole sign_event
  // request — and that must stay under 65535 bytes. The normal ~470-chunk build
  // overflows it ("invalid plaintext size"). In nsite mode we disable code
  // splitting so the app ships as one app.js + one app.css, dropping dist/ to
  // ~one-third the files. Every other build keeps fine-grained lazy loading.
  const isNsite = mode === 'nsite';

  return {
  server: {
    host: "::",
    port: 8080,
    allowedHosts: env.ALLOWED_HOSTS === "*" ? true : undefined,
  },
  plugins: [
    react(),
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
    // Only run Ditto's own tests. The in-repo packages/blobbi-* directories are
    // kept as source history / fallback and are no longer consumed (Ditto now
    // depends on the published @blobbi-kit/* packages); their internal tests
    // still import the old @blobbi/* names, which no longer resolve here.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    onConsoleLog(log) {
      return !log.includes("React Router Future Flag Warning");
    },
    env: {
      DEBUG_PRINT_LIMIT: '0', // Suppress DOM output that exceeds AI context windows
    },
    server: {
      deps: {
        // Inline the published @blobbi-kit packages so Vitest transforms them
        // through its pipeline. Without this they resolve as externalized
        // node_modules, and `vi.mock()` calls in tests (e.g. mocking
        // '@nostrify/react') never intercept the imports made inside them.
        inline: [/@blobbi-kit\//],
      },
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: isNsite
        ? {
            // Disable code splitting so every dynamic import folds into the single
            // entry chunk: the build emits exactly one JS file, and Vite emits one
            // CSS file alongside it.
            codeSplitting: false,
            entryFileNames: 'assets/app-[hash].js',
            assetFileNames: (assetInfo: { names?: string[] }) => {
              const name = assetInfo.names?.[0] ?? '';
              if (name.endsWith('.css')) return 'assets/app-[hash].css';
              return 'assets/[name]-[hash][extname]';
            },
          }
        : {
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
    exclude: ['@capacitor/filesystem', '@capacitor/share'],
  },
  resolve: {
    alias: [
      // @blobbi-kit/core and @blobbi-kit/react resolve through their installed
      // package exports in node_modules (published npm packages), not source aliases.
      { find: "@", replacement: path.resolve(__dirname, "./src") },
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