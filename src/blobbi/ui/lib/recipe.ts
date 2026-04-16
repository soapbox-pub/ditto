/**
 * Blobbi Visual Recipe System
 *
 * This module defines the part-based visual recipe architecture. Every
 * visual state — whether derived from named emotion presets or resolved
 * from Blobbi stats — is represented as a **BlobbiVisualRecipe** composed
 * of independent parts:
 *
 *   - eyes:        pupil modifications, star eyes, dizzy spirals, sleepy blink
 *   - mouth:       curve overrides, round, sad, droopy, big smile, small smile
 *   - eyebrows:    static or animated eyebrow positioning
 *   - bodyEffects: dirt marks, stink clouds, anger-rise color overlay
 *   - extras:      tears, drool, food icons, Zzz, sparkles
 *
 * Two pathways produce recipes:
 *
 *   1. **Named emotion presets** (EMOTION_RECIPES): Static recipes looked up
 *      by name (e.g. 'excited', 'surprised'). Used for action overrides and
 *      direct emotion setting. Resolved via resolveVisualRecipe().
 *
 *   2. **Status-driven composition** (status-reactions.ts): Builds recipes
 *      dynamically from current stats using part-priority rules. Each low
 *      stat contributes parts, and the resolver picks winners per-part.
 *      This is the primary pathway for ongoing Blobbi expressions.
 *
 * The rendering pipeline (applyVisualRecipe) applies each part independently
 * through its subsystem, regardless of which pathway produced the recipe.
 *
 * Key concepts:
 *   - BlobbiVisualRecipe: the central type describing all visual parts
 *   - EMOTION_RECIPES: named emotion presets for actions and overrides
 *   - resolveVisualRecipe(): resolves a named emotion preset into a recipe
 *   - mergeVisualRecipes(): merges two recipes (overlay takes precedence)
 *   - applyVisualRecipe(): orchestrates subsystem calls from a resolved recipe
 */

// ─── Subsystem Imports ────────────────────────────────────────────────────────

// Eyes
import {
  detectEyePositions,
  applySadEyes,
  applyStarEyes,
  applyDizzyEyes,
  type EyePosition,
  EYE_CLASSES,
} from './eyes';

// Mouth
import {
  detectMouthPosition,
  mouthAnchorFromDetection,
  replaceMouthSection,
  generateRoundMouth,
  generateSadMouth,
  generateSmallSmile,
  generateDroopyMouth,
  generateBigSmile,
  generateFoodIcon,
  applySleepyMouth,
  computeDroolAnchor,
  generateDroolAtAnchor,
  type RoundMouthConfig,
  type SmallSmileConfig,
  type BigSmileConfig,
  type DroolConfig,
  type FoodIconConfig,
  type DroopyMouthConfig,
} from './mouth';

// Eyebrows
import {
  generateEyebrows,
  applyAnimatedEyebrows,
  type EyebrowConfig,
  type AnimatedEyebrowsConfig,
} from './eyebrows';

// Body Effects
import {
  applyBodyEffects,
  detectBodyPath,
  type BodyEffectsSpec,
  type DirtMarksConfig,
  type StinkCloudsConfig,
} from './bodyEffects';

import type { BlobbiEmotion, BlobbiVariant } from './emotion-types';

// ─── Recipe Types ─────────────────────────────────────────────────────────────

/**
 * Eye part of a visual recipe.
 * Describes what eye modifications to apply.
 */
export interface EyeRecipe {
  /** Watery/sad pupil highlights and optional blue water fill */
  wateryEyes?: { includeWaterFill: boolean };
  /** Star-shaped pupils (e.g. excited) */
  starEyes?: { points: number; color: string; scale: number };
  /** Dizzy spiral overlays */
  dizzySpirals?: { rotationDuration: number };
  /** Sleepy closing-blink animation (drowsy cycling — low energy reaction) */
  sleepyBlink?: { cycleDuration: number };
  /** Sleeping state: eyes permanently closed, no blink cycle */
  sleepingClosed?: true;
}

/**
 * Mouth part of a visual recipe.
 * Only one mouth shape should be active per recipe (last one wins).
 */
export interface MouthRecipe {
  /** Sad frown (negative curve) */
  sadMouth?: true;
  /** Round "O" shape (surprised, curious) */
  roundMouth?: RoundMouthConfig;
  /** Small/smug smile */
  smallSmile?: SmallSmileConfig;
  /** Big wide smile */
  bigSmile?: BigSmileConfig;
  /** Droopy/weak mouth */
  droopyMouth?: DroopyMouthConfig;
  /** Sleepy breathing mouth (canonical replacement) */
  sleepyMouth?: true;
}

/**
 * Eyebrow part of a visual recipe.
 */
export interface EyebrowRecipe {
  /** Static eyebrow configuration */
  config?: EyebrowConfig;
  /** Animated bounce */
  animated?: AnimatedEyebrowsConfig;
}

/**
 * Body effects part of a visual recipe.
 */
