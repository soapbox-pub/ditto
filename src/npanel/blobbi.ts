/**
 * A Blobbi (kind 31124) as a link preview's picture: the Blobbi as the app
 * draws it, centred on a backdrop of its own colours, as one SVG for the
 * canvas to render.
 *
 * Babies and adults are the app's own art, coloured by the app's own
 * customizers. An adult is always drawn awake, so that only the awake art is
 * bundled. An egg, which the app draws with CSS, is drawn here in SVG in the
 * same shape and shading. Its face, if it has one, is neutral: a preview
 * can't know how the Blobbi feels now without its care history.
 */

import type { NostrEvent } from '@nostrify/nostrify';
import { parseBlobbiEvent } from '@blobbi-kit/core/blobbi';
import { resolveAdultForm } from '@blobbi-kit/core/types/adult';

import { customizeAdultSvg } from '@/blobbi/adult-blobbi/lib/adult-svg-customizer';
import { ADULT_BASE_SVG } from '@/blobbi/adult-blobbi/lib/adult-svg-data';
import { customizeBabySvgFromBlobbi } from '@/blobbi/baby-blobbi/lib/baby-svg-customizer';
import { resolveBabySvg } from '@/blobbi/baby-blobbi/lib/baby-svg-resolver';
import { createColorVariants } from '@/blobbi/egg/lib/egg-colors';
import { DIVINE_BASE_COLOR, isDivineEgg } from '@/blobbi/egg/lib/blobbi-divine-utils';
import { blobbiCompanionToBlobbi } from '@/blobbi/ui/lib/adapters';

export const WIDTH = 1200;
export const HEIGHT = 630;
/** How tall an egg stands, and the box a baby's or an adult's art (which leaves room around it) fills. */
const EGG_SIZE = 500;
const SIZE = 600;
/** The app's default Blobbi violet, for colours that aren't `#rrggbb`. */
const FALLBACK_COLOR = '#8b5cf6';

/** The picture of a Blobbi event, as a 1200×630 SVG, or undefined for one the app can't read. */
export function blobbiPicture(event: NostrEvent): string | undefined {
  const companion = parseBlobbiEvent(event);
  if (!companion) return undefined;
  const base = hex(companion.visualTraits.baseColor) ?? FALLBACK_COLOR;
  const secondary = hex(companion.visualTraits.secondaryColor);

  let art: string;
  let [width, height] = [SIZE, SIZE];
  if (companion.stage === 'egg') {
    const divine = isDivineEgg({ lifeStage: 'egg', tags: event.tags });
    art = egg(divine ? DIVINE_BASE_COLOR : base, divine ? undefined : secondary, divine);
    [width, height] = [EGG_SIZE * 0.8, EGG_SIZE];
  } else {
    const blobbi = blobbiCompanionToBlobbi(companion);
    if (companion.stage === 'baby') {
      art = customizeBabySvgFromBlobbi(resolveBabySvg(blobbi, { isSleeping: blobbi.isSleeping }), blobbi, blobbi.isSleeping);
    } else {
      const form = resolveAdultForm(blobbi);
      art = customizeAdultSvg(ADULT_BASE_SVG[form], form, { baseColor: blobbi.baseColor, secondaryColor: blobbi.secondaryColor, eyeColor: blobbi.eyeColor }, false, 'preview');
    }
  }

  return backdrop(base, secondary ?? base) + placed(art, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height) + '</svg>';
}

/** The opening of the picture: a wash of the Blobbi's colours, and a glow behind it. */
function backdrop(base: string, secondary: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`
    + '<defs>'
    + `<linearGradient id="npanel-wash" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(base, 0.88)}"/><stop offset="1" stop-color="${mix(secondary, 0.78)}"/></linearGradient>`
    + `<radialGradient id="npanel-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${base}" stop-opacity="0.35"/><stop offset="1" stop-color="${base}" stop-opacity="0"/></radialGradient>`
    + '</defs>'
    + `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#npanel-wash)"/>`
    + `<ellipse cx="${WIDTH / 2}" cy="${HEIGHT / 2}" rx="${EGG_SIZE * 0.75}" ry="${EGG_SIZE * 0.6}" fill="url(#npanel-glow)"/>`;
}

/** An SVG nested at a place and a size: its own prolog gone, and its own width and height made ours. */
function placed(svg: string, x: number, y: number, width: number, height: number): string {
  const body = svg.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  return body.replace(/<svg\b([^>]*)>/, (_, attrs: string) => {
    const kept = attrs.replace(/\s(?:width|height|x|y)=(?:"[^"]*"|'[^']*')/g, '');
    return `<svg${kept} x="${x}" y="${y}" width="${width}" height="${height}">`;
  });
}

/**
 * An egg, as `EggGraphic` draws it with CSS: an 80×100 box with
 * `border-radius: 50% / 60% 60% 40% 40%`, shaded by radial gradients of its
 * colour, with a soft highlight up and to the left.
 */
function egg(base: string, secondary: string | undefined, divine: boolean): string {
  const colors = createColorVariants(base);
  // The CSS gradients are circles in a box taller than it is wide; these
  // are their ellipses in the box's own units.
  const shell = secondary
    ? `<radialGradient id="egg-shell" cx="0.35" cy="0.25" r="0.9"><stop offset="0" stop-color="${colors.highlight}"/><stop offset="0.3" stop-color="${colors.base}"/><stop offset="0.7" stop-color="${colors.shadow}"/></radialGradient>`
    : `<radialGradient id="egg-shell" cx="0.3" cy="0.25" r="0.9"><stop offset="0" stop-color="${colors.highlight}"/><stop offset="0.4" stop-color="${colors.base}"/><stop offset="1" stop-color="${colors.shadow}"/></radialGradient>`;
  const accent = secondary
    ? `<radialGradient id="egg-accent" cx="0.65" cy="0.75" r="0.5"><stop offset="0" stop-color="${createColorVariants(secondary).highlight}" stop-opacity="0.25"/><stop offset="1" stop-color="${createColorVariants(secondary).highlight}" stop-opacity="0"/></radialGradient>`
    : divine
      ? `<radialGradient id="egg-accent" cx="0.7" cy="0.8" r="0.45"><stop offset="0" stop-color="${colors.highlight}"/><stop offset="1" stop-color="${colors.highlight}" stop-opacity="0"/></radialGradient>`
      : '';
  const outline = 'M40 0 A40 60 0 0 1 80 60 A40 40 0 0 1 40 100 A40 40 0 0 1 0 60 A40 60 0 0 1 40 0 Z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100">'
    + '<defs>'
    + shell
    + accent
    + `<linearGradient id="egg-highlight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors.highlight}" stop-opacity="0.5"/><stop offset="1" stop-color="${colors.highlight}" stop-opacity="0"/></linearGradient>`
    + '<filter id="egg-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1"/></filter>'
    + '</defs>'
    + `<path d="${outline}" fill="url(#egg-shell)"/>`
    + (accent ? `<path d="${outline}" fill="url(#egg-accent)"/>` : '')
    + '<ellipse cx="32" cy="32.5" rx="12" ry="12.5" fill="url(#egg-highlight)" filter="url(#egg-blur)"/>'
    + '</svg>';
}

/** A colour, if it's `#rrggbb` (or `#rgb`), as `#rrggbb`. */
function hex(color: string | undefined): string | undefined {
  const match = color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return undefined;
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join('') : match[1];
  return `#${digits.toLowerCase()}`;
}

/** A colour mixed with white, `amount` of the way. */
function mix(color: string, amount: number): string {
  const channel = (i: number) => {
    const value = parseInt(color.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(value + (255 - value) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}
