/**
 * Blobbi Emotion System — Orchestrator
 *
 * This file defines emotion RECIPES (configurations) and orchestrates their
 * application by calling the specialized subsystem modules:
 *
 * - eyes/       — eye detection, effects (sad, star, dizzy, sleepy)
 * - mouth/      — mouth detection, replacement, shape generation
 * - eyebrows/   — eyebrow generation and animation
 * - bodyEffects/ — body-level decorators (dirt, stink, anger-rise)
 *
 * Design principles:
 * - Each subsystem module owns its implementation
 * - emotions.ts only defines recipes and orchestrates composition
 * - The base SVG is kept intact (neutral state)
 * - Emotions are additive — they overlay elements on the base
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
  generateDrool,
  generateFoodIcon,
  applySleepyMouth,

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
  detectBodyPath,
  generateAngerRiseEffect,
  generateDirtMarks,
  generateStinkClouds,
  type BodyEffectConfig,
  type DirtMarksConfig,
  type StinkCloudsConfig,
} from './bodyEffects';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Available emotion states for Blobbies.
 */
export type BlobbiEmotion = 'neutral' | 'sad' | 'boring' | 'dirty' | 'happy' | 'angry' | 'surprised' | 'sleepy' | 'curious' | 'dizzy' | 'excited' | 'excitedB' | 'mischievous' | 'adoring' | 'hungry';

/**
 * Blobbi variant for variant-specific adjustments.
 */
export type BlobbiVariant = 'baby' | 'adult';

// Re-export subsystem types needed by external consumers
export type { EyePosition } from './eyes';
export type { MouthPosition, MouthDetectionResult } from './mouth';
export type { EyebrowConfig } from './eyebrows';

// ─── Emotion Recipe Types ─────────────────────────────────────────────────────

/**
 * Emotion recipe: describes what each emotion modifies.
 * Each field maps to a subsystem call.
 */
export interface EmotionConfig {
  /** Eye modification: watery/sad eyes */
  pupilModification?: PupilModification;
  /** Mouth: override curve (negative = frown) */
  mouthCurve?: number;
  /** Mouth: round "O" shape */
  roundMouth?: RoundMouthConfig;
  /** Eyebrows: angle, color, position */
  eyebrows?: EyebrowConfig;
  /** Overlay: tear animation */
  tears?: TearConfig;
  /** Body: color overlay effect */
  bodyEffect?: BodyEffectConfig;
  /** Overlay: sleepy tired-blink animation */
  sleepyAnimation?: SleepyAnimationConfig;
  /** Eyes: dizzy spiral effect */
  dizzyEffect?: DizzyEffectConfig;
  /** Eyebrows: animated bounce */
  animatedEyebrows?: AnimatedEyebrowsConfig;
  /** Mouth: small/smug smile */
  smallSmile?: SmallSmileConfig;
  /** Eyes: star eyes */
  starEyes?: StarEyesConfig;
  /** Mouth: bigger/wider smile */
  bigSmile?: BigSmileConfig;
  /** Mouth: drool drop */
  drool?: DroolConfig;
  /** Overlay: food icon above head */
  foodIcon?: FoodIconConfig;
  /** Mouth: droopy/weak */
  droopyMouth?: DroopyMouthConfig;
  /** Body: dirt marks */
  dirtMarks?: DirtMarksConfig;
  /** Body: stink clouds */
  stinkClouds?: StinkCloudsConfig;
}

export interface PupilModification {
  wateryEyes: boolean;
  includeWaterFill?: boolean;
}

export interface TearConfig {
  enabled: boolean;
  eye: 'left' | 'right' | 'random' | 'both' | 'alternating';
  duration: number;
  pauseBetween?: number;
}

export interface SleepyAnimationConfig {
  enabled: boolean;
  cycleDuration: number;
}

export interface DizzyEffectConfig {
  enabled: boolean;
  rotationDuration: number;
}

export interface StarEyesConfig {
  enabled: boolean;
  points?: number;
  color?: string;
  scale?: number;
}