export interface BodyEffectsRecipe {
  /** Dirt marks on body */
  dirtMarks?: DirtMarksConfig;
  /** Stink cloud puffs */
  stinkClouds?: StinkCloudsConfig;
  /** Anger-rise color overlay */
  angerRise?: { color: string; duration: number; level?: number };
}

/**
 * Extras: overlays and decorations not owned by a single subsystem.
 */
export interface ExtrasRecipe {
  /** Tear drops from eyes */
  tears?: TearConfig;
  /** Drool from mouth corner */
  drool?: DroolConfig;
  /** Food icon above head */
  foodIcon?: FoodIconConfig;
}

export interface TearConfig {
  enabled: boolean;
  eye: 'left' | 'right' | 'random' | 'both' | 'alternating';
  duration: number;
  pauseBetween?: number;
}

// ─── Central Recipe Type ──────────────────────────────────────────────────────

/**
 * A resolved visual recipe describing all parts of a Blobbi's expression.
 *
 * Each field is optional — only the parts present in the recipe are applied.
 * An empty recipe ({}) produces the neutral/default expression.
 */
export interface BlobbiVisualRecipe {
  /** Eye modifications (watery, star, dizzy, sleepy blink) */
  eyes?: EyeRecipe;
  /** Mouth shape override */
  mouth?: MouthRecipe;
  /** Eyebrow positioning and animation */
  eyebrows?: EyebrowRecipe;
  /** Body-level visual effects */
  bodyEffects?: BodyEffectsRecipe;
  /** Overlays and decorations (tears, drool, food icons) */
  extras?: ExtrasRecipe;
}

// ─── Emotion Preset Recipes ───────────────────────────────────────────────────

/**
 * Named emotion presets as part-based visual recipes.
 *
 * These presets define how Blobbi looks in different emotional/status states.
 * Each preset creates a distinct, recognizable expression that feels pet-like.
 *
 * The base Blobbi SVG (neutral) is visually content with a gentle smile,
 * so 'neutral' maps to an empty recipe (no modifications).
 *
 * **Relationship to status-driven expressions:**
 * Status-reactions.ts builds recipes dynamically from stats with severity
 * escalation (warning → high → critical). These presets serve as canonical
 * reference points and are used for:
 *   - Action overrides (feeding → 'happy', playing → 'excited')
 *   - Direct emotion setting in dev tools
 *   - Fallback when specific status logic isn't needed
 *
 * Status-related presets (hungry, sleepy, dirty, sad, dizzy) are aligned
 * with their status-driven "high" or "critical" severity equivalents so
 * the visual language stays consistent.
 *
 * Design principles:
 *   - Each preset should feel distinct and immediately readable
 *   - Status states (hungry, sleepy, sad) should evoke empathy
 *   - Interaction states (excited, surprised) should feel reactive
 *   - Expressions should work well alone and in combinations
 */
