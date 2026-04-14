#!/usr/bin/env node

/**
 * Patch capacitor.config.json to include local (non-SPM) plugin classes.
 *
 * `npx cap sync` regenerates the `packageClassList` array from SPM packages
 * only, so local plugins compiled directly into the app binary (like
 * SandboxPlugin) are not included. This script appends them after sync so
 * the Capacitor bridge eagerly registers them at startup.
 *
 * Usage: node scripts/patch-cap-config.mjs
 * Typically run after `npx cap sync`.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/** Local plugin class names to ensure are registered. */
const LOCAL_PLUGINS = ['SandboxPlugin', 'DittoNotificationPlugin'];

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
