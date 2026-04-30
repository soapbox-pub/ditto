/**
 * Adult Blobbi SVG Customizer
 *
 * Handles applying colors and customizations to adult SVG content.
 * Each adult form has different gradient IDs that need color mapping.
 *
 * IMPORTANT: Gradients must be preserved for 3D shading effects.
 * We replace gradient colors, not the gradient structure.
 *
 * Uses shared utilities from blobbi/ui/lib/svg for common operations.
 */

import type { Blobbi } from '@/blobbi/core/types/blobbi';
import { hexToHsl, hslToHex } from '@/blobbi/core/lib/color-guardrails';
import { lightenColor, darkenColor, uniquifySvgIds, ensureSvgFillsContainer } from '@/blobbi/ui/lib/svg';
import type { AdultForm, AdultSvgCustomization } from '../types/adult.types';

// ─── Gradient Builders ────────────────────────────────────────────────────────

/**
 * Build a 3-stop radial gradient (highlight -> mid -> base).
 * When innerColor is provided, it replaces the highlight/mid stops for two-tone effect.
 */
function buildRadialGradient3Stop(
  id: string,
  baseColor: string,
  cx = '0.3',
  cy = '0.2',
  innerColor?: string
): string {
  const highlight = innerColor ?? lightenColor(baseColor, 40);
  const mid = innerColor ? lightenColor(innerColor, 20) : lightenColor(baseColor, 20);
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
 * Build a 4-stop radial gradient (used by droppi, rocky, starri bodies).
 * When innerColor is provided, it replaces the veryLight/light stops for two-tone effect.
 */
function buildRadialGradient4Stop(
  id: string,
  baseColor: string,
  cx = '0.3',
  cy = '0.2',
  innerColor?: string
): string {
  const veryLight = innerColor ?? lightenColor(baseColor, 50);
  const light = innerColor ? lightenColor(innerColor, 20) : lightenColor(baseColor, 25);
  const dark = darkenColor(baseColor, 15);
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}">
      <stop offset="0%" style="stop-color:${veryLight};stop-opacity:1" />
      <stop offset="30%" style="stop-color:${light};stop-opacity:1" />
      <stop offset="70%" style="stop-color:${baseColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${dark};stop-opacity:1" />
    </radialGradient>`;
}

/**
 * Build a petal gradient (outer -> inner style, like rosey/leafy).
 * When innerColor is provided, it replaces the veryLight/light stops for two-tone effect.
 */
function buildPetalGradient(
  id: string,
  baseColor: string,
  cx = '0.3',
  cy = '0.2',
  innerColor?: string
): string {
  const veryLight = innerColor ?? lightenColor(baseColor, 50);
  const light = innerColor ? lightenColor(innerColor, 20) : lightenColor(baseColor, 30);
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
function customizeCatti(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body gradient (3-stop) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'cattiBody3D', buildRadialGradient3Stop('cattiBody3D', baseColor, '0.3', '0.2', secondaryColor));
  
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
function customizeDroppi(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body (4-stop) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'droppiBody', buildRadialGradient4Stop('droppiBody', baseColor, '0.3', '0.2', secondaryColor));
  
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
function customizeFlammi(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body (4-stop gradient with warm progression) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'flammiBody', buildRadialGradient4Stop('flammiBody', baseColor, '0.3', '0.2', secondaryColor));
  
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
function customizeFroggi(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body (3-stop) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'froggiBody3D', buildRadialGradient3Stop('froggiBody3D', baseColor, '0.3', '0.2', secondaryColor));
  
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
function customizeLeafy(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Petal gradient (the sunflower petals) - two-tone when secondaryColor present
  const petalInner = secondaryColor ?? lightenColor(baseColor, 15);
  const petalMid = secondaryColor ? lightenColor(secondaryColor, 20) : lightenColor(baseColor, 25);
  svg = replaceGradient(svg, 'leafyPetal', `<radialGradient id="leafyPetal" cx="0.3" cy="0.3">
      <stop offset="100%" style="stop-color:${darkenColor(baseColor, 15)};stop-opacity:1" />
      <stop offset="30%" style="stop-color:${petalMid};stop-opacity:1" />
      <stop offset="0%" style="stop-color:${petalInner};stop-opacity:1" />
    </radialGradient>`);
  
  return svg;
}

/**
 * Mushie: Cap should use Blobbi color (stem keeps original)
 * Gradients: mushieCap, mushieCapHighlight
 */
function customizeMushie(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Cap (4-stop) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'mushieCap', buildRadialGradient4Stop('mushieCap', baseColor, '0.3', '0.2', secondaryColor));
  
  // Cap highlight (lighter)
  svg = replaceGradient(svg, 'mushieCapHighlight', buildRadialGradient2Stop('mushieCapHighlight', lightenColor(baseColor, 25), '0.4', '0.3'));
  
  return svg;
}

/**
 * Rocky: Body, inner, arms, legs, and pebbles should use Blobbi color
 * Gradients: rockyBody, rockyInner, rockyArm, rockyLeg, rockyPebble
 */
function customizeRocky(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body (4-stop) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'rockyBody', buildRadialGradient4Stop('rockyBody', baseColor, '0.3', '0.2', secondaryColor));
  
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
function customizeRosey(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Petal layers (outer to inner) - two-tone on outer petals when secondaryColor present
  svg = replaceGradient(svg, 'roseyPetal1', buildPetalGradient('roseyPetal1', baseColor, '0.3', '0.2', secondaryColor));
  
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
function customizeStarri(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Inner star (3-stop gradient to maintain depth) - two-tone when secondaryColor present
  const starInner = secondaryColor ?? lightenColor(baseColor, 35);
  const starMid = secondaryColor ? lightenColor(secondaryColor, 20) : lightenColor(baseColor, 15);
  svg = replaceGradient(svg, 'starriInner', `<radialGradient id="starriInner" cx="0.4" cy="0.3">
      <stop offset="0%" style="stop-color:${starInner};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${starMid};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${baseColor};stop-opacity:1" />
    </radialGradient>`);
  
  return svg;
}

/**
 * Breezy: Body, inner, veins, arms, legs, and floating leaves should use Blobbi color
 * Gradients: breezyBody, breezyInner, breezyVein, breezyArm, breezyLeg, breezyFloating
 */
function customizeBreezy(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body (4-stop leaf gradient) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'breezyBody', buildRadialGradient4Stop('breezyBody', baseColor, '0.3', '0.2', secondaryColor));
  
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
function customizeBloomi(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // All 6 petals use variations of the Blobbi color
  // Create a gradient effect across petals by varying lightness
  svg = replaceGradient(svg, 'bloomiPetal1', buildRadialGradient2Stop('bloomiPetal1', lightenColor(baseColor, 30)));
  svg = replaceGradient(svg, 'bloomiPetal2', buildRadialGradient2Stop('bloomiPetal2', lightenColor(baseColor, 20)));
  svg = replaceGradient(svg, 'bloomiPetal3', buildRadialGradient2Stop('bloomiPetal3', lightenColor(baseColor, 10)));
  svg = replaceGradient(svg, 'bloomiPetal4', buildRadialGradient2Stop('bloomiPetal4', baseColor));
  svg = replaceGradient(svg, 'bloomiPetal5', buildRadialGradient2Stop('bloomiPetal5', darkenColor(baseColor, 10)));
  svg = replaceGradient(svg, 'bloomiPetal6', buildRadialGradient2Stop('bloomiPetal6', darkenColor(baseColor, 5)));
  
  // Center (3-stop, face area) - two-tone when secondaryColor present
  const centerInner = secondaryColor ?? lightenColor(baseColor, 45);
  const centerMid = secondaryColor ? lightenColor(secondaryColor, 20) : lightenColor(baseColor, 35);
  svg = replaceGradient(svg, 'bloomiCenter', `<radialGradient id="bloomiCenter" cx="0.3" cy="0.2">
      <stop offset="0%" style="stop-color:${centerInner};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${centerMid};stop-opacity:1" />
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
function customizeCacti(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body (4-stop) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'cactiBody', buildRadialGradient4Stop('cactiBody', baseColor, '0.3', '0.2', secondaryColor));
  
  // Arms (2-stop)
  svg = replaceGradient(svg, 'cactiArm', buildRadialGradient2Stop('cactiArm', lightenColor(baseColor, 10)));
  
  return svg;
}