export const EMOTION_RECIPES: Record<BlobbiEmotion, BlobbiVisualRecipe> = {
  // ── Neutral ─────────────────────────────────────────────────────────────────
  // Base state: content, at ease. The SVG's default smile is the expression.
  neutral: {},

  // ── Sad ─────────────────────────────────────────────────────────────────────
  // Emotional sadness: watery eyes, downturned mouth, worried brows.
  // This is pure sadness (from low happiness), not hunger or tiredness.
  sad: {
    eyes: { wateryEyes: { includeWaterFill: true } },
    mouth: { sadMouth: true },
    eyebrows: {
      // Inner corners raised (worried/sad), slight curve
      config: { angle: -18, offsetY: -10, strokeWidth: 1.4, color: '#4b5563', curve: 0.15 },
    },
    extras: {
      tears: { enabled: true, eye: 'alternating', duration: 6, pauseBetween: 3 },
    },
  },

  // ── Boring ──────────────────────────────────────────────────────────────────
  // Generic low-energy, unamused state. Used as fallback when no specific
  // status applies. Flat expression, slightly droopy.
  boring: {
    mouth: { droopyMouth: { widthScale: 0.9, curveScale: 0.35 } },
    eyebrows: {
      // Flat, low-effort brows
      config: { angle: 0, offsetY: -8, strokeWidth: 1.2, color: '#6b7280' },
    },
  },

  // ── Dirty ───────────────────────────────────────────────────────────────────
  // Body decorator for low hygiene. Face shows mild discomfort/irritation.
  // The grimace and slightly furrowed brows say "I feel gross".
  // Matches the "high" severity hygiene expression from status-reactions.
  //
  // Dirt layer: muddy smudges + grime spots on lower body (warm brown)
  // Smell layer: wavy odor wisps in muted green, rising from sides
  dirty: {
    mouth: { droopyMouth: { widthScale: 0.8, curveScale: 0.2 } },
    eyebrows: {
      // Furrowed (uncomfortable/annoyed), matches high severity
      config: { angle: 10, offsetY: -9, strokeWidth: 1.3, color: '#6b7280' },
    },
    bodyEffects: {
      dirtMarks: { enabled: true, count: 4, intensity: 0.65 },
      stinkClouds: { enabled: true, count: 3 },
    },
  },

  // ── Happy ───────────────────────────────────────────────────────────────────
  // Content and pleased. The base SVG smile suffices; this is mostly a no-op.
  // Used as override during positive actions.
  happy: {},

  // ── Angry ───────────────────────────────────────────────────────────────────
  // Frustrated, upset. Intense frown, sharp angled brows, flushed body.
  angry: {
    mouth: { sadMouth: true },
    eyebrows: {
      // Angled down toward center (classic angry brows)
      config: { angle: 22, offsetY: -9, strokeWidth: 2.2, color: '#374151' },
    },
    bodyEffects: {
      angerRise: { color: '#ef4444', duration: 2 },
    },
  },

  // ── Surprised ───────────────────────────────────────────────────────────────
  // Startled, caught off guard. Wide open mouth, raised arched brows.
  surprised: {
    mouth: { roundMouth: { rx: 5, ry: 6, filled: true } },
    eyebrows: {
      // High arched (classic surprise)
      config: { angle: -15, offsetY: -13, strokeWidth: 1.4, color: '#4b5563', curve: 0.35 },
    },
  },

  // ── Sleepy ──────────────────────────────────────────────────────────────────
  // Drowsy, fading, needs rest. Heavy-lidded blinking eyes, soft breathing mouth.
  // Distinct from boring — this is genuine tiredness, not disinterest.
  sleepy: {
    eyes: { sleepyBlink: { cycleDuration: 8 } },
    mouth: { sleepyMouth: true },
    // No eyebrows — sleepy is a relaxed state, other stats can add brows
  },

  // ── Curious ─────────────────────────────────────────────────────────────────
  // Intrigued, investigating. Small "o" mouth, asymmetric raised brow.
  curious: {
    mouth: { roundMouth: { rx: 3, ry: 3.5, filled: true } },
    eyebrows: {
      config: {
        angle: -10, offsetY: -11, strokeWidth: 1.3, color: '#4b5563', curve: 0.2,
        // One brow raised higher (quizzical look)
        rightEyeOverride: { angle: -16, offsetY: -13, curve: 0.3 },
      },
    },
  },

  // ── Dizzy ───────────────────────────────────────────────────────────────────
  // Severely unwell, disoriented. Spiral eyes, dazed open mouth.
  // Only used at critical health — this is an urgent state.
  dizzy: {
    eyes: { dizzySpirals: { rotationDuration: 2 } },
    mouth: { roundMouth: { rx: 4, ry: 5, filled: true } },
    eyebrows: {
      // Raised/worried (distress)
      config: { angle: -12, offsetY: -11, strokeWidth: 1.3, color: '#6b7280', curve: 0.2 },
    },
  },

  // ── Excited ─────────────────────────────────────────────────────────────────
  // Thrilled, energized. Sparkling star eyes, big wide smile.
  // Used during play and joyful activities.
  excited: {
    eyes: { starEyes: { points: 5, color: '#fbbf24', scale: 0.9 } },
    mouth: { bigSmile: { widthScale: 1.3, curveScale: 1.4 } },
  },

  // ── ExcitedB ────────────────────────────────────────────────────────────────
  // Alternate excited: star eyes with "ooh!" open mouth.
  excitedB: {
    eyes: { starEyes: { points: 5, color: '#fbbf24', scale: 0.9 } },
    mouth: { roundMouth: { rx: 3.5, ry: 4, filled: true } },
  },

  // ── Mischievous ─────────────────────────────────────────────────────────────
  // Playfully scheming. Angled brows with bounce animation, smug smirk.
  mischievous: {
    eyebrows: {
      config: { angle: 18, offsetY: -10, strokeWidth: 2, color: '#374151' },
      animated: { enabled: true, bounceDuration: 0.6, bounceAmount: 2.5 },
    },
    mouth: { smallSmile: { scale: 0.7 } },
  },

  // ── Adoring ─────────────────────────────────────────────────────────────────
  // Affectionate, looking lovingly. Shiny glistening eyes, soft expression.
  adoring: {
    eyes: { wateryEyes: { includeWaterFill: false } },
    mouth: { roundMouth: { rx: 2.5, ry: 3, filled: true } },
  },

  // ── Hungry ──────────────────────────────────────────────────────────────────
  // Pleading, needy, hopeful for food. Shiny hopeful eyes (not sad-watery),
  // soft smile (not round "O" mouth), pleading brows, drool + food icon.
  // Matches the "high" severity hunger expression from status-reactions.
  // The expression evokes "please feed me" not surprise or shock.
  hungry: {
    eyes: { wateryEyes: { includeWaterFill: false } },
    eyebrows: {
      // Inner corners raised (pleading/hopeful), matches high severity
      config: { angle: -14, offsetY: -10, strokeWidth: 1.3, color: '#6b7280', curve: 0.15 },
    },
    mouth: { smallSmile: { scale: 0.75 } },
    extras: {
      drool: { enabled: true, side: 'right' },
      foodIcon: { enabled: true, type: 'utensils' },
    },
  },
};

// ─── Recipe Resolver ──────────────────────────────────────────────────────────

