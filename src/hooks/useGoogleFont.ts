import { useEffect, useCallback } from 'react';

import { useLocalStorage } from '@/hooks/useLocalStorage';

const STORAGE_KEY = 'ditto:google-font';
const LINK_ID = 'google-font-link';
const STYLE_ID = 'google-font-override';

/**
 * Dynamically loads a Google Font and applies it as the base font across the site.
 * The selection is persisted in localStorage so it survives page reloads.
 *
 * When a font is selected:
 * 1. A `<link>` tag is injected to load the font from Google Fonts CDN.
 * 2. A `<style>` tag overrides `font-family` on the `<html>` element.
 *
 * Pass `null` to clear the custom font and revert to the default (Inter).
 */
export function useGoogleFont() {
  const [fontFamily, setFontFamily] = useLocalStorage<string | null>(STORAGE_KEY, null);

  // Apply or remove the font whenever the value changes
  useEffect(() => {
    if (fontFamily) {
      loadGoogleFont(fontFamily);
      applyFontOverride(fontFamily);
    } else {
      removeGoogleFont();
      removeFontOverride();
    }
  }, [fontFamily]);

  const setFont = useCallback((family: string | null) => {
    setFontFamily(family);
  }, [setFontFamily]);

  return { fontFamily, setFont } as const;
}

/** Inject a <link> to load the font from Google Fonts. */
function loadGoogleFont(family: string): void {
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;

  const url = buildGoogleFontsUrl(family);

  if (link) {
    link.href = url;
  } else {
    link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }
}

/** Remove the Google Font <link>. */
function removeGoogleFont(): void {
  document.getElementById(LINK_ID)?.remove();
}

/** Inject a <style> that forces the font on the html element. */
function applyFontOverride(family: string): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  const css = `html { font-family: "${family}", "Inter Variable", Inter, system-ui, sans-serif !important; }`;

  if (style) {
    style.textContent = css;
  } else {
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }
}

/** Remove the font override <style>. */
function removeFontOverride(): void {
  document.getElementById(STYLE_ID)?.remove();
}

/** Build a Google Fonts CSS URL for a given family. Loads weights 300-700. */
function buildGoogleFontsUrl(family: string): string {
  const encoded = family.replace(/ /g, '+');
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;500;600;700&display=swap`;
}
