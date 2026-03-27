/**
 * Adult Blobbi SVG Customizer
 * 
 * Handles applying colors and customizations to adult SVG content.
 * Each adult form has different gradient IDs that need color mapping.
 * 
 * IMPORTANT: Gradients must be preserved for 3D shading effects.
 * We replace gradient colors, not the gradient structure.
 */

import type { Blobbi } from '@/types/blobbi';
import type { AdultForm, AdultSvgCustomization } from '../types/adult.types';

// ─── Color Utilities ──────────────────────────────────────────────────────────

/**
 * Lighten a hex color by a percentage
 */
function lightenColor(color: string, percent: number): string {
  if (color.startsWith('#')) {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1).toUpperCase();
  }
  return color;
}

/**
 * Darken a hex color by a percentage
 */
function darkenColor(color: string, percent: number): string {
  if (color.startsWith('#')) {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1).toUpperCase();
  }
  return color;
}

// ─── Gradient Builders ────────────────────────────────────────────────────────

/**
 * Build a 3-stop radial gradient (highlight -> mid -> base)
 */
function buildRadialGradient3Stop(
  id: string,
  baseColor: string,
  cx = '0.3',
  cy = '0.2'
): string {
  const highlight = lightenColor(baseColor, 40);
  const mid = lightenColor(baseColor, 20);
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}">
      <stop offset="0%" style="stop-color:${highlight};stop-opacity:1" />
      <stop offset="40%" style="stop-color:${mid};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${baseColor};stop-opacity:1" />
    </radialGradient>`;
}

/**
 * Build a 2-stop radial gradient (lighter -> base)
 */
function buildRadialGradient2Stop(
  id: string,
  baseColor: string,
  cx = '0.3',
  cy = '0.3'
): string {
  const highlight = lightenColor(baseColor, 25);
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}">
      <stop offset="0%" style="stop-color:${highlight};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${baseColor};stop-opacity:1" />
    </radialGradient>`;
}

/**
 * Build a 4-stop radial gradient (used by droppi, rocky, starri bodies)
 */
function buildRadialGradient4Stop(
  id: string,
  baseColor: string,
  cx = '0.3',
  cy = '0.2'
): string {
  const veryLight = lightenColor(baseColor, 50);
  const light = lightenColor(baseColor, 25);
  const dark = darkenColor(baseColor, 15);
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}">
      <stop offset="0%" style="stop-color:${veryLight};stop-opacity:1" />
      <stop offset="30%" style="stop-color:${light};stop-opacity:1" />
      <stop offset="70%" style="stop-color:${baseColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${dark};stop-opacity:1" />
    </radialGradient>`;
}

/**
 * Build a petal gradient (outer -> inner style, like rosey/leafy)
 */
function buildPetalGradient(
  id: string,
  baseColor: string,
  cx = '0.3',
  cy = '0.2'
): string {
  const veryLight = lightenColor(baseColor, 50);
  const light = lightenColor(baseColor, 30);
  const mid = lightenColor(baseColor, 15);
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}">
      <stop offset="0%" style="stop-color:${veryLight};stop-opacity:1" />
      <stop offset="30%" style="stop-color:${light};stop-opacity:1" />
      <stop offset="70%" style="stop-color:${mid};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${baseColor};stop-opacity:1" />
    </radialGradient>`;
}

/**
 * Build pupil gradient
 */
function buildPupilGradient(id: string, eyeColor: string): string {
  const highlight = lightenColor(eyeColor, 20);
  return `<radialGradient id="${id}" cx="0.3" cy="0.3">
      <stop offset="0%" style="stop-color:${highlight};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${eyeColor};stop-opacity:1" />
    </radialGradient>`;
}

// ─── Generic Gradient Replacer ────────────────────────────────────────────────

/**
 * Replace a specific gradient in the SVG by ID
 */
function replaceGradient(
  svgText: string,
  gradientId: string,
  newGradient: string
): string {
  // Match both radialGradient and linearGradient
  const pattern = new RegExp(
    `<(radial|linear)Gradient[^>]*id=["']${gradientId}["'][^>]*>[\\s\\S]*?<\\/(radial|linear)Gradient>`,
    'i'
  );
  
  const match = svgText.match(pattern);
  if (match) {
    return svgText.replace(match[0], newGradient);
  }
  return svgText;
}

// ─── Form-Specific Customizers ────────────────────────────────────────────────