/**
 * Resolve a named emotion into a part-based visual recipe.
 *
 * This is the single entry point for converting a named emotion (preset)
 * into a recipe that the rendering pipeline can apply part-by-part.
 *
 * @param emotion - Named emotion preset
 * @returns The resolved visual recipe
 */
export function resolveVisualRecipe(emotion: BlobbiEmotion): BlobbiVisualRecipe {
  return EMOTION_RECIPES[emotion] ?? {};
}

/**
 * Merge two visual recipes, with the overlay recipe taking precedence
 * on a per-part basis for conflicting fields.
 *
 * This enables combining a persistent face state (e.g. boring) with
 * an animation layer (e.g. sleepy) into one resolved recipe.
 *
 * For the sleepy case specifically: sleepy defines its own eyes and mouth,
 * so those parts from the base get overridden, while eyebrows from the
 * base are preserved since sleepy doesn't define eyebrows.
 *
 * @param base - The base recipe (persistent face state)
 * @param overlay - The overlay recipe (takes precedence for defined parts)
 * @returns A merged recipe
 */
export function mergeVisualRecipes(
  base: BlobbiVisualRecipe,
  overlay: BlobbiVisualRecipe,
): BlobbiVisualRecipe {
  return {
    eyes: overlay.eyes ?? base.eyes,
    mouth: overlay.mouth ?? base.mouth,
    eyebrows: overlay.eyebrows ?? base.eyebrows,
    bodyEffects: mergeBodyEffects(base.bodyEffects, overlay.bodyEffects),
    extras: mergeExtras(base.extras, overlay.extras),
  };
}

function mergeBodyEffects(
  a?: BodyEffectsRecipe,
  b?: BodyEffectsRecipe,
): BodyEffectsRecipe | undefined {
  if (!a && !b) return undefined;
  return {
    ...a,
    ...b,
  };
}

