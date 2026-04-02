import { ReactNode, useLayoutEffect, useEffect, useRef } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme } from '@/contexts/AppContext';
import { builtinThemes, buildThemeCssFromCore, resolveTheme, resolveThemeConfig, type ThemeConfig, type ThemesConfig } from '@/themes';
import { AppConfigSchema } from '@/lib/schemas';
import { loadAndApplyFont, loadAndApplyTitleFont } from '@/lib/fontLoader';
import { hslToRgb, parseHsl, rgbToHex } from '@/lib/colorUtils';
import { z } from 'zod';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
}

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // App configuration state with localStorage persistence.
  // The deserializer uses safeParse per top-level field so that a single
  // invalid/incomplete field (e.g. feedSettings missing a new key) doesn't
  // nuke the entire config back to defaults. Valid fields are preserved.
  const [rawConfig, setConfig] = useLocalStorage<Partial<AppConfig>>(
    storageKey,
    {},
    {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null) return {};

        const result: Partial<AppConfig> = {};
        // Validate each top-level field individually
        for (const key of Object.keys(parsed)) {
          const fieldSchema = AppConfigSchema.shape[key as keyof typeof AppConfigSchema.shape];
          if (fieldSchema) {
            const fieldResult = fieldSchema.safeParse(parsed[key]);
            if (fieldResult.success) {
              (result as Record<string, unknown>)[key] = fieldResult.data;
            }
          }
        }

        // Migrate legacy blossomServers (string[]) to blossomServerMetadata
        if (!result.blossomServerMetadata) {
          const legacyServers = parsed.blossomServers;
          if (Array.isArray(legacyServers)) {
            const parsed2 = z.array(z.string().url()).safeParse(legacyServers);
            if (parsed2.success && parsed2.data.length > 0) {
              result.blossomServerMetadata = {
                servers: parsed2.data,
                updatedAt: 0,
              };
            }
          }
        }

        return result;
      }
    }
  );

  // Generic config updater with callback pattern
  const updateConfig = (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => {
    setConfig(updater);
  };

  const config = {
    ...defaultConfig,
    ...rawConfig,
    // Deep-merge feedSettings so new keys added to the default are visible
    // even for existing users who have an older feedSettings in localStorage.
    feedSettings: { ...defaultConfig.feedSettings, ...rawConfig.feedSettings },
  };

  const appContextValue: AppContextType = {
    config,
    updateConfig,
  };

  // Apply theme effects to document
  useApplyTheme(config.theme, config.customTheme, config.themes);
  useApplyFonts(config.theme, config.customTheme, config.themes);
  useApplyBackground(config.theme, config.customTheme, config.themes);
  useApplyFavicon(config.theme, config.customTheme, config.themes);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to apply theme changes to the document root via an injected <style> tag.
 * When theme is "system", resolves to "light" or "dark" based on OS preference
 * and listens for changes to prefers-color-scheme.
 * When theme is "custom", uses the provided customTheme colors (derived to full tokens).
 * When theme is "light" or "dark", uses configured themes if available, otherwise builtin themes.
 */
function useApplyTheme(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  useLayoutEffect(() => {
    function apply() {
      const resolved = resolveTheme(theme);
      let css: string;

      if (resolved === 'custom') {
        // Use custom theme colors, falling back to dark if not yet set
        const colors = customTheme?.colors ?? builtinThemes.dark;
        css = buildThemeCssFromCore(colors);
      } else {
        css = buildThemeCssFromCore(resolveThemeConfig(resolved, themes).colors);
      }

      let el = document.getElementById('theme-vars') as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement('style');
        el.id = 'theme-vars';
        document.head.appendChild(el);
      }
      el.textContent = css;
      document.documentElement.className = resolved;
      // Now that CSS variables are set, the inline body background from
      // theme.js is no longer needed — bg-background will resolve correctly.
      document.body.removeAttribute('style');
    }

    apply();

    // When theme is "system", listen for OS color scheme changes
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme, customTheme, themes]);
}

/**
 * Hook to load and apply custom fonts when the theme config changes.
 * Applies fonts from custom themes, or from configured light/dark themes if available.
 */
