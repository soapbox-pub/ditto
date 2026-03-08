import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react-swc";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { DittoConfigSchema } from "./src/lib/schemas";

/**
 * Load and validate the build-time ditto.json configuration file.
 * Returns the parsed config object, or `undefined` if the file doesn't exist.
 * Set the CONFIG_FILE env var to override the default path ("./ditto.json").
 */
function loadDittoConfig(): object | undefined {
  const configPath = path.resolve(process.env.CONFIG_FILE ?? "./ditto.json");

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

/** Git-based version string for Sentry releases. */
function getVersion(): string {
  try {
    return execSync("git describe --tags --always --dirty", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}


// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    ...(publicDir ? [mergePublicDir(publicDir)] : []),
  ],
  define: {
    __DITTO_CONFIG__: JSON.stringify(dittoConfig ?? null),
    'import.meta.env.VERSION': JSON.stringify(getVersion()),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    onConsoleLog(log) {
      return !log.includes("React Router Future Flag Warning");
    },
    env: {
      DEBUG_PRINT_LIMIT: '0', // Suppress DOM output that exceeds AI context windows
    },
    server: {
      deps: {
        inline: ['@samthomson/nostr-messaging'],
      },
    },
  },
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
}));