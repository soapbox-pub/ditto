# Theme System

This document describes the two separate but overlapping theme features in Ditto: the **App Theme** (which controls the local UI) and the **Profile Theme** (which is published to Nostr for others to see). Understanding the distinction is key to working with this codebase.

## Overview

| Concept | Purpose | Scope | Persistence |
|---|---|---|---|
| **App Theme** | Controls colors, fonts, and background of the local UI | Local to the user's browser | localStorage + encrypted NIP-78 sync |
| **Profile Theme** | A set of theme values published as a Nostr event | Public, visible to other users | Kind 16767 replaceable event |

The App Theme and Profile Theme share the same underlying data structure (`ThemeConfig`), and there is an optional bridge between them (`autoShareTheme`), but they are fundamentally independent systems.

---

## Part 1: App Theme

The App Theme controls what the user sees in their own browser. It has no inherent connection to Nostr.

### Core Concept: 3 Colors Define Everything

The entire theme is derived from just 3 core colors, defined by the `CoreThemeColors` interface in `src/themes.ts:8`:

```typescript
interface CoreThemeColors {
  background: string;  // HSL string, e.g. "228 20% 10%"
  text: string;        // Text/foreground color
  primary: string;     // Primary accent (buttons, links, focus rings)
}
```

From these 3 values, the system auto-derives 19 CSS tokens (the full `ThemeTokens` set) via `deriveTokensFromCore()` in `src/lib/colorUtils.ts:141`. The derivation algorithm:

- Detects dark/light mode from background luminance (threshold: 0.2)
- Derives `card` and `popover` surfaces by slightly lightening the background (dark mode) or using it directly (light mode)
- Derives `secondary` and `muted` surfaces by adjusting background lightness
- Derives `border` using the primary hue with reduced saturation
- Computes `mutedForeground` as a dimmer version of the text color
- Sets `accent = primary` and `ring = primary`
- Auto-computes `primaryForeground` using WCAG contrast detection (white or dark)
- Uses fixed red values for `destructive` / `destructiveForeground`

### Theme Modes

The `Theme` type (`src/contexts/AppContext.ts:9`) has four values:

| Mode | Behavior |
|---|---|
| `"light"` | Uses the builtin (or configured) light color set |
| `"dark"` | Uses the builtin (or configured) dark color set |
| `"system"` | Resolves to `"light"` or `"dark"` based on `prefers-color-scheme`, with a live media query listener |
| `"custom"` | Uses user-defined colors stored in `config.customTheme` |

**Builtin themes** are defined in `src/themes.ts:102`:

```typescript
const builtinThemes = {
  light: { background: '270 50% 97%', text: '270 25% 12%', primary: '270 65% 55%' },
  dark:  { background: '228 20% 10%', text: '210 40% 98%', primary: '258 70% 60%' },
};
```

Self-hosters can override these at build time via `ditto.json` (injected through `import.meta.env.DITTO_CONFIG` in `vite.config.ts`), or at runtime via the `ThemesConfig` in `AppConfig.themes`.

### ThemeConfig

The `ThemeConfig` type (`src/themes.ts:50`) wraps the 3 core colors with optional extras:

```typescript
interface ThemeConfig {
  title?: string;
  colors: CoreThemeColors;
  font?: ThemeFont;        // { family: string; url?: string }
  background?: ThemeBackground;  // { url: string; mode?: 'cover' | 'tile'; ... }
}
```

This is the canonical type used everywhere: in `AppConfig.customTheme`, in encrypted settings, and in Nostr theme events.

### Theme Presets

Named presets are defined in `src/themes.ts:136` (e.g. `pink`, `toxic`, `sunset`). Each preset includes core colors and optionally a font and background image. Applying a preset sets the app theme to `"custom"` and stores the preset's config as `customTheme`.

### How Themes Apply to the DOM

The theme pipeline has three stages designed to prevent any flash of wrong colors:

#### Stage 1: Pre-React Blocking Script (`public/theme.js`)

A synchronous `<script>` tag in `index.html:43` runs before React mounts. It:

1. Reads `nostr:app-config` from localStorage
2. Resolves `"system"` via `matchMedia`
3. Handles legacy presets (`"black"`, `"pink"`)
4. Sets `document.documentElement.className` to the theme name
5. Sets `document.body.style.background` to the correct background color
6. Updates preloader colors (logo and spinner) to match

This prevents any visible flash between the hardcoded dark defaults in `index.html:32` and the user's actual theme.

#### Stage 2: React Provider (`src/components/AppProvider.tsx`)

Three private hooks run during the provider's lifecycle:

**`useApplyTheme`** (line 91) - Uses `useLayoutEffect` (synchronous before paint) to:
- Resolve the theme mode
- Build a full CSS string from `CoreThemeColors` via `buildThemeCssFromCore()`
- Inject/update a `<style id="theme-vars">` element with all 19 CSS custom properties
- Set `document.documentElement.className` to the resolved theme
- Remove the inline body style left by `theme.js`
- When mode is `"system"`, attach a `matchMedia` change listener

**`useApplyFonts`** (line 133) - Loads and applies custom fonts via `loadAndApplyFont()` from `src/lib/fontLoader.ts`.

**`useApplyBackground`** (line 156) - Injects/removes a `<style id="theme-background">` for background images (cover or tile mode).

#### Stage 3: Theme Switch (`src/hooks/useTheme.ts`)

The `setTheme()` function (line 52) performs a flicker-free theme switch:

1. Injects a temporary `<style>` that disables all CSS transitions (`transition: none !important`)
2. Synchronously builds and applies CSS vars before React re-renders
3. Updates `document.documentElement.className`
4. Re-enables transitions after browser paint via `requestAnimationFrame`
5. Updates localStorage config
6. Debounce-syncs to encrypted NIP-78 storage (1 second delay)

### How Components Consume Theme Values

#### CSS Custom Properties to Tailwind

`tailwind.config.ts` maps all 19 CSS custom properties to Tailwind color utilities:

```typescript
colors: {
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
  // ... (secondary, destructive, muted, accent, popover, card, border, input, ring)
}
```

Components use standard Tailwind classes like `bg-primary`, `text-foreground`, `border-border`, etc. These resolve to `hsl(var(--primary))`, which picks up whichever values are currently set on `:root`.

The `cn()` utility in `src/lib/utils.ts` combines `clsx` (conditional class joining) with `tailwind-merge` (intelligent Tailwind class deduplication).

#### Static CSS

`src/index.css` applies base styles using theme tokens:

```css
* { @apply border-border; }
body { @apply bg-background text-foreground; }
```

The only static CSS custom property is `--radius: 0.75rem`. All color variables are injected dynamically.

### ScopedTheme

The `ScopedTheme` component (`src/components/ScopedTheme.tsx`) applies a different set of theme colors to a DOM subtree by setting CSS variables as inline `style`:

```tsx
<ScopedTheme colors={someColors} className="rounded-lg p-4">
  {/* Children here see different --background, --primary, etc. */}
</ScopedTheme>
```

It also sets `data-theme-mode="dark"` or `"light"` based on background luminance, for CSS targeting.

### App Theme Persistence

#### Layer 1: localStorage (immediate)

The `useLocalStorage` hook (`src/hooks/useLocalStorage.ts`) stores the full `AppConfig` under key `"nostr:app-config"`. This includes `theme`, `customTheme`, `autoShareTheme`, and `themes`. Changes are reflected immediately and support cross-tab sync via `StorageEvent`.

#### Layer 2: Encrypted NIP-78 Settings (cross-device sync)

The `useEncryptedSettings` hook (`src/hooks/useEncryptedSettings.ts`) stores theme preferences in a kind 30078 addressable event, encrypted to self via NIP-44. The `EncryptedSettings` interface includes `theme`, `customTheme`, and `autoShareTheme` among other app settings.

Key behaviors:
- Query is delayed 5 seconds after login to avoid competing with feed load
- Uses optimistic updates with a `pendingSettings` ref for rapid successive mutations
- A `recentlyWritten()` guard returns true for 10 seconds after a local write to prevent `NostrSync` from overwriting the value that was just saved

#### Sync via NostrSync

The `NostrSync` component (`src/components/NostrSync.tsx`) runs globally and syncs encrypted settings from Nostr on login. For theme-related fields, it:

1. Seeds a `lastSyncedTimestamp` ref on first load to prevent stale events from overwriting local config
2. Skips application if `recentlyWritten()` is true
3. Only applies changes if the remote timestamp is newer
4. Handles legacy theme value migration (`"black"`, `"pink"` to `"custom"`)
5. Diffs each field individually to avoid unnecessary re-renders

---

## Part 2: Profile Theme

The Profile Theme is a public Nostr event that represents a user's chosen theme. Other clients can read it to style that user's profile page, or users can browse and copy each other's themes.

### Nostr Event Kinds

#### Kind 36767: Theme Definition (addressable, multiple per user)

A shareable, named theme that a user has created. Think of these as "published theme presets." Tags:

| Tag | Purpose | Example |
|---|---|---|
| `d` | Identifier (slug) | `["d", "ocean-night"]` |
| `c` | Color (hex + role) | `["c", "#1a1a2e", "background"]` |
| `f` | Font (family + optional URL) | `["f", "Comfortaa", "https://cdn.jsdelivr.net/..."]` |
| `bg` | Background (imeta-style variadic) | `["bg", "url https://...", "mode cover", "m image/jpeg"]` |
| `title` | Display name | `["title", "Ocean Night"]` |
| `alt` | NIP-31 description | `["alt", "Custom theme: Ocean Night"]` |
| `t` | Topic tag | `["t", "theme"]` |
| `description` | Optional description | `["description", "A deep blue theme"]` |

Colors are stored as **hex** in `c` tags (converted to/from HSL internally). The `content` field is empty (legacy events may have JSON in content for backward compatibility).

#### Kind 16767: Active Profile Theme (replaceable, one per user)

The user's currently active profile theme. Same tag structure as kind 36767 but without `d` or `description` tags, and with an optional `a` tag referencing the source theme definition:

| Tag | Purpose |
|---|---|
| `c` | Color tags (same as 36767) |
| `f` | Font tag (same as 36767) |
| `bg` | Background tag (same as 36767) |
| `alt` | Always `"Active profile theme"` |
| `title` | Optional theme name |
| `a` | Optional reference to source kind 36767 event |

### Hooks

| Hook | File | Purpose |
|---|---|---|
| `usePublishTheme` | `src/hooks/usePublishTheme.ts` | Publish/update/delete theme definitions (36767), set/clear active profile theme (16767) |
| `useUserThemes` | `src/hooks/useUserThemes.ts` | Query all kind 36767 themes by a user, deduplicated by d-tag, sorted newest first |
| `useActiveProfileTheme` | `src/hooks/useActiveProfileTheme.ts` | Query a user's kind 16767 active profile theme |

### Publishing and Parsing

All event building and parsing is in `src/lib/themeEvent.ts`:

- `buildThemeDefinitionTags()` / `parseThemeDefinition()` - Kind 36767
- `buildActiveThemeTags()` / `parseActiveProfileTheme()` - Kind 16767
- `buildColorTags()` / `parseColorTags()` - HSL-to-hex conversion for `c` tags
- `buildFontTag()` / `parseFontTag()` - Font `f` tags
- `buildBackgroundTag()` / `parseBackgroundTag()` - Background `bg` tags (imeta-style)
- `titleToSlug()` - Generate d-tag identifiers from titles

Backward compatibility: if `c` tags are missing, the parser falls back to reading legacy JSON from `content` (handling both the old 19-token format and the 4-color format).

---

## Part 3: The Bridge Between App Theme and Profile Theme

The two systems are connected by the **autoShareTheme** setting and the NostrSync component.

### App Theme -> Profile Theme

When `autoShareTheme` is enabled (default: `true`) and the user applies a custom theme via `applyCustomTheme()`, the `useTheme` hook automatically publishes the custom theme as a kind 16767 active profile theme, debounced by 2 seconds.

```
User picks a custom theme
  -> applyCustomTheme() in useTheme.ts:88
    -> Updates local config (localStorage)
    -> Syncs to encrypted NIP-78 storage (1s debounce)
    -> If autoShareTheme: publishes kind 16767 (2s debounce)
```

### Profile Theme -> App Theme

On page load, if `autoShareTheme` is enabled, `NostrSync` (line 174) fetches the user's kind 16767 event and applies it as `customTheme` **without changing the theme mode**. This means:

- If the user is on `theme: "dark"`, their profile theme is stored as `customTheme` but the UI stays in dark mode
- If the user is on `theme: "custom"`, the profile theme's colors are applied to the UI
- This allows the profile theme to stay in sync across devices without forcing the user into custom mode

### Theme Definitions (Kind 36767)

Theme definitions are independent of the app theme. Users can create, publish, edit, and delete named themes. Other users can view them in feeds (via `ThemeUpdateCard`) and copy them. These are purely social objects on the Nostr network.

---

## Font System

Fonts are managed by `src/lib/fontLoader.ts` and `src/lib/fonts.ts`.

### Bundled Fonts

10 fonts are bundled via `@fontsource` packages with lazy loading (dynamic imports):

| Category | Fonts |
|---|---|
| Sans | Inter, DM Sans, Outfit, Montserrat |
| Serif | Lora, Merriweather, Playfair Display |
| Mono | JetBrains Mono |
| Display | Comfortaa |
| Handwriting | Comic Relief |

Each has a `load()` function and a `cdnUrl` for Nostr event publishing.

### Font Application

Three `<style>` elements manage fonts:

| ID | Purpose |
|---|---|
| `theme-font-faces` | `@font-face` rules for remote fonts |
| `theme-font-overrides` | `html { font-family: "CustomFont", "Inter Variable", ... !important; }` |
| `theme-vars` | Theme CSS custom properties (not font-specific, but part of the pipeline) |

The `loadAndApplyFont()` function:
1. Tries to load via bundled `@fontsource` package first
2. Falls back to injecting a `@font-face` rule from a remote URL
3. Applies a global font-family override via `<style id="theme-font-overrides">`
4. Passing `undefined` clears the override (reverts to default Inter)

---

## Color Utilities

`src/lib/colorUtils.ts` provides the color math underpinning the theme system:

| Function | Purpose |
|---|---|
| `parseHsl` / `formatHsl` | Parse/format HSL strings (`"228 20% 10%"`) |
| `hslToRgb` / `rgbToHsl` | HSL-RGB conversion |
| `hexToRgb` / `rgbToHex` | Hex-RGB conversion |
| `hexToHslString` / `hslStringToHex` | Direct hex-to-HSL-string conversion (used for Nostr `c` tags) |
| `getLuminance` | WCAG 2.1 relative luminance |
| `getContrastRatio` / `getContrastRatioHsl` | WCAG contrast ratio between two colors |
| `isDarkTheme` | Determines if a background is "dark" (luminance < 0.2) |
| `deriveTokensFromCore` | The core algorithm: 3 colors -> 19 tokens |
| `tokensToCoreColors` | Extract 3 core colors from a legacy 19-token object |

All colors are stored internally as HSL strings without the `hsl()` wrapper (e.g. `"228 20% 10%"`). The `hsl()` wrapper is added by Tailwind's config (`hsl(var(--background))`).

---

## Validation

Theme data is validated with Zod schemas in `src/lib/schemas.ts`:

- `ThemeSchema` - Validates `'dark' | 'light' | 'system' | 'custom'`
- `CoreThemeColorsSchema` - Validates the 3 HSL string fields
- `ThemeConfigSchema` - Full config with optional font/background
- `ThemeConfigCompatSchema` - Accepts both `ThemeConfig` and bare `CoreThemeColors`
- `ThemeColorsCompatSchema` - Union of current 3-color, old 4-color, and legacy 19-token formats
- `AppConfigSchema` - Full app config including all theme fields
- `EncryptedSettingsSchema` - Encrypted settings including theme fields

The `AppProvider` deserializer (`src/components/AppProvider.tsx:32`) validates each top-level field individually with `safeParse`, so a single invalid field doesn't nuke the entire config.

---

## File Index

| File | Role |
|---|---|
| `src/themes.ts` | Core types (`CoreThemeColors`, `ThemeConfig`, `ThemeTokens`), builtin themes, presets, CSS builders |
| `src/lib/colorUtils.ts` | Color conversion, contrast detection, token derivation |
| `src/lib/themeEvent.ts` | Nostr event kinds (36767, 16767), tag building/parsing |
| `src/lib/fontLoader.ts` | Font loading and CSS injection |
| `src/lib/fonts.ts` | Bundled font definitions |
| `src/lib/schemas.ts` | Zod validation schemas |
| `src/contexts/AppContext.ts` | `Theme` type, `AppConfig` interface, React context |
| `src/hooks/useTheme.ts` | Primary theme API: `setTheme()`, `applyCustomTheme()`, `setAutoShareTheme()` |
| `src/hooks/useAppContext.ts` | Context consumer hook |
| `src/hooks/useEncryptedSettings.ts` | NIP-78 encrypted settings (cross-device sync) |
| `src/hooks/usePublishTheme.ts` | Publish theme definitions and active profile theme |
| `src/hooks/useUserThemes.ts` | Query user's theme definitions |
| `src/hooks/useActiveProfileTheme.ts` | Query user's active profile theme |
| `src/components/AppProvider.tsx` | Theme application to DOM (`useApplyTheme`, `useApplyFonts`, `useApplyBackground`) |
| `src/components/NostrSync.tsx` | Cross-device sync for encrypted settings and profile theme |
| `src/components/ScopedTheme.tsx` | Scoped CSS variable overrides for subtrees |
| `src/components/ThemeSelector.tsx` | Full settings UI for theme management |
| `src/components/SidebarThemeDropdown.tsx` | Compact theme picker dropdown |
| `public/theme.js` | Pre-React blocking script for flash prevention |
| `index.html` | Hardcoded dark defaults, preloader, blocking script tag |
| `tailwind.config.ts` | CSS custom property to Tailwind color mapping |
| `src/index.css` | Base styles using theme tokens |
