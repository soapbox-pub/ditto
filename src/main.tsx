import { createRoot } from 'react-dom/client';

// Import polyfills first (Buffer must be globally available before bitcoinjs-lib)
import './lib/polyfills.ts';

// Initialize ECC library for bitcoinjs-lib (Taproot / Schnorr support)
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
bitcoin.initEccLib(ecc);

// Kick off cache hydration early so data is ready before components render.
import { hydrateNip05Cache } from '@/lib/nip05Cache';
import { hydrateProfileCache } from '@/lib/profileCache';
hydrateNip05Cache();
hydrateProfileCache();

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

import '@fontsource-variable/inter';

// ─── Native status bar theming (Android APK / iOS) ───────────────────────────
// Keeps the OS top chrome in sync with the active app theme.
// Runs before React so the very first paint matches the persisted theme.
// Uses a MutationObserver so it reacts to all subsequent theme changes
// (class changes for builtin themes, style-content changes for custom themes).
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { getBackgroundThemeMode, getBackgroundHex } from '@/lib/colorUtils';

if (Capacitor.isNativePlatform()) {
  /**
   * Read --background from the computed style of <html>, convert the HSL
   * value to a hex color, and update the native status bar to match.
   *
   * Style.Dark  = light/white icons (use on dark backgrounds)
   * Style.Light = dark/black icons  (use on light backgrounds)
   */
  function updateStatusBar() {
    const hex = getBackgroundHex();
    if (!hex) return;

    const isDark = getBackgroundThemeMode() === 'dark';

    StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: hex }).catch(() => {});
  }

  // Apply immediately (theme class is set synchronously by AppProvider useLayoutEffect
  // before the first React paint, but we still try early in case it's already set).
  updateStatusBar();

  // Re-apply whenever the theme class changes on <html> (light / dark / custom)
  const classObserver = new MutationObserver(() => updateStatusBar());
  classObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  // Re-apply whenever the injected <style id="theme-vars"> content changes
  // (covers custom themes that change CSS variables without changing the class).
  const styleObserver = new MutationObserver(() => updateStatusBar());
  const observeThemeVars = () => {
    const el = document.getElementById('theme-vars');
    if (el) {
      styleObserver.observe(el, { characterData: true, childList: true, subtree: true });
    }
  };
  // The style element may not exist yet — watch <head> for it to appear.
  observeThemeVars();
  const headObserver = new MutationObserver(() => observeThemeVars());
  headObserver.observe(document.head, { childList: true });
}
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Remove the HTML preloader after React has painted.
requestAnimationFrame(() => {
  document.getElementById('preloader')?.remove();
});