function useApplyFonts(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  const resolved = resolveTheme(theme);
  const activeConfig = resolved === 'custom' ? customTheme : resolveThemeConfig(resolved, themes);
  const fontFamily = activeConfig?.font?.family;
  const fontUrl = activeConfig?.font?.url;
  const titleFontFamily = activeConfig?.titleFont?.family;
  const titleFontUrl = activeConfig?.titleFont?.url;

  useEffect(() => {
    if (fontFamily) {
      loadAndApplyFont({ family: fontFamily, url: fontUrl });
    } else {
      // Clear any custom font overrides when no font is configured
      loadAndApplyFont(undefined);
    }
  }, [theme, fontFamily, fontUrl]);

  useEffect(() => {
    if (titleFontFamily) {
      loadAndApplyTitleFont({ family: titleFontFamily, url: titleFontUrl });
    } else {
      // Clear any custom title font overrides when no title font is configured
      loadAndApplyTitleFont(undefined);
    }
  }, [theme, titleFontFamily, titleFontUrl]);
}

/** Style element ID for background image CSS. */
const BG_STYLE_ID = 'theme-background';

/**
 * Hook to apply or remove a background image when the theme config changes.
 * Supports backgrounds from custom themes and configured light/dark themes.
 */
function useApplyBackground(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  const resolved = resolveTheme(theme);
  const activeConfig = resolved === 'custom' ? customTheme : resolveThemeConfig(resolved, themes);
  const bgUrl = activeConfig?.background?.url;
  const bgMode = activeConfig?.background?.mode ?? 'cover';

  useEffect(() => {
    let style = document.getElementById(BG_STYLE_ID) as HTMLStyleElement | null;

    if (!bgUrl) {
      style?.remove();
      return;
    }

    if (!style) {
      style = document.createElement('style');
      style.id = BG_STYLE_ID;
      document.head.appendChild(style);
    }

    let css: string;
    if (bgMode === 'tile') {
      css = `body { background-image: url("${bgUrl}"); background-repeat: repeat; background-size: auto; }`;
    } else {
      css = `body { background-image: url("${bgUrl}"); background-size: cover; background-repeat: no-repeat; background-position: center; background-attachment: fixed; }`;
    }

    style.textContent = css;

    return () => {
      document.getElementById(BG_STYLE_ID)?.remove();
    };
  }, [theme, bgUrl, bgMode]);
}

/**
 * Hook to dynamically recolor the favicon to match the current primary color.
 * Uses the same mask approach as DittoLogo: loads the SVG, draws it as a mask
 * on a canvas filled with the primary color, and sets the result as the favicon.
 */
function useApplyFavicon(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  const resolved = resolveTheme(theme);
  const colors = resolved === 'custom'
    ? (customTheme?.colors ?? builtinThemes.dark)
    : resolveThemeConfig(resolved, themes).colors;
  const primary = colors.primary;

  // Cache the loaded SVG blob URL across renders.
  const svgBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function updateFavicon() {
      // Load the SVG once and cache it as a blob URL for canvas use.
      if (!svgBlobUrlRef.current) {
        try {
          const resp = await fetch('/logo.svg');
          const text = await resp.text();
          const blob = new Blob([text], { type: 'image/svg+xml' });
          svgBlobUrlRef.current = URL.createObjectURL(blob);
        } catch {
          return; // Silently fail if SVG can't be loaded
        }
      }

      if (cancelled) return;

      const size = 128;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.src = svgBlobUrlRef.current!;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
      });

      if (cancelled) return;

      // Fill the canvas with the primary color.
      const { h, s, l } = parseHsl(primary);
      const [r, g, b] = hslToRgb(h, s, l);
      ctx.fillStyle = rgbToHex(r, g, b);
      ctx.fillRect(0, 0, size, size);

      // Use the SVG as a mask (destination-in keeps only the logo shape).
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(img, 0, 0, size, size);

      const dataUrl = canvas.toDataURL('image/png');

      // Update the favicon link element.
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) {
        link.type = 'image/png';
        link.href = dataUrl;
      }
    }

    updateFavicon();

    return () => {
      cancelled = true;
    };
  }, [primary]);
}
