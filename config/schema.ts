/**
 * Canonical Zod schemas for Ditto configuration.
 *
 * This file is deliberately free of path-alias (`@/`) imports so it can be
 * consumed from both the Vite config (Node / esbuild context) and from
 * runtime application code via `src/lib/schemas.ts`.
 *
 * These are the "strict" versions of each schema. Legacy/compat wrappers
 * (for old localStorage formats, encrypted settings, etc.) are layered on
 * top in `src/lib/schemas.ts`.
 */
import { z } from 'zod';

// ─── Primitives ───────────────────────────────────────────────────────

/** HSL value string like "258 70% 55%" */
export const HslValue = z.string().regex(/^\d/);

export const CoreThemeColorsSchema = z.object({
  background: HslValue,
  text: HslValue,
  primary: HslValue,
});

export const ThemeFontSchema = z.object({
  family: z.string(),
  url: z.string().optional(),
});

export const ThemeBackgroundSchema = z.object({
  url: z.string(),
  mode: z.enum(['cover', 'tile']).optional(),
  dimensions: z.string().optional(),
  mimeType: z.string().optional(),
  blurhash: z.string().optional(),
});

export const ThemeConfigSchema = z.object({
  title: z.string().optional(),
  colors: CoreThemeColorsSchema,
  font: ThemeFontSchema.optional(),
  background: ThemeBackgroundSchema.optional(),
});

export const ThemesConfigSchema = z.object({
  light: ThemeConfigSchema,
  dark: ThemeConfigSchema,
});

export const ThemeSchema = z.enum(['dark', 'light', 'system', 'custom']);
export const ContentWarningPolicySchema = z.enum(['blur', 'hide', 'show']);

export const RelayMetadataSchema = z.object({
  relays: z.array(z.object({
    url: z.string().url(),
    read: z.boolean(),
    write: z.boolean(),
  })),
  updatedAt: z.number(),
});

export const FeedSettingsSchema = z.object({
  feedIncludePosts: z.boolean().optional(),
  feedIncludeReposts: z.boolean().optional(),
  feedIncludeArticles: z.boolean().optional(),
  showArticles: z.boolean().optional(),
  showVines: z.boolean().optional(),
  showPolls: z.boolean().optional(),
  showTreasures: z.boolean().optional(),
  showTreasureGeocaches: z.boolean().optional(),
  showTreasureFoundLogs: z.boolean().optional(),
  showColors: z.boolean().optional(),
  showPacks: z.boolean().optional(),
  showStreams: z.boolean().optional(),
  feedIncludeVines: z.boolean().optional(),
  feedIncludePolls: z.boolean().optional(),
  feedIncludeTreasureGeocaches: z.boolean().optional(),
  feedIncludeTreasureFoundLogs: z.boolean().optional(),
  feedIncludeColors: z.boolean().optional(),
  feedIncludePacks: z.boolean().optional(),
  feedIncludeStreams: z.boolean().optional(),
  showDecks: z.boolean().optional(),
  feedIncludeDecks: z.boolean().optional(),
  showProfileThemes: z.boolean().optional(),
  feedIncludeProfileThemes: z.boolean().optional(),
  showCustomProfileThemes: z.boolean().optional(),
}).passthrough();

// ─── DittoConfigSchema (build-time ditto.json) ───────────────────────

/**
 * Schema for the build-time `ditto.json` configuration file.
 * All fields are optional — only the values provided will override
 * the hardcoded defaults at build time.
 */
export const DittoConfigSchema = z.object({
  theme: ThemeSchema.optional(),
  customTheme: ThemeConfigSchema.optional(),
  themes: ThemesConfigSchema.optional(),
  relayMetadata: RelayMetadataSchema.optional(),
  useAppRelays: z.boolean().optional(),
  feedSettings: FeedSettingsSchema.optional(),
  sidebarOrder: z.array(z.string()).optional(),
  nip85StatsPubkey: z.string().optional(),
  blossomServers: z.array(z.string().url()).optional(),
  defaultZapComment: z.string().optional(),
  faviconUrl: z.string().optional(),
  linkPreviewUrl: z.string().optional(),
  corsProxy: z.string().optional(),
  contentWarningPolicy: ContentWarningPolicySchema.optional(),
}).strict();

/** Inferred type for the build-time configuration. */
export type DittoConfig = z.infer<typeof DittoConfigSchema>;