/**
 * Catti: Body, ears, and tail should use Blobbi color
 * Gradients: cattiBody3D, cattiEar3D, cattiEarInner, cattiTail3D, cattiTailHighlight
 */
function customizeCatti(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body gradient (3-stop)
  svg = replaceGradient(svg, 'cattiBody3D', buildRadialGradient3Stop('cattiBody3D', baseColor));
  
  // Ear gradients (2-stop)
  svg = replaceGradient(svg, 'cattiEar3D', buildRadialGradient2Stop('cattiEar3D', baseColor));
  
  // Ear inner uses lighter color
  const earInnerColor = lightenColor(baseColor, 20);
  svg = replaceGradient(svg, 'cattiEarInner', buildRadialGradient2Stop('cattiEarInner', earInnerColor, '0.4', '0.3'));
  
  // Tail gradients
  const tailHighlight = lightenColor(baseColor, 40);
  svg = replaceGradient(svg, 'cattiTail3D', `<radialGradient id="cattiTail3D" cx="0.3" cy="0.2">
      <stop offset="0%" style="stop-color:${lightenColor(baseColor, 35)};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${lightenColor(baseColor, 15)};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${darkenColor(baseColor, 15)};stop-opacity:1" />
    </radialGradient>`);
  svg = replaceGradient(svg, 'cattiTailHighlight', buildRadialGradient2Stop('cattiTailHighlight', tailHighlight, '0.4', '0.3'));
  
  return svg;
}

/**
 * Droppi: Body, arms, legs, and droplets should use Blobbi color
 * Gradients: droppiBody, droppiInner, droppiArm, droppiLeg, droppiDroplet
 */
function customizeDroppi(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body (4-stop)
  svg = replaceGradient(svg, 'droppiBody', buildRadialGradient4Stop('droppiBody', baseColor));
  
  // Inner reflection (lighter, 2-stop)
  const innerColor = lightenColor(baseColor, 45);
  svg = replaceGradient(svg, 'droppiInner', buildRadialGradient2Stop('droppiInner', innerColor, '0.4', '0.3'));
  
  // Arms (2-stop)
  svg = replaceGradient(svg, 'droppiArm', buildRadialGradient2Stop('droppiArm', lightenColor(baseColor, 15)));
  
  // Legs (2-stop, slightly darker)
  svg = replaceGradient(svg, 'droppiLeg', buildRadialGradient2Stop('droppiLeg', darkenColor(baseColor, 5), '0.3', '0.2'));
  
  // Droplets
  svg = replaceGradient(svg, 'droppiDroplet', buildRadialGradient2Stop('droppiDroplet', lightenColor(baseColor, 30), '0.5', '0.5'));
  
  return svg;
}

/**
 * Flammi: Body, inner, core, arms, legs, and embers should use Blobbi color
 * Gradients: flammiBody, flammiInner, flammiCore, flammiArm, flammiLeg, flammiEmber
 */
function customizeFlammi(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body (4-stop gradient with warm progression)
  svg = replaceGradient(svg, 'flammiBody', buildRadialGradient4Stop('flammiBody', baseColor));
  
  // Inner (3-stop, lighter)
  const innerColor = lightenColor(baseColor, 25);
  svg = replaceGradient(svg, 'flammiInner', `<radialGradient id="flammiInner" cx="0.4" cy="0.3">
      <stop offset="0%" style="stop-color:${lightenColor(innerColor, 30)};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${innerColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${lightenColor(baseColor, 10)};stop-opacity:1" />
    </radialGradient>`);
  
  // Core (hottest/brightest part, very light)
  const coreColor = lightenColor(baseColor, 50);
  svg = replaceGradient(svg, 'flammiCore', buildRadialGradient2Stop('flammiCore', coreColor, '0.5', '0.4'));
  
  // Arms
  svg = replaceGradient(svg, 'flammiArm', buildRadialGradient2Stop('flammiArm', lightenColor(baseColor, 10)));
  
  // Legs
  svg = replaceGradient(svg, 'flammiLeg', buildRadialGradient2Stop('flammiLeg', baseColor, '0.3', '0.2'));
  
  // Embers
  svg = replaceGradient(svg, 'flammiEmber', buildRadialGradient2Stop('flammiEmber', lightenColor(baseColor, 35), '0.5', '0.5'));
  
  return svg;
}

/**
 * Froggi: Body, eye base, feet should use Blobbi color
 * Gradients: froggiBody3D, froggiEyeBase3D, froggiFeet3D, froggiFeetHighlight, froggiToe3D
 */