// ─── Emotion Recipes ──────────────────────────────────────────────────────────

/**
 * Predefined emotion configurations (recipes).
 * 
 * Each recipe describes which subsystems to invoke and with what parameters.
 * The base Blobbi expression is visually "happy" (smiling mouth).
 * 'neutral' means "no modifications".
 */
export const EMOTION_CONFIGS: Record<BlobbiEmotion, EmotionConfig> = {
  neutral: {},
  sad: {
    pupilModification: { wateryEyes: true },
    mouthCurve: -1,
    eyebrows: {
      angle: -15, offsetY: -10, strokeWidth: 1.5, color: '#374151',
    },
    tears: {
      enabled: true, eye: 'alternating', duration: 6, pauseBetween: 3,
    },
  },
  boring: {
    droopyMouth: { widthScale: 0.9, curveScale: 0.4 },
    eyebrows: {
      angle: 0, offsetY: -9, strokeWidth: 1.3, color: '#4b5563',
    },
  },
  dirty: {
    // Body-only decorator. No face modifications.
    dirtMarks: { enabled: true, count: 3 },
    stinkClouds: { enabled: true, count: 3 },
  },
  happy: {
    mouthCurve: 1.2,
  },
  angry: {
    mouthCurve: -0.5,
    eyebrows: {
      angle: 20, offsetY: -10, strokeWidth: 2.5, color: '#1f2937',
    },
    bodyEffect: { type: 'anger-rise', color: '#ef4444', duration: 2 },
  },
  surprised: {
    roundMouth: { rx: 5, ry: 6, filled: true },
    eyebrows: {
      angle: -12, offsetY: -12, strokeWidth: 1.5, color: '#374151', curve: 0.3,
    },
  },
  sleepy: {
    sleepyAnimation: { enabled: true, cycleDuration: 8 },
  },
  curious: {
    roundMouth: { rx: 3, ry: 3.5, filled: true },
    eyebrows: {
      angle: -8, offsetY: -11, strokeWidth: 1.3, color: '#4b5563', curve: 0.15,
      rightEyeOverride: { angle: -14, offsetY: -12.5, curve: 0.25 },
    },
  },
  dizzy: {
    dizzyEffect: { enabled: true, rotationDuration: 2 },
    roundMouth: { rx: 4, ry: 5, filled: true },
  },
  excited: {
    starEyes: { enabled: true, points: 5, color: '#fbbf24', scale: 0.9 },
    bigSmile: { widthScale: 1.3, curveScale: 1.4 },
  },
  excitedB: {
    starEyes: { enabled: true, points: 5, color: '#fbbf24', scale: 0.9 },
    roundMouth: { rx: 3.5, ry: 4, filled: true },
  },
  mischievous: {
    eyebrows: {
      angle: 20, offsetY: -10, strokeWidth: 2.5, color: '#1f2937',
    },
    animatedEyebrows: { enabled: true, bounceDuration: 0.6, bounceAmount: 2.5 },
    smallSmile: { scale: 0.7 },
  },
  adoring: {
    pupilModification: { wateryEyes: true, includeWaterFill: false },
    roundMouth: { rx: 3, ry: 3.5, filled: true },
  },
  hungry: {
    pupilModification: { wateryEyes: true, includeWaterFill: false },
    eyebrows: {
      angle: -15, offsetY: -10, strokeWidth: 1.5, color: '#374151',
    },
    droopyMouth: { widthScale: 0.85, curveScale: 0.6 },
    drool: { enabled: true, side: 'right' },
    foodIcon: { enabled: true, type: 'utensils' },
  },
};

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

// ─── Tear Generation (cross-cutting overlay) ──────────────────────────────────

/**
 * Generate tear drop SVG with animation.
 * Tears are positioned relative to eyes but rendered as SVG overlays.
 */
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

// ─── Sleepy Overlay (cross-cutting, coordinates eyes + mouth) ─────────────────

