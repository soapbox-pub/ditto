import { z } from 'zod';

import type { Theme, ContentWarningPolicy } from '@/contexts/AppContext';
import type { CoreThemeColors, ThemeConfig, ThemesConfig } from '@/themes';

// Re-export canonical schemas from the shared config module so existing
// consumers (`AppProvider`, `useEncryptedSettings`, etc.) keep working
// without changing their import paths.
export {
  CoreThemeColorsSchema,
  ThemeFontSchema,
  ThemeBackgroundSchema,
  ThemeConfigSchema,
  ThemesConfigSchema,
  ContentWarningPolicySchema,
  RelayMetadataSchema,
  FeedSettingsSchema,
} from '../../config/schema';

import {
  CoreThemeColorsSchema,
  ThemeConfigSchema,
  ThemesConfigSchema,
  ContentWarningPolicySchema,
  RelayMetadataSchema,
  FeedSettingsSchema,
} from '../../config/schema';

// ─── Type-constrained re-exports ─────────────────────────────────────

/** Zod schema for Theme validation */
export const ThemeSchema = z.enum(['dark', 'light', 'system', 'custom']) satisfies z.ZodType<Theme>;

/**
 * Accepts current theme values as well as legacy values ("black", "pink")
 * from older configs. Consumers should migrate legacy values to "custom".
 */
export const ThemeSchemaCompat = z.enum(['dark', 'light', 'system', 'custom', 'black', 'pink']);

// ─── Legacy / Compat Schemas ─────────────────────────────────────────

/**
 * Legacy schema that accepts the old 19-token ThemeTokens format.
 * Used for backward compatibility when reading old configs/events.
 * Extracts core colors from legacy format.
 */
export const LegacyThemeTokensSchema = z.object({
  background: z.string().regex(/^\d/),
  foreground: z.string().regex(/^\d/),
  primary: z.string().regex(/^\d/),
}).passthrough();

/**
 * Legacy schema that accepts the old 4-color format (with secondary).
 * Strips the secondary field and normalizes to CoreThemeColors.
 */
export const LegacyFourColorSchema = z.object({
  background: z.string().regex(/^\d/),
  text: z.string().regex(/^\d/),
  primary: z.string().regex(/^\d/),
  secondary: z.string().regex(/^\d/),
}).transform(({ background, text, primary }): CoreThemeColors => ({
  background,
  text,
  primary,
}));

/**
 * Schema that accepts CoreThemeColors, legacy 4-color, or legacy ThemeTokens,
 * always normalizing to CoreThemeColors.
 */
export const ThemeColorsCompatSchema = z.union([
  CoreThemeColorsSchema,
  LegacyFourColorSchema,
  LegacyThemeTokensSchema.transform((legacy): CoreThemeColors => ({
    background: legacy.background,
    text: legacy.foreground,
    primary: legacy.primary,
  })),
]);

/**
 * Compat schema that accepts either the new ThemeConfig format or the old
 * bare CoreThemeColors format (and all legacy color variants), normalizing
 * to ThemeConfig.
 */
export const ThemeConfigCompatSchema = z.union([
  ThemeConfigSchema,
  // Bare CoreThemeColors (old format) → wrap in ThemeConfig
  ThemeColorsCompatSchema.transform((colors): ThemeConfig => ({ colors })),
]);

// ─── AppConfigSchema ─────────────────────────────────────────────────

/**
 * Zod schema for the full AppConfig stored in localStorage.
 *
 * Uses compat sub-schemas (ThemeSchemaCompat, ThemeConfigCompatSchema) so
 * legacy values parse successfully. Migration from legacy theme values
 * ("black", "pink") to "custom" + customTheme is handled downstream by
 * the AppProvider deserializer.
 */
export const AppConfigSchema = z.object({
  theme: ThemeSchemaCompat,
  customTheme: ThemeConfigCompatSchema.optional(),
  themes: ThemesConfigSchema.optional(),
  relayMetadata: RelayMetadataSchema,
  useAppRelays: z.boolean(),
  feedSettings: FeedSettingsSchema,
  sidebarOrder: z.array(z.string()),
  nip85StatsPubkey: z.string().refine(
    (val) => val.length === 0 || (val.length === 64 && /^[0-9a-f]{64}$/i.test(val)),
    { message: 'Must be empty or a valid 64-character hex pubkey' }
  ),
  blossomServers: z.array(z.string().url()),
  defaultZapComment: z.string(),
  faviconUrl: z.string(),
  linkPreviewUrl: z.string(),
  corsProxy: z.string(),
  contentWarningPolicy: ContentWarningPolicySchema,
});

// ─── Content Filter Schemas ──────────────────────────────────────────

/** Zod schema for FilterRule validation */
export const FilterRuleSchema = z.object({
  type: z.enum(['kind', 'content-regex', 'tag', 'author-metadata']),
  field: z.string().optional(),
  operator: z.enum(['equals', 'contains', 'regex', 'not-equals', 'not-contains']),
  value: z.string(),
  caseSensitive: z.boolean().optional(),
});

/** Zod schema for ContentFilter validation */
export const ContentFilterSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  rules: z.array(FilterRuleSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// ─── EncryptedSettings Schema ────────────────────────────────────────

/**
 * Zod schema for EncryptedSettings validation.
 * All fields are optional since settings are incrementally synced.
 * Uses looseObject to preserve unknown keys from newer app versions.
 */
export const EncryptedSettingsSchema = z.looseObject({
  theme: ThemeSchemaCompat.optional(),
  customTheme: ThemeConfigCompatSchema.optional(),
  useAppRelays: z.boolean().optional(),
  feedSettings: FeedSettingsSchema.optional(),
  contentFilters: z.array(ContentFilterSchema).optional(),
  contentWarningPolicy: ContentWarningPolicySchema.optional(),
  notificationsEnabled: z.boolean().optional(),
  notificationsCursor: z.number().optional(),
  lastSync: z.number().optional(),
});