function customizeFroggi(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body (3-stop)
  svg = replaceGradient(svg, 'froggiBody3D', buildRadialGradient3Stop('froggiBody3D', baseColor));
  
  // Eye base (matches body color, 2-stop)
  svg = replaceGradient(svg, 'froggiEyeBase3D', buildRadialGradient2Stop('froggiEyeBase3D', lightenColor(baseColor, 15)));
  
  // Feet (2-stop, lighter than body)
  const feetColor = lightenColor(baseColor, 20);
  svg = replaceGradient(svg, 'froggiFeet3D', buildRadialGradient2Stop('froggiFeet3D', feetColor, '0.3', '0.2'));
  
  // Feet highlight (even lighter)
  svg = replaceGradient(svg, 'froggiFeetHighlight', buildRadialGradient2Stop('froggiFeetHighlight', lightenColor(feetColor, 20), '0.4', '0.3'));
  
  // Toes (linear gradient, darker)
  svg = replaceGradient(svg, 'froggiToe3D', `<linearGradient id="froggiToe3D" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" style="stop-color:${darkenColor(baseColor, 10)};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${darkenColor(baseColor, 25)};stop-opacity:1" />
    </linearGradient>`);
  
  return svg;
}

/**
 * Leafy: Petals should use Blobbi color (center/face keeps brown)
 * Gradients: leafyPetal (petals only - the yellow parts)
 */
function customizeLeafy(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Petal gradient (the sunflower petals)
  svg = replaceGradient(svg, 'leafyPetal', `<radialGradient id="leafyPetal" cx="0.3" cy="0.3">
      <stop offset="100%" style="stop-color:${darkenColor(baseColor, 15)};stop-opacity:1" />
      <stop offset="30%" style="stop-color:${lightenColor(baseColor, 25)};stop-opacity:1" />
      <stop offset="0%" style="stop-color:${lightenColor(baseColor, 15)};stop-opacity:1" />
    </radialGradient>`);
  
  return svg;
}

/**
 * Mushie: Cap should use Blobbi color (stem keeps original)
 * Gradients: mushieCap, mushieCapHighlight
 */
function customizeMushie(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Cap (4-stop)
  svg = replaceGradient(svg, 'mushieCap', buildRadialGradient4Stop('mushieCap', baseColor));
  
  // Cap highlight (lighter)
  svg = replaceGradient(svg, 'mushieCapHighlight', buildRadialGradient2Stop('mushieCapHighlight', lightenColor(baseColor, 25), '0.4', '0.3'));
  
  return svg;
}

/**
 * Rocky: Body, inner, arms, legs, and pebbles should use Blobbi color
 * Gradients: rockyBody, rockyInner, rockyArm, rockyLeg, rockyPebble
 */
function customizeRocky(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body (4-stop)
  svg = replaceGradient(svg, 'rockyBody', buildRadialGradient4Stop('rockyBody', baseColor));
  
  // Inner (2-stop, lighter)
  svg = replaceGradient(svg, 'rockyInner', buildRadialGradient2Stop('rockyInner', lightenColor(baseColor, 35), '0.4', '0.3'));
  
  // Arms (2-stop)
  svg = replaceGradient(svg, 'rockyArm', buildRadialGradient2Stop('rockyArm', baseColor));
  
  // Legs (2-stop, slightly darker)
  svg = replaceGradient(svg, 'rockyLeg', buildRadialGradient2Stop('rockyLeg', darkenColor(baseColor, 10), '0.3', '0.2'));
  
  // Pebbles
  svg = replaceGradient(svg, 'rockyPebble', buildRadialGradient2Stop('rockyPebble', lightenColor(baseColor, 15), '0.5', '0.5'));
  
  return svg;
}

/**
 * Rosey: Petals, center, and floating petals should use Blobbi color
 * Gradients: roseyPetal1, roseyPetal2, roseyPetal3, roseyCenter, roseyFloatingPetal
 */