function generateSleepyStyles(config: SleepyAnimationConfig): string {
  const dur = config.cycleDuration;
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

function generateSleepyClipAnimations(svgText: string, config: SleepyAnimationConfig): string {
  const dur = config.cycleDuration;
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

function applySleepyAnimation(svgText: string, eyes: EyePosition[], anchor: { cx: number; cy: number } | null, config: SleepyAnimationConfig): string {
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
  const sleepyStyles = generateSleepyStyles(config);
  if (svgText.includes('<defs>')) {
    svgText = svgText.replace('<defs>', '<defs>' + sleepyStyles);
  } else {
    svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + sleepyStyles);
  }
  
  // Eye closing via clip-path SMIL
  svgText = generateSleepyClipAnimations(svgText, config);
  
  // Replace current mouth with canonical sleepy breathing mouth (delegates to mouth/ module)
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

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Apply emotion overlays to SVG content.
 * 
 * Orchestrates calls to subsystem modules based on the emotion recipe.
 * Application order matters — each step may modify the SVG for the next.
 */
export function applyEmotion(
  svgText: string,
  emotion: BlobbiEmotion,
  variant: BlobbiVariant = 'adult',
  form?: string
): string {
  if (emotion === 'neutral') {
    return svgText;
  }
  
  const config = EMOTION_CONFIGS[emotion];
  if (!config) {
    return svgText;
  }
  
  // ── Detection phase (runs on original SVG before modifications) ──
  const eyes = detectEyePositions(svgText);
  const mouth = detectMouthPosition(svgText);
  const mouthAnchor = mouth ? mouthAnchorFromDetection(mouth) : null;
  
  const overlays: string[] = [];
  
  // ── Defs: tear gradient ──
  if (config.tears?.enabled) {
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
  if (config.eyebrows && eyes.length > 0) {
    overlays.push(generateEyebrows(eyes, config.eyebrows, variant, form));
  }
  
  // ── Mouth modifications (from mouth/ module) ──
  if (config.roundMouth && mouth) {
    svgText = replaceMouthSection(svgText, generateRoundMouth(mouth.position, config.roundMouth));
  } else if (config.mouthCurve !== undefined && config.mouthCurve < 0 && mouth) {
    svgText = replaceMouthSection(svgText, generateSadMouth(mouth.position));
  }
  
  // ── Eye effects (from eyes/ module) ──
  if (config.pupilModification?.wateryEyes && eyes.length > 0) {
    const includeWaterFill = config.pupilModification.includeWaterFill !== false;
    svgText = applySadEyes(svgText, { includeWaterFill }, eyes);
  }
  
  // ── Tears (cross-cutting overlay) ──
  if (config.tears?.enabled && eyes.length > 0) {
    const seed = hashString(svgText);
    overlays.push(generateTears(eyes, config.tears, seed));
  }
  
  // ── Body effect: anger rise (from bodyEffects/ module) ──
  if (config.bodyEffect) {
    const bodyPath = detectBodyPath(svgText);
    if (bodyPath) {
      const effect = generateAngerRiseEffect(bodyPath, config.bodyEffect);
      if (svgText.includes('<defs>')) {
        svgText = svgText.replace('<defs>', '<defs>' + effect.defs);
      } else {
        svgText = svgText.replace(/(<svg[^>]*>)/, `$1\n  <defs>${effect.defs}\n  </defs>`);
      }
      const bodyPathRegex = /<path[^>]*d="[^"]*"[^>]*fill="url\(#[^"]*[Bb]ody[^"]*\)"[^>]*\/>/;
      const bodyPathMatch = svgText.match(bodyPathRegex);
      if (bodyPathMatch && bodyPathMatch.index !== undefined) {
        const insertPos = bodyPathMatch.index + bodyPathMatch[0].length;
        svgText = svgText.slice(0, insertPos) + effect.overlay + svgText.slice(insertPos);
      }
    }
  }
  
  // ── Sleepy animation (cross-cutting overlay) ──
  if (config.sleepyAnimation?.enabled) {
    svgText = applySleepyAnimation(svgText, eyes, mouthAnchor, config.sleepyAnimation);
  }
  
  // ── Dizzy eyes (from eyes/ module) ──
  if (config.dizzyEffect?.enabled && eyes.length > 0) {
    svgText = applyDizzyEyes(svgText, { rotationDuration: config.dizzyEffect.rotationDuration }, eyes);
  }
  
  // ── Animated eyebrows (from eyebrows/ module) ──
  if (config.animatedEyebrows?.enabled) {
    svgText = applyAnimatedEyebrows(svgText, config.animatedEyebrows);
  }
  
  // ── Small smile (from mouth/ module) ──
  if (config.smallSmile && mouth) {
    svgText = replaceMouthSection(svgText, generateSmallSmile(mouth.position, config.smallSmile));
  }
  
  // ── Star eyes (from eyes/ module) ──
  if (config.starEyes?.enabled && eyes.length > 0) {
    svgText = applyStarEyes(
      svgText,
      { points: config.starEyes.points ?? 5, color: config.starEyes.color ?? '#fbbf24', scale: config.starEyes.scale ?? 0.9 },
      eyes
    );
  }
  
  // ── Big smile (from mouth/ module) ──
  if (config.bigSmile && mouth) {
    svgText = replaceMouthSection(svgText, generateBigSmile(mouth.position, config.bigSmile));
  }
  
  // ── Droopy mouth (from mouth/ module) ──
  if (config.droopyMouth && mouth) {
    svgText = replaceMouthSection(svgText, generateDroopyMouth(mouth.position, config.droopyMouth));
  }
  
  // ── Drool (from mouth/ module) ──
  if (config.drool?.enabled && mouth) {
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
    overlays.push(generateDrool(mouth.position, config.drool));
  }
  
  // ── Food icon (from mouth/ module) ──
  if (config.foodIcon?.enabled) {
    overlays.push(generateFoodIcon(config.foodIcon));
  }
  
  // ── Dirt marks (from bodyEffects/ module) ──
  if (config.dirtMarks?.enabled) {
    overlays.push(generateDirtMarks(config.dirtMarks));
  }
  
  // ── Stink clouds (from bodyEffects/ module) ──
  if (config.stinkClouds?.enabled) {
    overlays.push(generateStinkClouds(config.stinkClouds));
  }
  
  // ── Insert overlays ──
  if (overlays.length > 0) {
    const overlayGroup = `
  <!-- Emotion overlays: ${emotion} -->
  <g class="blobbi-emotion blobbi-emotion-${emotion}">
    ${overlays.join('\n    ')}
  </g>`;
    svgText = svgText.replace('</svg>', overlayGroup + '\n</svg>');
  }
  
  return svgText;
}

// ─── Public Utilities ─────────────────────────────────────────────────────────

/**
 * Check if an emotion requires special eye handling.
 */
export function emotionAffectsEyes(emotion: BlobbiEmotion): boolean {
  const config = EMOTION_CONFIGS[emotion];
  return !!(config?.pupilModification || config?.starEyes?.enabled || config?.dizzyEffect?.enabled);
}

// ─── Legacy Re-exports ────────────────────────────────────────────────────────
// These maintain backward compatibility for external consumers that imported
// from emotions.ts directly. New code should import from the subsystem modules.

/** @deprecated Import from '@/blobbi/ui/lib/mouth' instead */
export { detectMouthPosition } from './mouth';
/** @deprecated Import from '@/blobbi/ui/lib/mouth' instead */
export { generateRoundMouth } from './mouth';
/** @deprecated Import from '@/blobbi/ui/lib/mouth' instead */
export { generateSadMouth } from './mouth';
/** @deprecated Import from '@/blobbi/ui/lib/eyes' instead */
export { detectEyePositions } from './eyes';
/** @deprecated Import from '@/blobbi/ui/lib/eyebrows' instead */
export { generateEyebrows } from './eyebrows';