function mergeExtras(
  a?: ExtrasRecipe,
  b?: ExtrasRecipe,
): ExtrasRecipe | undefined {
  if (!a && !b) return undefined;
  return {
    ...a,
    ...b,
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Simple string hash for deterministic seed generation.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

// ─── Tear Generation ──────────────────────────────────────────────────────────

function generateTears(eyes: EyePosition[], config: TearConfig, seed?: number): string {
  const pause = config.pauseBetween ?? 0;
  const fullCycleDuration = config.duration + pause;

  if (config.eye === 'alternating') {
    return eyes.map((eye, index) => {
      const tearStartY = eye.cy + eye.radius + 2;
      const tearEndY = tearStartY + 30;
      const delay = index * fullCycleDuration;
      const totalCycle = fullCycleDuration * eyes.length;

      return `
    <g class="blobbi-tear blobbi-tear-${eye.side}">
      <ellipse cx="${eye.cx}" cy="${tearStartY}" rx="2.5" ry="4" fill="url(#tearGradient)" opacity="0">
        <animate attributeName="cy" values="${tearStartY};${tearEndY};${tearStartY}" keyTimes="0;${config.duration / totalCycle};1" dur="${totalCycle}s" begin="${delay}s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.8;0.8;0;0" keyTimes="0;${0.05 * config.duration / totalCycle};${0.8 * config.duration / totalCycle};${config.duration / totalCycle};1" dur="${totalCycle}s" begin="${delay}s" repeatCount="indefinite" />
      </ellipse>
    </g>`;
    }).join('\n');
  }

  let targetEyes: EyePosition[];
  if (config.eye === 'both') {
    targetEyes = eyes;
  } else if (config.eye === 'random') {
    const eyeIndex = seed !== undefined ? Math.abs(seed) % eyes.length : 0;
    const selectedEye = eyes[eyeIndex];
    targetEyes = selectedEye ? [selectedEye] : [];
  } else {
    const eye = eyes.find(e => e.side === config.eye);
    targetEyes = eye ? [eye] : [];
  }

  return targetEyes.map((eye, index) => {
    const tearStartY = eye.cy + eye.radius + 2;
    const tearEndY = tearStartY + 30;
    const delay = index * (config.duration / 2);

    return `
    <g class="blobbi-tear blobbi-tear-${eye.side}">
      <ellipse cx="${eye.cx}" cy="${tearStartY}" rx="2.5" ry="4" fill="url(#tearGradient)" opacity="0">
        <animate attributeName="cy" values="${tearStartY};${tearEndY}" dur="${fullCycleDuration}s" begin="${delay}s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.8;0.8;0;0" keyTimes="0;0.05;${0.8 * config.duration / fullCycleDuration};${config.duration / fullCycleDuration};1" dur="${fullCycleDuration}s" begin="${delay}s" repeatCount="indefinite" />
      </ellipse>
    </g>`;
  }).join('\n');
}

// ─── Sleepy Animation ─────────────────────────────────────────────────────────

function generateSleepyStyles(cycleDuration: number): string {
  const dur = cycleDuration;
  return `
  <style type="text/css">
    @keyframes sleepy-closed-eye {
      0%, 33% { opacity: 0; }
      35%, 62% { opacity: 1; }
      63%, 100% { opacity: 0; }
    }
    @keyframes sleepy-wake-glance {
      0%, 75% { transform: translateX(0); }
      78%, 80% { transform: translateX(2px); }
      83%, 85% { transform: translateX(-2px); }
      88%, 100% { transform: translateX(0); }
    }
    @keyframes sleepy-zzz {
      0% { opacity: 0; } 10% { opacity: 0.2; } 20% { opacity: 0.4; }
      35%, 60% { opacity: 1; } 70%, 100% { opacity: 0; }
    }
    @keyframes sleepy-zzz-float {
      0% { transform: translateY(0); } 35% { transform: translateY(-4px); }
      60% { transform: translateY(-8px); } 70%, 100% { transform: translateY(-10px); }
    }
    .blobbi-sleepy .blobbi-eye { animation: sleepy-wake-glance ${dur}s ease-in-out infinite; }
    .blobbi-sleepy .blobbi-closed-eye { animation: sleepy-closed-eye ${dur}s ease-in-out infinite; }
    .blobbi-sleepy .blobbi-zzz { animation: sleepy-zzz ${dur}s ease-in-out infinite, sleepy-zzz-float ${dur}s ease-in-out infinite; }
  </style>`;
}

function generateSleepyClipAnimations(svgText: string, cycleDuration: number): string {
  const dur = cycleDuration;
  const clipRectRegex = new RegExp(
    `<rect\\s+class="${EYE_CLASSES.clipRect}"\\s+x="([^"]+)"\\s+y="([^"]+)"\\s+width="([^"]+)"\\s+height="([^"]+)"\\s*/>`,
    'g'
  );
  return svgText.replace(clipRectRegex, (_match, x, y, width, height) => {
    const baseY = parseFloat(y);
    const fullHeight = parseFloat(height);
    const closedOffset = fullHeight * 0.95;
    const closedY = baseY + closedOffset;
    const closedHeight = fullHeight - closedOffset;
    const yValues = `${baseY};${baseY};${closedY};${closedY};${baseY};${baseY}`;
    const heightValues = `${fullHeight};${fullHeight};${closedHeight};${closedHeight};${fullHeight};${fullHeight}`;
    const keyTimes = '0;0.10;0.35;0.62;0.75;1';
    return `<rect class="${EYE_CLASSES.clipRect}" x="${x}" y="${y}" width="${width}" height="${height}">
        <animate attributeName="y" values="${yValues}" keyTimes="${keyTimes}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" />
        <animate attributeName="height" values="${heightValues}" keyTimes="${keyTimes}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" />
      </rect>`;
  });
}

function generateClosedEyeLines(eyes: EyePosition[]): string {
  return eyes.map(eye => {
    const lineWidth = eye.radius * 1.6;
    const startX = eye.cx - lineWidth / 2;
    const endX = eye.cx + lineWidth / 2;
    const curveDepth = eye.radius * 0.5;
    const yOffset = eye.radius * 0.75;
    const lineY = eye.cy + yOffset;
    return `<path class="blobbi-closed-eye blobbi-closed-eye-${eye.side}" d="M ${startX} ${lineY} Q ${eye.cx} ${lineY + curveDepth} ${endX} ${lineY}" stroke="#374151" stroke-width="2" stroke-linecap="round" fill="none" opacity="0" />`;
  }).join('\n');
}

function generateSleepyZzz(): string {
  return `<g class="blobbi-zzz" opacity="0">
    <text x="70" y="12" font-family="system-ui, sans-serif" font-size="8" font-weight="bold" fill="#6b7280">z</text>
    <text x="76" y="8" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="#6b7280">z</text>
    <text x="84" y="3" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#6b7280">z</text>
  </g>`;
}

function applySleepyAnimation(
  svgText: string,
  eyes: EyePosition[],
  anchor: { cx: number; cy: number } | null,
  cycleDuration: number,
): string {
  // Add 'blobbi-sleepy' class to SVG root
  svgText = svgText.replace(/<svg([^>]*)>/, (match, attrs) => {
    if (attrs.includes('class="')) {
      return match.replace(/class="([^"]*)"/, 'class="$1 blobbi-sleepy"');
    } else if (attrs.includes("class='")) {
      return match.replace(/class='([^']*)'/, "class='$1 blobbi-sleepy'");
    } else {
      return `<svg${attrs} class="blobbi-sleepy">`;
    }
  });

  // CSS animations
  const sleepyStyles = generateSleepyStyles(cycleDuration);
  if (svgText.includes('<defs>')) {
    svgText = svgText.replace('<defs>', '<defs>' + sleepyStyles);
  } else {
    svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + sleepyStyles);
  }

  // Eye closing via clip-path SMIL
  svgText = generateSleepyClipAnimations(svgText, cycleDuration);

  // Replace current mouth with canonical sleepy breathing mouth
  if (anchor) {
    svgText = applySleepyMouth(svgText, anchor);
  }

  // Overlays: closed eye lines + Zzz
  const closedEyeLines = generateClosedEyeLines(eyes);
  const zzz = generateSleepyZzz();
  const sleepyOverlays = `
  <g class="blobbi-sleepy-overlays">
    ${closedEyeLines}
    ${zzz}
  </g>`;
  svgText = svgText.replace('</svg>', sleepyOverlays + '\n</svg>');

  return svgText;
}

