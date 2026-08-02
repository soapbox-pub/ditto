import { z } from 'zod';
import type { Tool } from '@soapbox.pub/nostr-canvas/devkit';
import { bundledFonts } from '@/lib/fonts';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import type { ThemeConfig } from '@/themes';

/** The list of available bundled font names for the tool description. */
const AVAILABLE_FONTS = bundledFonts.map((f) => f.family).join(', ');

const inputSchema = z.object({
  background: z
    .string()
    .describe('Background color as an HSL string (e.g. "228 20% 10%" for dark blue, "0 0% 100%" for white). This is the main page background.'),
  text: z
    .string()
    .describe('Text/foreground color as an HSL string (e.g. "210 40% 98%" for near-white, "0 0% 10%" for near-black). Must contrast well with the background.'),
  primary: z
    .string()
    .describe('Primary accent color as an HSL string (e.g. "258 70% 60%" for purple, "142 70% 45%" for green). Used for buttons, links, and interactive elements.'),
  font: z
    .string()
    .optional()
    .describe(`Optional font family name. Must be one of the available bundled fonts: ${AVAILABLE_FONTS}. Choose a font that matches the theme's mood and aesthetic.`),
  background_url: z
    .string()
    .optional()
    .describe('Optional URL to a background image. Should be a direct link to a publicly accessible image file (JPEG, PNG, WebP, etc.).'),
  background_mode: z
    .enum(['cover', 'tile'])
    .optional()
    .describe('How to display the background image. "cover" fills the viewport (good for photos/landscapes). "tile" repeats the image (good for patterns/textures). Defaults to "cover".'),
});

export type SetThemeInput = z.infer<typeof inputSchema>;

/** Simple HSL format check: "H S% L%" where H is 0-360, S and L are 0-100%. */
function isValidHsl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(value.trim());
}

/**
 * Build the set_theme tool. The description doubles as the model-facing
 * contract — it is the single source of truth for the tool's parameters
 * (converted to a JSON schema via toolToOpenAI), so it must stay complete
 * on its own.
 */
export function createSetThemeTool(applyCustomTheme: (config: ThemeConfig) => void): Tool<SetThemeInput> {
  return {
    description: `Set a custom theme for the application. You can set colors, a font, and a background image — all in one call. Colors are required; font and background are optional.

Color values must be HSL strings WITHOUT the "hsl()" wrapper — just raw values like "228 20% 10%". Choose colors that work well together and ensure good contrast between background and text.

For fonts, choose from the available bundled fonts: ${AVAILABLE_FONTS}. Pick a font that matches the mood of the theme.

For backgrounds, provide a URL to a publicly accessible image. Choose images that complement the color scheme. Use mode "cover" for full-bleed backgrounds or "tile" for repeating patterns.

When the user asks to change the theme, be creative — combine colors, fonts, and backgrounds to create a cohesive aesthetic. Always set colors. Add a font when it enhances the mood. Add a background image only when you have a suitable URL or the user requests one.`,
    inputSchema,
    async execute(args) {
      // Validate required color values
      if (!isValidHsl(args.background) || !isValidHsl(args.text) || !isValidHsl(args.primary)) {
        return {
          content: JSON.stringify({
            error: 'Invalid HSL color values. Each must be a string like "228 20% 10%".',
            received: { background: args.background, text: args.text, primary: args.primary },
          }),
        };
      }

      // Build theme config
      const themeConfig: ThemeConfig = {
        colors: {
          background: args.background,
          text: args.text,
          primary: args.primary,
        },
      };

      // Add font if provided
      if (typeof args.font === 'string' && args.font.trim()) {
        const fontName = args.font.trim();
        const bundled = bundledFonts.find((f) => f.family.toLowerCase() === fontName.toLowerCase());
        if (bundled) {
          themeConfig.font = { family: bundled.family };
        } else {
          return {
            content: JSON.stringify({
              error: `Unknown font "${args.font}". Available fonts: ${AVAILABLE_FONTS}`,
            }),
          };
        }
      }

      // Add background if provided (sanitize to prevent CSS injection via url())
      if (typeof args.background_url === 'string' && args.background_url.trim()) {
        const safeUrl = sanitizeUrl(args.background_url.trim());
        if (safeUrl) {
          themeConfig.background = {
            url: safeUrl,
            mode: args.background_mode === 'tile' ? 'tile' : 'cover',
          };
        }
      }

      applyCustomTheme(themeConfig);

      // Build result summary
      const result: Record<string, unknown> = {
        success: true,
        colors: { background: args.background, text: args.text, primary: args.primary },
      };
      if (themeConfig.font) result.font = themeConfig.font.family;
      if (themeConfig.background) result.background = { url: themeConfig.background.url, mode: themeConfig.background.mode };

      return { content: JSON.stringify(result) };
    },
  };
}
