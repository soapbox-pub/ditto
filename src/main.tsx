import { createRoot } from 'react-dom/client';

// Import polyfills first
import './lib/polyfills.ts';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

import '@fontsource-variable/inter';

// ─── Plausible Analytics ──────────────────────────────────────────────────────
// Enabled only when VITE_PLAUSIBLE_DOMAIN is set at build time.
if (import.meta.env.VITE_PLAUSIBLE_DOMAIN) {
  import('@plausible-analytics/tracker').then(({ init }) => {
    init({ domain: import.meta.env.VITE_PLAUSIBLE_DOMAIN });
  });
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Native status bar theming (Android APK / iOS) ───────────────────────────
// Keeps the OS top chrome in sync with the active app theme.
// Runs before React so the very first paint matches the persisted theme.
// Uses a MutationObserver so it reacts to all subsequent theme changes
// (class changes for builtin themes, style-content changes for custom themes).
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

if (Capacitor.isNativePlatform()) {
  /**
   * Read --background from the computed style of <html>, convert the HSL
   * value to a hex color, and update the native status bar to match.
   *
   * Style.Dark  = light/white icons (use on dark backgrounds)
   * Style.Light = dark/black icons  (use on light backgrounds)
   */
  function updateStatusBar() {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--background')
      .trim();

    if (!raw) return;

    // --background is in shadcn/Tailwind HSL format: "H S% L%"
    const parts = raw.replace(/%/g, '').split(/\s+/).map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return;

    const [h, s, l] = parts;

    // Convert HSL to RGB for luminance calculation
    const sn = s / 100;
    const ln = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = sn * Math.min(ln, 1 - ln);
    const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const r = Math.round(f(0) * 255);
    const g = Math.round(f(8) * 255);
    const b = Math.round(f(4) * 255);

    // WCAG relative luminance
    const toLinear = (v: number) => {
      const n = v / 255;
      return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    };
    const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    const isDark = luminance < 0.2;

    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

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