// ─── Sleeping State (permanently closed eyes + Zzz) ──────────────────────────

/**
 * CSS styles for the sleeping state.
 * Eyes are permanently closed (no blink cycle). Zzz floats gently.
 */
function generateSleepingStyles(): string {
  return `
  <style type="text/css">
    @keyframes sleeping-zzz {
      0%   { opacity: 0;   transform: translateY(0); }
      15%  { opacity: 0.8; transform: translateY(-2px); }
      50%  { opacity: 1;   transform: translateY(-6px); }
      85%  { opacity: 0.4; transform: translateY(-10px); }
      100% { opacity: 0;   transform: translateY(-12px); }
    }
    .blobbi-sleeping .blobbi-sleeping-zzz text:nth-child(1) {
      animation: sleeping-zzz 3.5s ease-in-out infinite;
    }
    .blobbi-sleeping .blobbi-sleeping-zzz text:nth-child(2) {
      animation: sleeping-zzz 3.5s ease-in-out 0.6s infinite;
    }
    .blobbi-sleeping .blobbi-sleeping-zzz text:nth-child(3) {
      animation: sleeping-zzz 3.5s ease-in-out 1.2s infinite;
    }
  </style>`;
}

function generateSleepingZzz(): string {
  return `<g class="blobbi-sleeping-zzz">
    <text x="70" y="12" font-family="system-ui, sans-serif" font-size="8" font-weight="bold" fill="#6b7280" opacity="0">z</text>
    <text x="76" y="8" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="#6b7280" opacity="0">z</text>
    <text x="84" y="3" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#6b7280" opacity="0">z</text>
  </g>`;
}

/**
 * Apply sleeping state visuals: permanently closed eyes + Zzz.
 *
 * Unlike `applySleepyAnimation` (which cycles between open/closed for the
 * drowsy low-energy reaction), this keeps the eyes fully shut and uses
 * closed-eye line overlays + permanent clip-path closure.
 *
 * Called from `applyVisualRecipe` when `recipe.eyes.sleepingClosed` is set.
 */
function applySleepingClosedEyes(
  svgText: string,
  eyes: EyePosition[],
  anchor: { cx: number; cy: number } | null,
): string {
  // Add 'blobbi-sleeping' class to SVG root
  svgText = svgText.replace(/<svg([^>]*)>/, (match, attrs) => {
    if (attrs.includes('class="')) {
      return match.replace(/class="([^"]*)"/, 'class="$1 blobbi-sleeping"');
    } else if (attrs.includes("class='")) {
      return match.replace(/class='([^']*)'/, "class='$1 blobbi-sleeping'");
    } else {
      return `<svg${attrs} class="blobbi-sleeping">`;
    }
  });

  // Inject CSS animations for Zzz float
  const styles = generateSleepingStyles();
  if (svgText.includes('<defs>')) {
    svgText = svgText.replace('<defs>', '<defs>' + styles);
  } else {
    svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + styles);
  }

  // Close eyes permanently by moving clip-path rects to fully closed position (no SMIL animation)
  const clipRectRegex = new RegExp(
    `<rect\\s+class="${EYE_CLASSES.clipRect}"\\s+x="([^"]+)"\\s+y="([^"]+)"\\s+width="([^"]+)"\\s+height="([^"]+)"\\s*/>`,
    'g'
  );
  svgText = svgText.replace(clipRectRegex, (_match, x, y, width, height) => {
    const baseY = parseFloat(y);
    const fullHeight = parseFloat(height);
    const closedOffset = fullHeight * 0.95;
    const closedY = baseY + closedOffset;
    const closedHeight = fullHeight - closedOffset;
    // Set clip rect to closed position — no animation
    return `<rect class="${EYE_CLASSES.clipRect}" x="${x}" y="${closedY}" width="${width}" height="${closedHeight}" />`;
  });

  // Replace mouth with sleeping mouth
  if (anchor) {
    svgText = applySleepyMouth(svgText, anchor);
  }

  // Overlays: closed eye lines (permanently visible) + Zzz
  const closedEyeLines = eyes.map(eye => {
    const lineWidth = eye.radius * 1.6;
    const startX = eye.cx - lineWidth / 2;
    const endX = eye.cx + lineWidth / 2;
    const curveDepth = eye.radius * 0.5;
    const yOffset = eye.radius * 0.75;
    const lineY = eye.cy + yOffset;
    return `<path class="blobbi-closed-eye blobbi-closed-eye-${eye.side}" d="M ${startX} ${lineY} Q ${eye.cx} ${lineY + curveDepth} ${endX} ${lineY}" stroke="#374151" stroke-width="2" stroke-linecap="round" fill="none" opacity="1" />`;
  }).join('\n');

  const zzz = generateSleepingZzz();
  const sleepingOverlays = `
  <g class="blobbi-sleeping-overlays">
    ${closedEyeLines}
    ${zzz}
  </g>`;
  svgText = svgText.replace('</svg>', sleepingOverlays + '\n</svg>');

  return svgText;
}

