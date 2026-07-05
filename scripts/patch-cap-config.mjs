#!/usr/bin/env node

/**
 * Post-`cap sync` fixups for the native projects.
 *
 * 1. Patch capacitor.config.json to include local (non-SPM) plugin classes.
 *    `npx cap sync` regenerates the `packageClassList` array from SPM packages
 *    only, so local plugins compiled directly into the app binary (like
 *    SandboxPlugin) are not included. This script appends them after sync so
 *    the Capacitor bridge eagerly registers them at startup.
 *
 * 2. Prune web-only files (bundle analysis report, hosting 404 page) that
 *    `cap sync` copies verbatim from dist/ into the native web asset dirs,
 *    where they only inflate the APK/IPA.
 *
 * Usage: node scripts/patch-cap-config.mjs
 * Typically run after `npx cap sync`.
 */

import { readFileSync, writeFileSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';

/** Local plugin class names to ensure are registered. */
const LOCAL_PLUGINS = ['SandboxPlugin', 'DittoNotificationPlugin'];

/**
 * Web-only files that `cap sync` copies from dist/ but that have no purpose
 * inside the native app binary:
 * - bundle.html: the 2.2MB rollup-visualizer treemap report (vite.config.ts
 *   writes it into dist/). Packing it ships our bundle analysis inside every
 *   APK/IPA.
 * - 404.html: hosting fallback for static web servers; native serves from the
 *   local Capacitor scheme and never 404s to it.
 * - og-image.jpg: Open Graph preview image; only fetched by link-preview
 *   crawlers hitting the public website, never by the app itself.
 * - favicon.ico / apple-touch-icon.png: browser tab & home-screen bookmark
 *   icons; native apps use their own launcher icons from the platform project.
 * - icon-512.png: PWA install icon, referenced only by manifest.webmanifest.
 *   (icon-192.png stays: it's the runtime notification icon in
 *   usePushNotifications and sw.js.)
 */
const NATIVE_EXCLUDES = [
  'bundle.html',
  '404.html',
  'og-image.jpg',
  'favicon.ico',
  'apple-touch-icon.png',
  'icon-512.png',
];

const platforms = ['ios/App/App', 'android/app/src/main/assets'];

for (const platform of platforms) {
  const configPath = resolve(platform, 'capacitor.config.json');

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    // Platform may not exist or config not yet generated — skip.
    continue;
  }

  const classList = new Set(config.packageClassList ?? []);
  let changed = false;

  for (const plugin of LOCAL_PLUGINS) {
    if (!classList.has(plugin)) {
      classList.add(plugin);
      changed = true;
    }
  }

  if (changed) {
    config.packageClassList = [...classList];
    writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n');
    console.log(`Patched ${configPath}: added ${LOCAL_PLUGINS.join(', ')}`);
  }
}

// Prune web-only files from the native web asset directories.
const webAssetDirs = ['ios/App/App/public', 'android/app/src/main/assets/public'];

for (const dir of webAssetDirs) {
  for (const file of NATIVE_EXCLUDES) {
    const filePath = resolve(dir, file);
    if (existsSync(filePath)) {
      rmSync(filePath);
      console.log(`Pruned ${filePath}`);
    }
  }
}
