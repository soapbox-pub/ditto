/**
 * Egg shell colors: the lighter and darker variants of a base color that
 * give an egg its 3D shading.
 */

export interface EggColorVariants {
  shadow: string;
  base: string;
  highlight: string;
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

    switch (max) {
      case r:
        h = (g - b) / diff + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / diff + 2;
        break;
      case b:
        h = (r - g) / diff + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360;
  s /= 100;
  l /= 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r, g, b;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Create lighter and darker variants of a base color for 3D effect. */
export function createColorVariants(baseColor: string): EggColorVariants {
  try {
    const [h, s, l] = hexToHsl(baseColor);

    // Create shadow (darker) and highlight (lighter) variants
    // Adjust lightness while keeping hue and saturation similar
    const shadowL = Math.max(l - 25, 10); // Darker by 25%, minimum 10%
    const highlightL = Math.min(l + 20, 90); // Lighter by 20%, maximum 90%

    // For very dark colors, boost saturation slightly for the highlight
    const highlightS = l < 30 ? Math.min(s + 15, 100) : s;

    return {
      shadow: hslToHex(h, s, shadowL),
      base: baseColor,
      highlight: hslToHex(h, highlightS, highlightL),
    };
  } catch {
    // Fallback to a simple brightness adjustment if HSL conversion fails
    return {
      shadow: baseColor,
      base: baseColor,
      highlight: baseColor,
    };
  }
}