/**
 * Build a sleeping recipe overlay from a base status recipe.
 *
 * Sleeping overrides the face (eyes, mouth, eyebrows) but allows
 * selective coexistence with body effects and some extras:
 *
 * - Eyes: always sleeping closed (overrides watery, dizzy, star, sleepy blink)
 * - Mouth: always sleeping mouth (overrides all other mouth shapes)
 * - Eyebrows: removed (sleeping is relaxed)
 * - Body effects: preserved (dirty smudges, stink clouds still visible)
 * - Extras: food icon kept, drool/tears removed
 */
export function buildSleepingRecipe(statusRecipe?: BlobbiVisualRecipe): BlobbiVisualRecipe {
  return {
    // Sleeping face overrides everything
    eyes: { sleepingClosed: true },
    mouth: { sleepyMouth: true },
    eyebrows: undefined,
    // Keep body effects from status (dirty, stink)
    bodyEffects: statusRecipe?.bodyEffects,
    // Keep food icon, strip drool/tears
    extras: statusRecipe?.extras ? {
      foodIcon: statusRecipe.extras.foodIcon,
    } : undefined,
  };
}

// ─── Recipe Application ───────────────────────────────────────────────────────

/**
 * Apply a resolved visual recipe to SVG content.
 *
 * This is the main rendering pipeline. It applies each part independently
 * through its owning subsystem, in a deterministic order:
 *
 *   1. Detection phase (eye/mouth positions from original SVG)
 *   2. Defs injection (tear gradient if needed)
 *   3. Eyebrows (from eyebrows/ module)
 *   4. Mouth shape (from mouth/ module)
 *   5. Eye effects (from eyes/ module)
 *   6. Extras: tears, sleepy animation, drool, food icon
 *   7. Overlay insertion
 *   8. Body effects (from bodyEffects/ module)
 *
 * @param svgText - The base SVG content (after eye animation wrappers)
 * @param recipe - The resolved visual recipe to apply
 * @param recipeLabel - Human-readable label for the recipe (used in SVG
 *   class names for CSS targeting, e.g. 'sleepy', 'hungry-sleepy', 'status')
 * @param variant - 'baby' or 'adult' for variant-specific adjustments
 * @param form - Adult form name (optional)
 * @param instanceId - Unique ID for stable SVG element IDs
 * @returns Modified SVG with all recipe parts applied
 */
