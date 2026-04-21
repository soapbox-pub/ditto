import { z } from 'zod';

import { bundledFonts } from '@/lib/fonts';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

import type { Tool, ToolResult, ToolContext } from './Tool';
import type { ThemeConfig } from '@/themes';

const AVAILABLE_FONTS = bundledFonts.map((f) => f.family).join(', ');

/** Simple HSL format check: "H S% L%" where H is 0-360, S and L are 0-100%. */
function isValidHsl(value: string): boolean {
  return /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(value.trim());
}

const inputSchema = z.object({
  background: z.string().describe('Background color as an HSL string (e.g. "228 20% 10%" for dark blue, "0 0% 100%" for white). This is the main page background.'),
  text: z.string().describe('Text/foreground color as an HSL string (e.g. "210 40% 98%" for near-white, "0 0% 10%" for near-black). Must contrast well with the background.'),
  primary: z.string().describe('Primary accent color as an HSL string (e.g. "258 70% 60%" for purple, "142 70% 45%" for green). Used for buttons, links, and interactive elements.'),
  font: z.string().optional().describe(`Optional font family name. Must be one of the available bundled fonts: ${AVAILABLE_FONTS}. Choose a font that matches the theme's mood and aesthetic.`),
  background_url: z.string().optional().describe('Optional URL to a background image. Should be a direct link to a publicly accessible image file (JPEG, PNG, WebP, etc.).'),
  background_mode: z.enum(['cover', 'tile']).optional().describe('How to display the background image. "cover" fills the viewport (good for photos/landscapes). "tile" repeats the image (good for patterns/textures). Defaults to "cover".'),
});

type Params = z.infer<typeof inputSchema>;

export const SetThemeTool: Tool<Params> = {
  description: `Set a custom theme for the application. You can set colors, a font, and a background image — all in one call. Colors are required; font and background are optional.

Color values must be HSL strings WITHOUT the "hsl()" wrapper — just raw values like "228 20% 10%". Choose colors that work well together and ensure good contrast between background and text.

For fonts, choose from the available bundled fonts: ${AVAILABLE_FONTS}. Pick a font that matches the mood of the theme.

For backgrounds, provide a URL to a publicly accessible image. Choose images that complement the color scheme. Use mode "cover" for full-bleed backgrounds or "tile" for repeating patterns.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    const { background, text, primary, font, background_url, background_mode } = args;

    if (!isValidHsl(background) || !isValidHsl(text) || !isValidHsl(primary)) {
      return { result: JSON.stringify({
        error: 'Invalid HSL color values. Each must be a string like "228 20% 10%".',
        received: { background, text, primary },
      }) };
    }

    const themeConfig: ThemeConfig = {
      colors: { background, text, primary },
    };

    if (font) {
      const bundled = bundledFonts.find((f) => f.family.toLowerCase() === font.trim().toLowerCase());
      if (bundled) {
        themeConfig.font = { family: bundled.family };
      } else {
        return { result: JSON.stringify({
          error: `Unknown font "${font}". Available fonts: ${AVAILABLE_FONTS}`,
        }) };
      }
    }

    if (background_url) {
      const safeUrl = sanitizeUrl(background_url.trim());
      if (!safeUrl) {
        return { result: JSON.stringify({ error: 'Invalid background URL. Must be a valid HTTPS URL.' }) };
      }
      themeConfig.background = {
        url: safeUrl,
        mode: background_mode === 'tile' ? 'tile' : 'cover',
      };
    }

    ctx.applyCustomTheme(themeConfig);

    const resultData: Record<string, unknown> = {
      success: true,
      colors: { background, text, primary },
    };
    if (themeConfig.font) resultData.font = themeConfig.font.family;
    if (themeConfig.background) resultData.background = { url: themeConfig.background.url, mode: themeConfig.background.mode };

    return { result: JSON.stringify(resultData) };
  },
};