function customizeRosey(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Petal layers (outer to inner, using petal gradient style)
  svg = replaceGradient(svg, 'roseyPetal1', buildPetalGradient('roseyPetal1', baseColor));
  
  // Petal2 (slightly lighter)
  svg = replaceGradient(svg, 'roseyPetal2', buildRadialGradient2Stop('roseyPetal2', lightenColor(baseColor, 15), '0.4', '0.3'));
  
  // Petal3 (lightest inner petals)
  svg = replaceGradient(svg, 'roseyPetal3', buildRadialGradient2Stop('roseyPetal3', lightenColor(baseColor, 30), '0.5', '0.4'));
  
  // Center (where face is, slightly darker)
  svg = replaceGradient(svg, 'roseyCenter', buildRadialGradient2Stop('roseyCenter', lightenColor(baseColor, 10)));
  
  // Floating petals
  svg = replaceGradient(svg, 'roseyFloatingPetal', buildRadialGradient2Stop('roseyFloatingPetal', lightenColor(baseColor, 20), '0.5', '0.5'));
  
  return svg;
}

/**
 * Starri: Inner star should use Blobbi color (outer stays dark/cosmic)
 * Gradients: starriInner (the inner golden star - this should be the Blobbi color)
 */
function customizeStarri(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Inner star (3-stop gradient to maintain depth)
  svg = replaceGradient(svg, 'starriInner', `<radialGradient id="starriInner" cx="0.4" cy="0.3">
      <stop offset="0%" style="stop-color:${lightenColor(baseColor, 35)};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${lightenColor(baseColor, 15)};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${baseColor};stop-opacity:1" />
    </radialGradient>`);
  
  return svg;
}

/**
 * Breezy: Body, inner, veins, arms, legs, and floating leaves should use Blobbi color
 * Gradients: breezyBody, breezyInner, breezyVein, breezyArm, breezyLeg, breezyFloating
 */
function customizeBreezy(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body (4-stop leaf gradient)
  svg = replaceGradient(svg, 'breezyBody', buildRadialGradient4Stop('breezyBody', baseColor));
  
  // Inner highlight (lighter, 2-stop)
  svg = replaceGradient(svg, 'breezyInner', buildRadialGradient2Stop('breezyInner', lightenColor(baseColor, 40), '0.4', '0.3'));
  
  // Veins (linear gradient, darker)
  svg = replaceGradient(svg, 'breezyVein', `<linearGradient id="breezyVein" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" style="stop-color:${darkenColor(baseColor, 20)};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${darkenColor(baseColor, 10)};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${darkenColor(baseColor, 20)};stop-opacity:1" />
    </linearGradient>`);
  
  // Arms (2-stop)
  svg = replaceGradient(svg, 'breezyArm', buildRadialGradient2Stop('breezyArm', lightenColor(baseColor, 15)));
  
  // Legs (2-stop)
  svg = replaceGradient(svg, 'breezyLeg', buildRadialGradient2Stop('breezyLeg', baseColor, '0.3', '0.2'));
  
  // Floating leaves
  svg = replaceGradient(svg, 'breezyFloating', buildRadialGradient2Stop('breezyFloating', lightenColor(baseColor, 25), '0.5', '0.5'));
  
  return svg;
}

/**
 * Bloomi: Petals, center, and pollen should use Blobbi color
 * Note: Bloomi has 6 different colored petals - we'll make them all use variations of the base color
 * Gradients: bloomiPetal1-6, bloomiCenter, bloomiPollen
 */
function customizeBloomi(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // All 6 petals use variations of the Blobbi color
  // Create a gradient effect across petals by varying lightness
  svg = replaceGradient(svg, 'bloomiPetal1', buildRadialGradient2Stop('bloomiPetal1', lightenColor(baseColor, 30)));
  svg = replaceGradient(svg, 'bloomiPetal2', buildRadialGradient2Stop('bloomiPetal2', lightenColor(baseColor, 20)));
  svg = replaceGradient(svg, 'bloomiPetal3', buildRadialGradient2Stop('bloomiPetal3', lightenColor(baseColor, 10)));
  svg = replaceGradient(svg, 'bloomiPetal4', buildRadialGradient2Stop('bloomiPetal4', baseColor));
  svg = replaceGradient(svg, 'bloomiPetal5', buildRadialGradient2Stop('bloomiPetal5', darkenColor(baseColor, 10)));
  svg = replaceGradient(svg, 'bloomiPetal6', buildRadialGradient2Stop('bloomiPetal6', darkenColor(baseColor, 5)));
  
  // Center (3-stop, lighter than petals - this is where the face is)
  svg = replaceGradient(svg, 'bloomiCenter', `<radialGradient id="bloomiCenter" cx="0.3" cy="0.2">
      <stop offset="0%" style="stop-color:${lightenColor(baseColor, 45)};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${lightenColor(baseColor, 35)};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${lightenColor(baseColor, 25)};stop-opacity:1" />
    </radialGradient>`);
  
  // Pollen (floating particles)
  svg = replaceGradient(svg, 'bloomiPollen', buildRadialGradient2Stop('bloomiPollen', lightenColor(baseColor, 40), '0.5', '0.5'));
  
  return svg;
}