export function applyVisualRecipe(
  svgText: string,
  recipe: BlobbiVisualRecipe,
  recipeLabel: string,
  variant: BlobbiVariant = 'adult',
  form?: string,
  instanceId?: string,
): string {
  // Empty recipe = neutral, no modifications
  if (!recipe.eyes && !recipe.mouth && !recipe.eyebrows && !recipe.bodyEffects && !recipe.extras) {
    return svgText;
  }

  // ── Detection phase (on original SVG before modifications) ──
  const eyes = detectEyePositions(svgText);
  const mouth = detectMouthPosition(svgText);
  const mouthAnchor = mouth ? mouthAnchorFromDetection(mouth) : null;

  const overlays: string[] = [];

  // ── Defs: tear gradient ──
  if (recipe.extras?.tears?.enabled) {
    const tearDefs = `
    <defs>
      <radialGradient id="tearGradient" cx="0.3" cy="0.3">
        <stop offset="0%" stop-color="#e0f2fe" />
        <stop offset="100%" stop-color="#7dd3fc" />
      </radialGradient>
    </defs>`;
    if (svgText.includes('<defs>')) {
      svgText = svgText.replace('<defs>', '<defs>' + tearDefs.replace(/<\/?defs>/g, ''));
    } else {
      svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + tearDefs);
    }
  }

  // ── Eyebrows (from eyebrows/ module) ──
  if (recipe.eyebrows?.config && eyes.length > 0) {
    overlays.push(generateEyebrows(eyes, recipe.eyebrows.config, variant, form));
  }

  // ── Mouth shape (from mouth/ module) ──
  // Priority order matches the old system
  if (recipe.mouth && mouth) {
    if (recipe.mouth.roundMouth) {
      svgText = replaceMouthSection(svgText, generateRoundMouth(mouth.position, recipe.mouth.roundMouth));
    } else if (recipe.mouth.sadMouth) {
      svgText = replaceMouthSection(svgText, generateSadMouth(mouth.position));
    } else if (recipe.mouth.smallSmile) {
      svgText = replaceMouthSection(svgText, generateSmallSmile(mouth.position, recipe.mouth.smallSmile));
    } else if (recipe.mouth.bigSmile) {
      svgText = replaceMouthSection(svgText, generateBigSmile(mouth.position, recipe.mouth.bigSmile));
    } else if (recipe.mouth.droopyMouth) {
      svgText = replaceMouthSection(svgText, generateDroopyMouth(mouth.position, recipe.mouth.droopyMouth));
    }
    // Note: sleepyMouth is handled in the sleepy animation section below
  }

  // ── Eye effects (from eyes/ module) ──
  if (recipe.eyes) {
    if (recipe.eyes.wateryEyes && eyes.length > 0) {
      svgText = applySadEyes(svgText, { includeWaterFill: recipe.eyes.wateryEyes.includeWaterFill }, eyes);
    }

    if (recipe.eyes.dizzySpirals && eyes.length > 0) {
      svgText = applyDizzyEyes(svgText, { rotationDuration: recipe.eyes.dizzySpirals.rotationDuration }, eyes);
    }

    if (recipe.eyes.starEyes && eyes.length > 0) {
      svgText = applyStarEyes(
        svgText,
        {
          points: recipe.eyes.starEyes.points,
          color: recipe.eyes.starEyes.color,
          scale: recipe.eyes.starEyes.scale,
        },
        eyes,
      );
    }
  }

  // ── Extras: tears ──
  if (recipe.extras?.tears?.enabled && eyes.length > 0) {
    const seed = hashString(svgText);
    overlays.push(generateTears(eyes, recipe.extras.tears, seed));
  }

  // ── Sleepy animation (cross-cutting: eyes + mouth + extras) ──
  if (recipe.eyes?.sleepyBlink) {
    svgText = applySleepyAnimation(
      svgText,
      eyes,
      mouthAnchor,
      recipe.eyes.sleepyBlink.cycleDuration,
    );
  }

  // ── Sleeping state (permanently closed eyes + Zzz) ──
  // Mutually exclusive with sleepyBlink — sleepingClosed takes precedence
  if (recipe.eyes?.sleepingClosed && !recipe.eyes?.sleepyBlink) {
    svgText = applySleepingClosedEyes(svgText, eyes, mouthAnchor);
  }

  // ── Animated eyebrows ──
  if (recipe.eyebrows?.animated?.enabled) {
    svgText = applyAnimatedEyebrows(svgText, recipe.eyebrows.animated);
  }

  // ── Extras: drool ──
  // Drool anchor must match the *final* mouth shape position, not the original
  if (recipe.extras?.drool?.enabled && mouth) {
    const droolDefs = `
      <radialGradient id="droolGradient" cx="0.3" cy="0.2">
        <stop offset="0%" stop-color="#f0f9ff" />
        <stop offset="60%" stop-color="#e0f2fe" />
        <stop offset="100%" stop-color="#bae6fd" />
      </radialGradient>`;
    if (svgText.includes('<defs>')) {
      svgText = svgText.replace('<defs>', '<defs>' + droolDefs);
    } else {
      svgText = svgText.replace(/(<svg[^>]*>)/, `$1\n  <defs>${droolDefs}\n  </defs>`);
    }
    // Compute drool anchor based on actual mouth shape being rendered
    const droolSide = recipe.extras.drool.side || 'right';
    const droolAnchor = computeDroolAnchor(mouth.position, recipe.mouth, droolSide);
    overlays.push(generateDroolAtAnchor(droolAnchor, recipe.extras.drool));
  }

  // ── Extras: food icon ──
  if (recipe.extras?.foodIcon?.enabled) {
    // Detect body path for shape-aware positioning (adults only)
    const bodyPath = variant === 'adult' ? detectBodyPath(svgText) : null;
    overlays.push(generateFoodIcon({ 
      ...recipe.extras.foodIcon, 
      variant,
      bodyPath: bodyPath ?? undefined,
    }));
  }

  // ── Insert overlays ──
  if (overlays.length > 0) {
    const overlayGroup = `
  <!-- Visual recipe overlays: ${recipeLabel} -->
  <g class="blobbi-recipe blobbi-recipe-${recipeLabel}">
    ${overlays.join('\n    ')}
  </g>`;
    svgText = svgText.replace('</svg>', overlayGroup + '\n</svg>');
  }

  // ── Body effects (from bodyEffects/ module) ──
  if (recipe.bodyEffects) {
    const bodySpec: BodyEffectsSpec = {
      variant, // Pass variant for coordinate scaling
    };
    if (recipe.bodyEffects.dirtMarks?.enabled) {
      bodySpec.dirtyMarks = recipe.bodyEffects.dirtMarks;
    }
    if (recipe.bodyEffects.stinkClouds?.enabled) {
      bodySpec.stinkClouds = recipe.bodyEffects.stinkClouds;
    }
    if (recipe.bodyEffects.angerRise) {
      bodySpec.angerRise = {
        color: recipe.bodyEffects.angerRise.color,
        duration: recipe.bodyEffects.angerRise.duration,
        level: recipe.bodyEffects.angerRise.level,
      };
    }
    if (instanceId) {
      bodySpec.idPrefix = instanceId;
    }

    if (bodySpec.dirtyMarks || bodySpec.stinkClouds || bodySpec.angerRise) {
      svgText = applyBodyEffects(svgText, bodySpec);
    }
  }

  return svgText;
}