/**
 * Cloudi: Body, highlights, and raindrops should use Blobbi color
 * Gradients: cloudiBody, cloudiHighlight, cloudiRain
 */
function customizeCloudi(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body (3-stop, cloud-like progression) - two-tone when secondaryColor present
  const bodyInner = secondaryColor ?? lightenColor(baseColor, 45);
  const bodyMid = secondaryColor ? lightenColor(secondaryColor, 20) : lightenColor(baseColor, 30);
  svg = replaceGradient(svg, 'cloudiBody', `<radialGradient id="cloudiBody" cx="0.3" cy="0.2">
      <stop offset="0%" style="stop-color:${bodyInner};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${bodyMid};stop-opacity:1" />
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
function customizeCrysti(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body (4-stop crystal gradient) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'crystiBody', buildRadialGradient4Stop('crystiBody', baseColor, '0.3', '0.2', secondaryColor));
  
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
function customizeOwli(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;
  
  // Body (3-stop) - two-tone when secondaryColor present
  svg = replaceGradient(svg, 'owliBody3D', buildRadialGradient3Stop('owliBody3D', baseColor, '0.3', '0.2', secondaryColor));
  
  // Ears (2-stop, slightly darker)
  svg = replaceGradient(svg, 'owliEar3D', buildRadialGradient2Stop('owliEar3D', darkenColor(baseColor, 10), '0.3', '0.2'));
  
  // Wings (2-stop)
  svg = replaceGradient(svg, 'owliWing3D', buildRadialGradient2Stop('owliWing3D', darkenColor(baseColor, 15), '0.3', '0.2'));
  
  // Wing highlights (lighter)
  svg = replaceGradient(svg, 'owliWingHighlight', buildRadialGradient2Stop('owliWingHighlight', lightenColor(baseColor, 10), '0.4', '0.3'));
  
  return svg;
}

// ─── Form Customizer Map ──────────────────────────────────────────────────────

type FormCustomizer = (svgText: string, baseColor: string, secondaryColor?: string) => string;

/**
 * Pandi: Light areas get a soft tinted-white from baseColor;
 * dark areas (ears, eye patches, arms, legs) get a dark tint from secondaryColor.
 *
 * The tinted white preserves the hue of baseColor at very high lightness (L=95)
 * so Pandi looks subtly colored rather than pure white, while the dark areas
 * use secondaryColor's hue at panda-appropriate darkness (L=20/27) to maintain
 * the characteristic light-vs-dark panda contrast.
 */
function customizePandi(svgText: string, baseColor: string, secondaryColor?: string): string {
  let svg = svgText;

  // ── Derive tinted-white from baseColor ──
  const baseHsl = hexToHsl(baseColor);
  const tintFill = hslToHex(baseHsl.h, Math.min(baseHsl.s, 30), 95);
  const tintStroke = hslToHex(baseHsl.h, Math.min(baseHsl.s, 20), 90);

  // ── Derive dark tints from secondaryColor (or baseColor if no secondary) ──
  const darkSource = secondaryColor ?? baseColor;
  const darkHsl = hexToHsl(darkSource);
  const darkPrimary = hslToHex(darkHsl.h, 30, 20);   // replaces #1f2937
  const darkLight = hslToHex(darkHsl.h, 20, 27);      // replaces #374151

  // ── Light areas: body & head (flat fills + strokes) ──
  // Original: fill="#f8fafc" stroke="#e2e8f0"
  svg = svg.replaceAll('fill="#f8fafc"', `fill="${tintFill}"`);
  svg = svg.replaceAll('stroke="#e2e8f0"', `stroke="${tintStroke}"`);

  // ── Dark areas with data-blobbi-skip: ear patches, inner ears, eye patches ──
  // These use data-blobbi-skip="true" to prevent eye-animation from touching them.
  // Original dark: fill="#1f2937", lighter dark: fill="#374151"
  svg = svg.replaceAll('fill="#1f2937" data-blobbi-skip="true"', `fill="${darkPrimary}" data-blobbi-skip="true"`);
  svg = svg.replaceAll('fill="#374151" data-blobbi-skip="true"', `fill="${darkLight}" data-blobbi-skip="true"`);

  // ── Arm & leg gradients ──
  svg = replaceGradient(svg, 'pandiArm3D', `<radialGradient id="pandiArm3D" cx="0.3" cy="0.2">
      <stop offset="0%" style="stop-color:${darkPrimary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${darkLight};stop-opacity:1" />
    </radialGradient>`);
  svg = replaceGradient(svg, 'pandiLeg3D', `<radialGradient id="pandiLeg3D" cx="0.3" cy="0.2">
      <stop offset="0%" style="stop-color:${darkPrimary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${darkLight};stop-opacity:1" />
    </radialGradient>`);

  // ── Nose gradient ──
  svg = replaceGradient(svg, 'pandiNose3D', `<radialGradient id="pandiNose3D" cx="0.3" cy="0.2">
      <stop offset="0%" style="stop-color:${darkPrimary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${darkLight};stop-opacity:1" />
    </radialGradient>`);

  // ── Mouth gradient ──
  svg = replaceGradient(svg, 'pandiMouth3D', `<linearGradient id="pandiMouth3D" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" style="stop-color:${darkLight};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${darkPrimary};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${darkLight};stop-opacity:1" />
    </linearGradient>`);

  // ── Sleeping variant: closed-eye strokes and mouth dot use #1e293b ──
  svg = svg.replaceAll('stroke="#1e293b"', `stroke="${darkPrimary}"`);
  svg = svg.replaceAll('fill="#1e293b"', `fill="${darkPrimary}"`);

  return svg;
}

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
  pandi: customizePandi,
  rocky: customizeRocky,
  rosey: customizeRosey,
  starri: customizeStarri,
};

// ─── Main Customization ───────────────────────────────────────────────────────

/**
 * Apply color customizations to adult SVG.
 * 
 * Each form has specific gradients that need to be replaced
 * to apply the Blobbi's custom colors while preserving 3D shading.
 * 
 * @param svgText - The SVG content to customize
 * @param form - The adult form type
 * @param customization - Color customization options
 * @param isSleeping - Whether the Blobbi is sleeping (affects eye rendering)
 * @param instanceId - Optional unique ID to prevent gradient ID collisions when multiple Blobbis are rendered
 */
export function customizeAdultSvg(
  svgText: string,
  form: AdultForm,
  customization: AdultSvgCustomization,
  isSleeping: boolean = false,
  instanceId?: string
): string {
  let modifiedSvg = svgText;

  // Ensure SVG fills its container
  modifiedSvg = ensureSvgFillsContainer(modifiedSvg);

  // Skip color customization if no colors provided
  if (!customization.baseColor && !customization.secondaryColor && !customization.eyeColor) {
    // Still uniquify IDs if instanceId provided (even without color changes)
    if (instanceId) {
      modifiedSvg = uniquifySvgIds(modifiedSvg, instanceId);
    }
    return modifiedSvg;
  }

  // Apply form-specific body/part customization
  if (customization.baseColor) {
    const customizer = FORM_CUSTOMIZERS[form];
    if (customizer) {
      modifiedSvg = customizer(modifiedSvg, customization.baseColor, customization.secondaryColor);
    } else {
      // Fallback for forms without specific customizer: try generic body gradient
      modifiedSvg = applyGenericBodyGradient(modifiedSvg, form, customization.baseColor);
    }
  }

  // Apply eye color customization (skip for sleeping SVGs - eyes are closed)
  if (customization.eyeColor && !isSleeping) {
    modifiedSvg = applyPupilGradient(modifiedSvg, form, customization.eyeColor);
  }

  // Make all IDs unique to prevent collisions when multiple Blobbis are rendered
  if (instanceId) {
    modifiedSvg = uniquifySvgIds(modifiedSvg, instanceId);
  }

  return modifiedSvg;
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

// ─── Pupil/Eye Color Application ──────────────────────────────────────────────

/**
 * Default hardcoded pupil fill colors for forms without pupil gradients.
 * Used by the flat-fill fallback in applyPupilGradient().
 */
const HARDCODED_PUPIL_FILLS: Partial<Record<AdultForm, string>> = {
  bloomi: '#1f2937',
  breezy: '#1f2937',
  cacti: '#1f2937',
  cloudi: '#64748b',
  crysti: '#1e1b4b',
  droppi: '#0891b2',
  flammi: '#1f2937',
  leafy: '#1f2937',
  mushie: '#1f2937',
  rocky: '#1f2937',
  rosey: '#1f2937',
  starri: '#1e1b4b',
};

/**
 * Apply pupil/eye color customization.
 *
 * First tries gradient-based replacement (for forms with {form}Pupil3D gradients).
 * Falls back to scoped fill replacement for forms with hardcoded flat pupil fills,
 * only replacing within the <!-- Pupils ... --> comment block to avoid touching
 * other elements (mouths, strokes, etc.) that may share the same hex color.
 */
function applyPupilGradient(
  svgText: string,
  form: AdultForm,
  eyeColor: string
): string {
  let modified = svgText;

  // Try gradient-based approach first: {form}Pupil3D, {form}Pupil
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
      return modified;
    }
  }

  // Fallback: replace hardcoded pupil fills scoped to the <!-- Pupils ... --> block.
  // Each form has exactly 2 pupil circles + 2 white highlight circles in this block.
  // We only replace the known default fill color, not the white highlights.
  const defaultFill = HARDCODED_PUPIL_FILLS[form];
  if (defaultFill) {
    const pupilBlockRegex = /<!-- Pupils[^>]*-->([\s\S]*?)(?=<!--|$)/;
    const blockMatch = modified.match(pupilBlockRegex);
    if (blockMatch) {
      const block = blockMatch[0];
      const newBlock = block.replaceAll(`fill="${defaultFill}"`, `fill="${eyeColor}" data-blobbi-pupil="true"`);
      modified = modified.replace(block, newBlock);
    }
  }

  return modified;
}

// ─── Convenience Functions ────────────────────────────────────────────────────

/**
 * Convenience function to customize adult SVG from a Blobbi instance.
 * 
 * Uses the Blobbi's ID to uniquify SVG IDs, preventing gradient collisions
 * when multiple Blobbis are rendered on the same page.
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

  // Pass blobbi.id to uniquify gradient IDs and prevent collisions
  return customizeAdultSvg(svgText, form, customization, isSleeping, blobbi.id);
}