/**
 * Cacti: Body and arms should use Blobbi color (pot keeps original red)
 * Gradients: cactiBody, cactiArm
 */
function customizeCacti(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body (4-stop)
  svg = replaceGradient(svg, 'cactiBody', buildRadialGradient4Stop('cactiBody', baseColor));
  
  // Arms (2-stop)
  svg = replaceGradient(svg, 'cactiArm', buildRadialGradient2Stop('cactiArm', lightenColor(baseColor, 10)));
  
  return svg;
}

/**
 * Cloudi: Body, highlights, and raindrops should use Blobbi color
 * Gradients: cloudiBody, cloudiHighlight, cloudiRain
 */
function customizeCloudi(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body (3-stop, cloud-like progression from light to slightly darker)
  svg = replaceGradient(svg, 'cloudiBody', `<radialGradient id="cloudiBody" cx="0.3" cy="0.2">
      <stop offset="0%" style="stop-color:${lightenColor(baseColor, 45)};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${lightenColor(baseColor, 30)};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${lightenColor(baseColor, 15)};stop-opacity:1" />
    </radialGradient>`);
  
  // Highlights (very light, semi-transparent feel)
  svg = replaceGradient(svg, 'cloudiHighlight', `<radialGradient id="cloudiHighlight" cx="0.4" cy="0.3">
      <stop offset="0%" style="stop-color:${lightenColor(baseColor, 50)};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${lightenColor(baseColor, 40)};stop-opacity:0.5" />
    </radialGradient>`);
  
  // Raindrops (use darker version of the color)
  svg = replaceGradient(svg, 'cloudiRain', buildRadialGradient2Stop('cloudiRain', darkenColor(baseColor, 10), '0.5', '0.3'));
  
  return svg;
}

/**
 * Crysti: Body and inner should use Blobbi color (facets keep their colorful nature)
 * Gradients: crystiBody, crystiInner
 */
function customizeCrysti(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body (4-stop crystal gradient)
  svg = replaceGradient(svg, 'crystiBody', buildRadialGradient4Stop('crystiBody', baseColor));
  
  // Inner highlight (semi-transparent white feel preserved but tinted)
  svg = replaceGradient(svg, 'crystiInner', `<radialGradient id="crystiInner" cx="0.4" cy="0.3">
      <stop offset="0%" style="stop-color:${lightenColor(baseColor, 50)};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${lightenColor(baseColor, 35)};stop-opacity:0.3" />
    </radialGradient>`);
  
  return svg;
}

/**
 * Owli: Body, ears, and wings should use Blobbi color (beak keeps yellow/orange)
 * Gradients: owliBody3D, owliEar3D, owliWing3D, owliWingHighlight
 */
function customizeOwli(svgText: string, baseColor: string): string {
  let svg = svgText;
  
  // Body (3-stop)
  svg = replaceGradient(svg, 'owliBody3D', buildRadialGradient3Stop('owliBody3D', baseColor));
  
  // Ears (2-stop, slightly darker)
  svg = replaceGradient(svg, 'owliEar3D', buildRadialGradient2Stop('owliEar3D', darkenColor(baseColor, 10), '0.3', '0.2'));
  
  // Wings (2-stop)
  svg = replaceGradient(svg, 'owliWing3D', buildRadialGradient2Stop('owliWing3D', darkenColor(baseColor, 15), '0.3', '0.2'));
  
  // Wing highlights (lighter)
  svg = replaceGradient(svg, 'owliWingHighlight', buildRadialGradient2Stop('owliWingHighlight', lightenColor(baseColor, 10), '0.4', '0.3'));
  
  return svg;
}

// ─── Form Customizer Map ──────────────────────────────────────────────────────

type FormCustomizer = (svgText: string, baseColor: string) => string;

const FORM_CUSTOMIZERS: Partial<Record<AdultForm, FormCustomizer>> = {
  bloomi: customizeBloomi,
  breezy: customizeBreezy,
  cacti: customizeCacti,
  catti: customizeCatti,
  cloudi: customizeCloudi,
  crysti: customizeCrysti,
  droppi: customizeDroppi,
  flammi: customizeFlammi,
  froggi: customizeFroggi,
  leafy: customizeLeafy,
  mushie: customizeMushie,
  owli: customizeOwli,
  rocky: customizeRocky,
  rosey: customizeRosey,
  starri: customizeStarri,
  // pandi keeps original colors - it's a panda with black/white coloring by design
};

// ─── Main Customization ───────────────────────────────────────────────────────

/**
 * Apply color customizations to adult SVG.
 * 
 * Each form has specific gradients that need to be replaced
 * to apply the Blobbi's custom colors while preserving 3D shading.
 */
export function customizeAdultSvg(
  svgText: string,
  form: AdultForm,
  customization: AdultSvgCustomization,
  isSleeping: boolean = false
): string {
  let modifiedSvg = svgText;

  // Ensure SVG fills its container
  modifiedSvg = ensureSvgFillsContainer(modifiedSvg);

  // Skip color customization if no colors provided
  if (!customization.baseColor && !customization.secondaryColor && !customization.eyeColor) {
    return modifiedSvg;
  }

  // Apply form-specific body/part customization
  if (customization.baseColor) {
    const customizer = FORM_CUSTOMIZERS[form];
    if (customizer) {
      modifiedSvg = customizer(modifiedSvg, customization.baseColor);
    } else {
      // Fallback for forms without specific customizer: try generic body gradient
      modifiedSvg = applyGenericBodyGradient(modifiedSvg, form, customization.baseColor);
    }
  }

  // Apply eye color customization (skip for sleeping SVGs - eyes are closed)
  if (customization.eyeColor && !isSleeping) {
    modifiedSvg = applyPupilGradient(modifiedSvg, form, customization.eyeColor);
  }

  return modifiedSvg;
}

/**
 * Ensure SVG has width/height attributes so it fills its container
 */
function ensureSvgFillsContainer(svgText: string): string {
  if (/\swidth=/.test(svgText) && /\sheight=/.test(svgText)) {
    return svgText;
  }

  return svgText.replace(
    /<svg([^>]*)>/,
    '<svg$1 width="100%" height="100%">'
  );
}

/**
 * Fallback: Apply generic body gradient for forms without specific customizer
 */
function applyGenericBodyGradient(
  svgText: string,
  form: AdultForm,
  baseColor: string
): string {
  let modified = svgText;

  // Try common patterns: {form}Body3D, {form}Body
  const bodyPatterns = [
    new RegExp(`<radialGradient[^>]*id=["'](${form}Body3D)["'][^>]*>[\\s\\S]*?<\\/radialGradient>`, 'i'),
    new RegExp(`<radialGradient[^>]*id=["'](${form}Body)["'][^>]*>[\\s\\S]*?<\\/radialGradient>`, 'i'),
  ];

  for (const pattern of bodyPatterns) {
    const match = modified.match(pattern);
    if (match) {
      const gradientId = match[1];
      const newGradient = buildRadialGradient3Stop(gradientId, baseColor);
      modified = modified.replace(match[0], newGradient);
      break;
    }
  }

  return modified;
}

/**
 * Apply pupil gradient customization
 */
function applyPupilGradient(
  svgText: string,
  form: AdultForm,
  eyeColor: string
): string {
  let modified = svgText;

  // Try common patterns: {form}Pupil3D, {form}Pupil
  const pupilPatterns = [
    new RegExp(`<radialGradient[^>]*id=["'](${form}Pupil3D)["'][^>]*>[\\s\\S]*?<\\/radialGradient>`, 'i'),
    new RegExp(`<radialGradient[^>]*id=["'](${form}Pupil)["'][^>]*>[\\s\\S]*?<\\/radialGradient>`, 'i'),
  ];

  for (const pattern of pupilPatterns) {
    const match = modified.match(pattern);
    if (match) {
      const gradientId = match[1];
      const newGradient = buildPupilGradient(gradientId, eyeColor);
      modified = modified.replace(match[0], newGradient);
      break;
    }
  }

  return modified;
}

// ─── Convenience Functions ────────────────────────────────────────────────────

/**
 * Convenience function to customize adult SVG from a Blobbi instance.
 */
export function customizeAdultSvgFromBlobbi(
  svgText: string,
  form: AdultForm,
  blobbi: Blobbi,
  isSleeping: boolean = false
): string {
  const customization: AdultSvgCustomization = {
    baseColor: blobbi.baseColor,
    secondaryColor: blobbi.secondaryColor,
    eyeColor: blobbi.eyeColor,
  };

  return customizeAdultSvg(svgText, form, customization, isSleeping);
}
