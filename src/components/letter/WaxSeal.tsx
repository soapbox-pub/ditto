/**
 * WaxSeal — a disc of wax with an emblem pressed into it. Used on the
 * envelope in the send animation, on envelope cards, and in the seal picker.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { defaultSeal, type SealIcon, type WaxSeal as WaxSealData } from '@/lib/letterTypes';
import { blendHex as mixHex } from '@/lib/colorUtils';
import { loadBundledFont } from '@/lib/fonts';

/** A canvas font: `px` of the system's colour emoji. */
const emojiCanvasFont = (px: number) =>
  `${px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

/** Ditto's logo, drawn on a `-5 -10 100 100` canvas. */
const DITTO_LOGO_PATHS = [
  'm 71.719615,49.36907 -0.62891,0.37109 c -0.12891,0.07031 -0.26172,0.14844 -0.39062,0.21875 -3.9883,10.309 -14.008,17.617 -25.699,17.617 -4.1211,0 -8.0312,-0.89844 -11.539,-2.5391 -0.12891,0.03906 -0.26172,0.07031 -0.39063,0.10156 l -0.35156,0.08984 h -0.02734 l -0.25,0.05859 -0.07813,0.01953 -0.10938,0.03125 c -0.55859,0.12891 -1.1289,0.26172 -1.6992,0.39062 -0.10156,0.03125 -0.19922,0.05078 -0.30078,0.07031 l -0.30078,0.10156 -0.18359,0.0078 c -0.26953,0.05859 -1.3086,0.26953 -1.3086,0.26953 -0.28906,0.05859 -0.55859,0.10937 -0.82813,0.17187 4.9805,3.3086 10.961,5.2305 17.371,5.2305 15.059,0 27.699,-10.602 30.828,-24.738 -0.75,0.48828 -1.5195,0.96875 -2.2891,1.4414 -0.59375,0.36328 -1.2031,0.72656 -1.8242,1.0859 z',
  'm 30.926615,29.47807 c 0.36328,-0.48828 0.75,-0.95312 1.1523,-1.3828 0.75781,-0.80469 0.71484,-2.0703 -0.08984,-2.8281 -0.80469,-0.75781 -2.0703,-0.71484 -2.8281,0.08984 -0.50781,0.53906 -0.99219,1.125 -1.4492,1.7383 -0.65625,0.88672 -0.47266,2.1406 0.41406,2.7969 0.35938,0.26562 0.77344,0.39453 1.1875,0.39453 0.61719,0 1.2227,-0.27734 1.6133,-0.80859 z',
  'm 26.742615,32.67807 c -1.0586,-0.3125 -2.1719,0.29687 -2.4805,1.3594 -0.55859,1.9062 -0.83984,3.9141 -0.83984,5.9609 0,2.3789 0.39062,4.7227 1.1602,6.9609 0.28516,0.82812 1.0625,1.3516 1.8906,1.3516 0.21484,0 0.43359,-0.03516 0.64844,-0.10938 1.043,-0.35938 1.6016,-1.4961 1.2422,-2.543 -0.625,-1.8203 -0.94141,-3.7227 -0.94141,-5.6602 0,-1.668 0.22656,-3.2969 0.67969,-4.8398 0.30859,-1.0586 -0.30078,-2.168 -1.3594,-2.4805 z',
  'm 14.691615,48.83807 c 0.10156,0.33984 0.19922,0.67969 0.32812,1.0195 0.42969,1.3516 0.94922,2.6484 1.5781,3.9102 0.10156,-0.01172 0.21094,-0.01172 0.32031,-0.01953 l 0.16016,-0.01172 0.80078,-0.07031 c 0.37109,-0.03906 0.67188,-0.07031 0.98047,-0.10156 0.51172,-0.05859 1.0195,-0.12109 1.5586,-0.19922 l 0.21875,-0.03125 c 0.07031,-0.01172 0.14062,-0.01953 0.21094,-0.03125 -1.2188,-2.2109 -2.1484,-4.6016 -2.7305,-7.1211 -0.16016,-0.71094 -0.30078,-1.4297 -0.39844,-2.1602 -0.19922,-1.3086 -0.30078,-2.6602 -0.30078,-4.0312 0,-0.89844 0.03906,-1.7812 0.12891,-2.6484 0.07031,-0.71094 0.16016,-1.4102 0.28906,-2.1016 2.25,-12.949 13.57,-22.828 27.16,-22.828 6.0508,0 11.648,1.9609 16.211,5.3008 0.57031,0.41016 1.1289,0.85938 1.6719,1.3203 1.6914,1.4219 3.2109,3.0703 4.5,4.8789 0.42969,0.60156 0.83984,1.2109 1.2188,1.8398 1.3203,2.1602 2.3398,4.5117 3.0195,7 0.23828,-0.17188 0.42969,-0.30859 0.62891,-0.46875 0.64844,-0.48047 1.2109,-0.92188 1.7383,-1.3398 0.28125,-0.23047 0.5,-0.41016 0.71094,-0.57812 0.10156,-0.07813 0.19141,-0.16016 0.28125,-0.23828 -0.42969,-1.3516 -0.96094,-2.6484 -1.5898,-3.8984 -0.14062,-0.32812 -0.30859,-0.64844 -0.48047,-0.96875 -0.32812,-0.64844 -0.69922,-1.2891 -1.0898,-1.9102 -1.6797,-2.7109 -3.7695,-5.1406 -6.1719,-7.2188 -0.57031,-0.48828 -1.1484,-0.96875 -1.7617,-1.4102 -0.55859,-0.42188 -1.1406,-0.82812 -1.7305,-1.2109 -4.9414,-3.2188 -10.852,-5.0898 -17.16,-5.0898 -14.961,0 -27.531,10.469 -30.75,24.469 -0.17188,0.67969 -0.30859,1.3711 -0.42188,2.0703 -0.12891,0.73828 -0.21875,1.5 -0.28906,2.2617 -0.07813,0.91016 -0.12109,1.8398 -0.12109,2.7812 0,2.3008 0.25,4.5508 0.71875,6.7109 0.17188,0.71484 0.35156,1.4258 0.5625,2.125 z',
  'm 90.441615,21.60007 c -2.1797,-5.3398 -9.4102,-7.3984 -21,-6.0391 1.8906,1.8906 3.5391,3.9688 4.9297,6.2109 0.28906,0.46094 0.55859,0.92187 0.80859,1.3789 5.5391,-0.12109 7.6094,1.0391 7.8398,1.4492 0.12891,0.46875 -0.55078,2.7305 -4.5898,6.4805 -0.01953,0.01953 -0.03125,0.03125 -0.03906,0.03906 -0.26172,0.23828 -0.51953,0.48047 -0.80078,0.71875 -0.19922,0.17969 -0.41016,0.35938 -0.62891,0.53906 -0.10938,0.10156 -0.21875,0.19141 -0.33984,0.28906 -0.23828,0.19922 -0.5,0.41016 -0.76172,0.62109 -0.12891,0.10156 -0.26172,0.21094 -0.39844,0.32031 -0.42969,0.33984 -0.89063,0.69141 -1.3711,1.0508 -0.26953,0.21094 -0.53906,0.41016 -0.82812,0.60938 -0.32031,0.23047 -0.64062,0.46875 -0.98047,0.69922 0,0.01172 -0.01172,0.01172 -0.01172,0.01172 -0.26953,0.19141 -0.55078,0.37891 -0.82812,0.57031 -0.28125,0.19141 -0.55859,0.37109 -0.85156,0.55859 -0.25,0.16016 -0.5,0.32812 -0.76172,0.48828 -6,3.8984 -13.48,7.7188 -21.379,10.922 -8.0117,3.2383 -15.871,5.6602 -22.93,7.0391 -0.30078,0.05859 -0.60156,0.12109 -0.89062,0.17188 -0.60938,0.12109 -1.2188,0.21875 -1.8203,0.32031 -0.07031,0.01172 -0.12891,0.01953 -0.19922,0.03125 h -0.01953 c -0.28906,0.05078 -0.57031,0.08984 -0.83984,0.12891 -0.30859,0.05078 -0.60938,0.08984 -0.91016,0.12891 -0.57031,0.07813 -1.1094,0.14844 -1.6406,0.21094 -0.35156,0.03906 -0.69141,0.07031 -1.0195,0.10156 -0.30078,0.03125 -0.58984,0.05078 -0.87891,0.07813 -0.48047,0.03125 -0.92969,0.05859 -1.3711,0.07813 -0.39844,0.01953 -0.78125,0.03125 -1.1484,0.03906 -5.5116996,0.10938 -7.5702996,-1.0391 -7.8007996,-1.4492 -0.12891,-0.48047 0.55078,-2.7383 4.6093996,-6.5 -0.12891,-0.48828 -0.26172,-1 -0.37891,-1.5391 -0.51953,-2.4219 -0.78906,-4.8906 -0.78906,-7.3594 0,-0.17969 0,-0.37109 0.01172,-0.55078 -9.2733996,7.082 -13.0229996,13.59 -10.8749996,18.949 1.7383,4.2695 6.7188,6.4492 14.5899996,6.4492 2.8594,0 6.1016,-0.28906 9.7109,-0.87109 0.17188,-0.03125 0.33984,-0.05859 0.51953,-0.08984 0.17188,-0.03125 0.35156,-0.05859 0.51953,-0.08984 l 1.2188,-0.21875 c 0.57031,-0.10156 1.1484,-0.21875 1.7305,-0.33984 0.53125,-0.10938 1.0508,-0.21094 1.5781,-0.32812 0.01172,0 0.03125,-0.01172 0.03906,-0.01172 0.05078,-0.01172 0.08984,-0.01953 0.14062,-0.03125 0.07031,-0.01172 0.12891,-0.03125 0.19922,-0.05078 0.57812,-0.12891 1.1602,-0.26172 1.7383,-0.39844 0.05078,-0.01172 0.10156,-0.03125 0.14844,-0.03906 0.21094,-0.05078 0.42188,-0.10156 0.64062,-0.14844 h 0.01172 c 6.0898,-1.5117 12.559,-3.6406 19.102,-6.2891 6.5508,-2.6602 12.68,-5.6289 18.109,-8.7812 0.21875,-0.12891 0.44141,-0.26172 0.66016,-0.39062 0.58984,-0.33984 1.1797,-0.69141 1.7617,-1.0508 1.5703,-0.96094 3.0586,-1.9297 4.4805,-2.9102 0.12891,-0.08984 0.26172,-0.17969 0.39062,-0.26953 11.242,-7.8477 15.941,-15.09 13.594,-20.938 z',
];

/** Irregular blob of melted wax around the disc */
const SPLAT_PATH = 'M42 3 C50 2, 58 7, 64 13 C69 18, 76 24, 78 33 C80 41, 82 48, 77 56 C73 62, 66 70, 56 73 C48 76, 40 78, 32 74 C24 71, 14 66, 9 58 C5 50, 2 42, 4 34 C6 26, 12 18, 19 12 C26 6, 34 4, 42 3 Z';

/** 5-point star around (32, 32) */
const STAR_PATH = 'M32 10 L37.29 24.72 L52.92 25.2 L40.56 34.78 L44.93 49.8 L32 41 L19.07 49.8 L23.44 34.78 L11.08 25.2 L26.71 24.72 Z';

const FLOWER_PETALS: [number, number][] = [[32, 20], [43.41, 28.29], [39.05, 41.71], [24.95, 41.71], [20.59, 28.29]];

/** Treasures' favicon (251×271): a map pin over a chest. The raised parts; gaps between them read as pressed lines. */
const TREASURES_PIN = 'M125.45 18.09c-21.11 0-38.61 16.52-38.45 37.63.08 12.18 6.32 21.54 15.14 34s19.16 27.81 23.31 27.63c4.15.18 14.48-15.15 23.31-27.63s15.06-21.83 15.14-34c.16-21.11-17.34-37.59-38.45-37.63m.15 57.85a20.22 20.22 0 1 1 20.22-20.22 20.22 20.22 0 0 1-20.22 20.22';
const TREASURES_CHEST = [
  'M52.34 229.52H32.82l-3.97-58.2V171h20.48z',
  'M111.57 221.16a3.23 3.23 0 0 0 .78 2.56 3.26 3.26 0 0 0 2.44 1.1h21.75a3.26 3.26 0 0 0 2.44-1.1 3.23 3.23 0 0 0 .78-2.56l-1.78-14a18.74 18.74 0 0 0 5.11-7.43h51.1l-1.72 29.84H58.85l-1.54-29.84H108a18.55 18.55 0 0 0 5.35 7.65Z',
  'M194.56 193.18H144.3v-.11a18.77 18.77 0 0 0-37.54 0v.11H57L55.84 171h140Z',
  'M33.26 236h185.09v.45c-.32 6.12.24 16.12-11.29 16.12H44.58c-11.52 0-11-10-11.29-16.12Z',
  'M202.34 171h20.42v.32l-3.97 58.2h-19.82z',
  'M28.24 130.47A25.9 25.9 0 0 1 29.6 120c3.13-7.88 10.7-12.91 19.91-12.91h6.28c-5.76 10.89-5.86 20.66-6 32.47v2.11H28.4Z',
  'M121.82 123.56H57.19a41.6 41.6 0 0 1 6.11-16.45H106c7.17 9.77 11.6 14.74 15.82 16.45',
  'M194 123.56h-64.92c4.22-1.71 8.65-6.68 15.8-16.45H188a52.5 52.5 0 0 1 6 16.45',
  'M194.69 141.69H56.3v-2c0-3.4.06-6.56.23-9.59h138.25a97 97 0 0 1-.09 11.59',
  'M195.34 107.11h6.77c9.21 0 16.78 5 19.9 12.91a25.7 25.7 0 0 1 1.37 10.45l-.17 11.22h-22c.79-14.53-.74-24.1-5.87-34.58',
  'M22.71 148.19h205.88v16.31H22.71z',
];

/** Espy's eye: a disc of radius r around (50, 50), and the pupil cut from it */
const ESPY_DISC = (r: number) => `M50 ${50 - r} A${r} ${r} 0 1 0 50.01 ${50 - r}Z`;
const ESPY_HOLE = 'M50 40.5 A9.5 9.5 0 1 1 49.99 40.5Z';

/**
 * Icon shapes on a 64×64 canvas. `accent` is lighter fine detail (leaf veins,
 * flower centre); `deep` is shadow darker than the emblem (Espy's edges).
 */
function iconShape(icon: SealIcon, fill: string, accent: string, deep = fill): ReactNode {
  switch (icon) {
    case 'leaf':
      return (
        <g transform="translate(32, 32) scale(1.5) rotate(8) translate(-32, -16)">
          <path d="M32 29 C32 29, 14 16, 32 3 C50 16, 32 29, 32 29Z" fill={fill} />
          <path d="M32 5 L32 28" stroke={accent} strokeWidth="0.9" strokeLinecap="round" fill="none" />
          <path d="M32 12 L27.5 16.5 M32 12 L36.5 16.5" stroke={accent} strokeWidth="0.7" strokeLinecap="round" fill="none" opacity="0.7" />
          <path d="M32 20 L28.5 23.5 M32 20 L35.5 23.5" stroke={accent} strokeWidth="0.6" strokeLinecap="round" fill="none" opacity="0.5" />
        </g>
      );
    case 'heart':
      // Lowered so the heart's top-heavy mass sits on centre
      return <path d="M32 52 C14 40 8 30 8 22 C8 14 14 9 21 9 C26 9 30 12 32 16 C34 12 38 9 43 9 C50 9 56 14 56 22 C56 30 50 40 32 52Z" fill={fill} transform="translate(0 2.5)" />;
    case 'star':
      return <path d={STAR_PATH} fill={fill} strokeLinejoin="round" stroke={fill} strokeWidth="2" />;
    case 'moon':
      // Shifted left so the crescent's visual weight sits on centre
      return <path d="M40 9 C27 11 18 22 18 34 C18 47 29 56 41 56 C47 56 52 54 55 50 C41 51 30 41 30 29 C30 20 34 13 40 9Z" fill={fill} transform="translate(-3.5 -1.5)" />;
    case 'flower':
      return (
        <g fill={fill}>
          {FLOWER_PETALS.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="9" />)}
          <circle cx="32" cy="32" r="6" fill={accent} />
        </g>
      );
    case 'crown':
      return (
        <g fill={fill} stroke={fill} strokeWidth="2" strokeLinejoin="round">
          <path d="M12 44 L10 20 L22 31 L32 14 L42 31 L54 20 L52 44 Z" />
          <path d="M12 49 H52 V53 H12Z" />
        </g>
      );
    case 'sun':
      return (
        <g fill={fill} stroke={fill} strokeWidth="3.5" strokeLinecap="round">
          <circle cx="32" cy="32" r="10" stroke="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <path key={deg} d="M32 16 L32 9" transform={`rotate(${deg} 32 32)`} />
          ))}
        </g>
      );
    case 'treasures':
      return (
        <g fill={fill} transform="translate(32 30.5) scale(0.215) translate(-125.6 -135.3)">
          <path d={TREASURES_PIN} fillRule="evenodd" />
          {/* The lock is left as a gap in the chest, so it reads as pressed in */}
          {TREASURES_CHEST.map((d) => <path key={d} d={d} />)}
        </g>
      );
    case 'espy':
      // Espy's favicon (100×100) in wax, shaded like a real eye: the white
      // brightest, the ring and iris mid, and the pupil a hole pressed right
      // through to the bare wax, with a glint
      return (
        <g transform="translate(32 32) scale(0.52) translate(-50 -50)" fillRule="evenodd">
          <path fill={fill} d="M50 5 A45 45 0 1 0 50.01 5Z M50 17 A33 33 0 1 1 49.99 17Z" />
          {/* A faint edge under each raised part */}
          <path fill={deep} opacity="0.35" transform="translate(1.4 1.8)" d={`${ESPY_DISC(33)} ${ESPY_HOLE}`} />
          <path fill={accent} d={`${ESPY_DISC(33)} ${ESPY_HOLE}`} />
          <path fill={deep} opacity="0.3" transform="translate(1.4 1.8)" d={`${ESPY_DISC(19)} ${ESPY_HOLE}`} />
          <path fill={fill} d={`${ESPY_DISC(19)} ${ESPY_HOLE}`} />
          {/* The hole's wall: in shadow at the top-left, catching light at the bottom-right */}
          <circle cx="50" cy="50" r="8.6" fill="none" stroke={deep} strokeWidth="1.8" opacity="0.7" strokeDasharray={`${Math.PI * 8.6} 100`} transform="rotate(135 50 50)" />
          <circle cx="50" cy="50" r="8.9" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.35" strokeDasharray={`${Math.PI * 8.9} 100`} transform="rotate(-45 50 50)" />
          <circle cx="45" cy="45" r="3.5" fill={accent} />
        </g>
      );
    case 'ditto':
      return (
        <g fill={fill} transform="translate(32 32) scale(0.6) translate(-45.5 -40)">
          {DITTO_LOGO_PATHS.map((d) => <path key={d} d={d} />)}
        </g>
      );
    case 'surveil':
      // The eye from Surveil's favicon (lucide eye, 24×24)
      return (
        <g
          transform="translate(32 32) scale(2.1) translate(-12 -12)"
          fill="none" stroke={fill} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" fill={fill} />
        </g>
      );
    case 'nostrdamus':
      // Lucide's moon-star (24×24)
      return (
        <g
          transform="translate(32 32) scale(2.05) translate(-12.5 -12)"
          fill="none" stroke={fill} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9" />
          <path d="M20 3v4" />
          <path d="M22 5h-4" />
        </g>
      );
  }
}

const INITIALS_FONT = '"Playfair Display Variable", "Playfair Display", serif';

/**
 * Vertical offset that puts the ink of `text` (not its em box) on centre, in
 * units of the font size. Measured on a canvas once the font has loaded, so
 * capitals, lowercase and descenders all sit right.
 */
const inkCentreCache = new Map<string, number>();

function measureInkCentre(text: string): number | undefined {
  const cached = inkCentreCache.get(text);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined' || !document.fonts?.check(`700 100px ${INITIALS_FONT}`)) return undefined;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return undefined;
  ctx.font = `700 100px ${INITIALS_FONT}`;
  const m = ctx.measureText(text);
  if (!m.actualBoundingBoxAscent) return undefined;
  // Baseline sits half the ink height below centre, adjusted for any descent
  const offset = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 / 100;
  inkCentreCache.set(text, offset);
  return offset;
}

function useInkCentre(text: string, enabled: boolean): number {
  const [, setLoaded] = useState(0);
  const offset = enabled ? measureInkCentre(text) : undefined;
  useEffect(() => {
    if (!enabled || offset !== undefined || !document.fonts) return;
    let cancelled = false;
    // The face is bundled lazily: register it before asking for it
    loadBundledFont('Playfair Display').then(() => document.fonts.load(`700 100px ${INITIALS_FONT}`, text)).then(() => {
      if (!cancelled) setLoaded((n) => n + 1);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, offset, text]);
  // Playfair's cap height until the font is ready
  return offset ?? 0.354;
}

// ---------------------------------------------------------------------------
// Emoji stamps
// ---------------------------------------------------------------------------

/** Resolution the emoji stamps are drawn at; scaled down per seal. */
const STAMP_RES = 128;

/** Keep the most recent `max` entries of a cache. */
function remember<V>(cache: Map<string, V>, key: string, value: V, max: number) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) cache.delete(cache.keys().next().value!);
}

function makeCanvas(n = STAMP_RES) {
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  return c;
}

/**
 * An emoji reduced to what a stamp can carry, like the drawn icons: its
 * silhouette, its features and colour seams to cut back into the wax, its
 * brightest highlights, and the light and shade of its bevelled rim. Scaled so its ink fills
 * the same box whatever the emoji's shape. Null where canvas isn't available.
 */
interface EmojiMasks { shape: HTMLCanvasElement; dark: HTMLCanvasElement; light: HTMLCanvasElement }

const emojiMaskCache = new Map<string, EmojiMasks | null>();

function emojiMasks(emoji: string) {
  if (emojiMaskCache.has(emoji)) return emojiMaskCache.get(emoji)!;
  let result: EmojiMasks | null = null;
  try {
    const n = STAMP_RES;
    const shape = makeCanvas();
    const ctx = shape.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const font = emojiCanvasFont;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let fontPx = n * 0.7;
      ctx.font = font(fontPx);
      ctx.fillText(emoji, n / 2, n / 2);

      // Glyphs differ in size and position per font; redraw fitted to the ink itself
      let img = ctx.getImageData(0, 0, n, n);
      let x0 = n, y0 = n, x1 = -1, y1 = -1;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (img.data[(y * n + x) * 4 + 3] > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 >= 0) {
        const scale = (n * 0.9) / Math.max(x1 - x0 + 1, y1 - y0 + 1);
        const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
        fontPx *= scale;
        ctx.clearRect(0, 0, n, n);
        ctx.font = font(fontPx);
        ctx.fillText(emoji, n / 2 + (n / 2 - cx) * scale, n / 2 + (n / 2 - cy) * scale);
        img = ctx.getImageData(0, 0, n, n);
      }

      // Pressed into wax, an emoji reads like a line drawing: its dark
      // features (eyes, mouths) cut back into the wax, thin lines where its
      // colours meet (emoji fonts draw hair, cheeks and the like as patches of
      // colour, not outlines), its brightest highlights picked out, and a
      // bevelled rim around the whole, lit from the top left, so even a
      // plain heart stands up off the disc
      const px = img.data;
      let lo = 1, hi = 0;
      const lum = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) {
        const l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
        lum[i] = l;
        if (px[i * 4 + 3] > 128) { if (l < lo) lo = l; if (l > hi) hi = l; }
      }
      const range = Math.max(0.15, hi - lo);
      const smooth = (e0: number, e1: number, x: number) => {
        const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
      };
      const seam = (i: number, j: number) => {
        if (px[i * 4 + 3] < 128 || px[j * 4 + 3] < 128) return 0;
        const dr = px[i * 4] - px[j * 4], dg = px[i * 4 + 1] - px[j * 4 + 1], db = px[i * 4 + 2] - px[j * 4 + 2];
        return smooth(45, 120, Math.sqrt(dr * dr + dg * dg + db * db));
      };
      const dark = ctx.createImageData(n, n);
      const light = ctx.createImageData(n, n);
      let ink = 0, darkInk = 0, lightInk = 0;
      for (let i = 0; i < n * n; i++) {
        const a = px[i * 4 + 3];
        const t = (lum[i] - lo) / range;
        dark.data[i * 4 + 3] = Math.round(a * smooth(0.42, 0.22, t));
        light.data[i * 4 + 3] = Math.round(a * smooth(0.82, 0.97, t));
        ink += a;
        darkInk += dark.data[i * 4 + 3];
        lightInk += light.data[i * 4 + 3];
      }
      // A mostly single-colour emoji (❤️) has no features to cut, only its body
      if (darkInk > ink * 0.4) dark.data.fill(0);
      if (lightInk > ink * 0.4) light.data.fill(0);

      const boxBlur = (src: Float32Array, r: number) => {
        const out = new Float32Array(n * n);
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            let sum = 0, c = 0;
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                const xx = x + dx, yy = y + dy;
                if (xx >= 0 && xx < n && yy >= 0 && yy < n) { sum += src[yy * n + xx]; c++; }
              }
            }
            out[y * n + x] = sum / c;
          }
        }
        return out;
      };
      const alpha = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) alpha[i] = px[i * 4 + 3] / 255;

      // Where colours meet, widened: a one-pixel seam here is a fraction of a
      // pixel once the stamp is shrunk onto a seal, and comes out as a broken,
      // jaggy hairline. Thickened rather than blurred, so it stays crisp
      const seams = new Float32Array(n * n);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          seams[i] = Math.max(
            x > 0 ? seam(i, i - 1) : 0, x + 1 < n ? seam(i, i + 1) : 0,
            y > 0 ? seam(i, i - n) : 0, y + 1 < n ? seam(i, i + n) : 0,
          );
        }
      }
      const lines = new Float32Array(n * n);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          let m = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx, yy = y + dy;
              if (xx >= 0 && xx < n && yy >= 0 && yy < n && seams[yy * n + xx] > m) m = seams[yy * n + xx];
            }
          }
          lines[y * n + x] = m;
        }
      }

      // The rim: the silhouette softened into a slope, shaded by which way it faces
      const blurred = boxBlur(alpha, 2);
      const at = (x: number, y: number) => blurred[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          const a = px[i * 4 + 3];
          // Rising toward the bottom right means facing the top-left light
          const slope = (at(x + 1, y) - at(x - 1, y) + at(x, y + 1) - at(x, y - 1)) * 1.5;
          const shade = Math.max(lines[i] * 0.85, Math.min(1, Math.max(0, -slope)));
          dark.data[i * 4 + 3] = Math.max(dark.data[i * 4 + 3], Math.round(a * shade));
          light.data[i * 4 + 3] = Math.max(light.data[i * 4 + 3], Math.round(a * Math.min(1, Math.max(0, slope)) * 0.8));
        }
      }
      const darkCanvas = makeCanvas();
      darkCanvas.getContext('2d')!.putImageData(dark, 0, 0);
      const lightCanvas = makeCanvas();
      lightCanvas.getContext('2d')!.putImageData(light, 0, 0);
      result = { shape, dark: darkCanvas, light: lightCanvas };
    }
  } catch {
    result = null;
  }
  remember(emojiMaskCache, emoji, result, 400);
  return result;
}

/** The finished impression of an emoji in a given wax, ready to draw. */
const stampCache = new Map<string, HTMLCanvasElement | null>();

function drawEmojiStamp(emoji: string, color: string): HTMLCanvasElement | null {
  const masks = emojiMasks(emoji);
  if (!masks) return null;
  const n = STAMP_RES;
  const out = makeCanvas();
  const ctx = out.getContext('2d')!;
  const scratch = makeCanvas();
  const sctx = scratch.getContext('2d')!;

  const layer = (mask: HTMLCanvasElement, fill: string | CanvasGradient, alpha: number, dx = 0, dy = 0) => {
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, n, n);
    sctx.drawImage(mask, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = fill;
    sctx.fillRect(0, 0, n, n);
    ctx.globalAlpha = alpha;
    ctx.drawImage(scratch, dx, dy);
  };

  // Same treatment as the drawn icons: a dark copy offset down-right for the
  // edge of the impression, the flat raised emblem, then its detail
  const unit = n / (64 * 0.66); // one icon-canvas unit, in stamp pixels
  layer(masks.shape, mixHex(color, '#000000', 0.4), 0.55, unit * 0.8, unit);
  layer(masks.shape, mixHex(color, '#ffffff', 0.35), 1);
  layer(masks.dark, mixHex(color, '#000000', 0.18), 1);
  layer(masks.light, mixHex(color, '#ffffff', 0.55), 0.8);
  return out;
}

/**
 * Stamps are drawn a few at a time between frames, so opening a grid of
 * emoji seals doesn't stall the page; each seal fills in as its stamp is ready.
 */
const stampWaiters = new Map<string, Set<() => void>>();
let pumping = false;

function pumpStamps() {
  const start = performance.now();
  for (const [key, waiters] of stampWaiters) {
    if (performance.now() - start > 8) break;
    stampWaiters.delete(key);
    if (waiters.size === 0) continue;
    const sep = key.indexOf('|');
    remember(stampCache, key, drawEmojiStamp(key.slice(sep + 1), key.slice(0, sep)), 300);
    waiters.forEach((done) => done());
  }
  if (stampWaiters.size > 0) setTimeout(pumpStamps, 0);
  else pumping = false;
}

function useEmojiStamp(emoji: string | undefined, color: string) {
  const key = emoji ? `${color.toLowerCase()}|${emoji}` : '';
  const [, setReady] = useState(0);
  const ready = !!key && stampCache.has(key);

  useEffect(() => {
    if (!key || ready) return;
    const done = () => setReady((n) => n + 1);
    const waiters = stampWaiters.get(key) ?? new Set();
    waiters.add(done);
    stampWaiters.set(key, waiters);
    if (!pumping) { pumping = true; setTimeout(pumpStamps, 0); }
    return () => { waiters.delete(done); };
  }, [key, ready]);

  return { ready, stamp: ready ? stampCache.get(key) ?? null : null };
}

/** Paints a cached stamp at the seal's pixel size. */
function StampCanvas({ stamp, box, fade }: { stamp: HTMLCanvasElement; box: number; fade: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window === 'undefined' ? 1 : Math.min(3, window.devicePixelRatio || 1);
  const px = Math.max(1, Math.ceil(box * dpr));
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, px, px);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(stamp, 0, 0, px, px);
  }, [stamp, px]);
  return <canvas ref={ref} width={px} height={px} className={`absolute inset-0 w-full h-full${fade ? ' animate-in fade-in duration-300' : ''}`} />;
}

/** Emblem scaled to fit the pressed area (the leaf has its own scale for back-compat). */
function iconTransform(icon: SealIcon) {
  return icon === 'leaf' ? undefined : 'translate(32 32) scale(0.78) translate(-32 -32)';
}

interface WaxSealProps {
  seal?: WaxSealData;
  /** Diameter in px */
  size: number;
  /** Melted-wax blob behind the disc. 0 hides it; 0–1 grows it in (used at stamp impact). */
  splat?: number;
  /** Outer drop shadow — the send animation lifts it while the seal falls. */
  dropShadow?: { y: number; blur: number };
  className?: string;
  style?: CSSProperties;
}

export function WaxSeal({ seal = defaultSeal(), size, splat = 0, dropShadow = { y: 2, blur: 4 }, className, style }: WaxSealProps) {
  const splatId = useId();
  const { color, emblem } = seal;

  const highlight = mixHex(color, '#ffffff', 0.08);
  const edge = mixHex(color, '#000000', 0.1);
  const rim = mixHex(color, '#000000', 0.15);
  const raised = mixHex(color, '#ffffff', 0.35);
  const detail = mixHex(color, '#ffffff', 0.55);
  const pressed = mixHex(color, '#000000', 0.4);

  const splatSize = Math.round(size * 1.3);
  const inset = Math.max(1, size * 0.025);
  const { ready: stampReady, stamp } = useEmojiStamp(emblem.type === 'emoji' ? emblem.value : undefined, color);
  // Only fade the emblem in if it wasn't ready when the seal appeared
  const stampWasReady = useRef(stampReady);
  const emojiBox = size * 0.66;
  const inkCentre = useInkCentre(emblem.value, emblem.type === 'initials');
  const initialsSize = emblem.type === 'initials'
    ? [...emblem.value].length === 1 ? 30 : [...emblem.value].length === 2 ? 22 : 16
    : 0;

  return (
    <div className={className} style={{ position: 'relative', width: size, height: size, isolation: 'isolate', ...style }}>
      {splat > 0 && (
        <svg
          className="absolute"
          width={splatSize} height={splatSize}
          viewBox="0 0 84 84"
          style={{
            left: -(splatSize - size) / 2,
            top: -(splatSize - size) / 2,
            transform: `scale(${0.88 + Math.min(1, splat) * 0.12})`,
          }}
          aria-hidden
        >
          <defs>
            <radialGradient id={splatId}>
              <stop offset="0%" stopColor={highlight} />
              <stop offset="50%" stopColor={color} />
              <stop offset="85%" stopColor={edge} />
              <stop offset="100%" stopColor={mixHex(color, '#000000', 0.2)} stopOpacity="0.6" />
            </radialGradient>
          </defs>
          <path d={SPLAT_PATH} fill={`url(#${splatId})`} />
          <path d={SPLAT_PATH} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        </svg>
      )}

      {/* Disc */}
      <div
        className="absolute rounded-full"
        style={{
          inset,
          background: `
            radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.2) 0%, transparent 50%),
            radial-gradient(ellipse at 65% 70%, rgba(0,0,0,0.12) 0%, transparent 50%),
            radial-gradient(circle at 20% 55%, rgba(255,255,255,0.08) 0%, transparent 25%),
            radial-gradient(circle at 78% 30%, rgba(0,0,0,0.06) 0%, transparent 25%),
            radial-gradient(circle at 50% 50%, ${highlight} 0%, ${color} 55%, ${edge} 100%)
          `,
          boxShadow: `
            0 ${dropShadow.y}px ${dropShadow.blur}px rgba(0,0,0,0.25),
            0 1px 3px rgba(0,0,0,0.12),
            inset 0 1.5px 2px rgba(255,255,255,0.2),
            inset 0 -1.5px 2px rgba(0,0,0,0.15)
          `,
          border: `${inset}px solid ${rim}`,
        }}
      />

      {/* Emblem — a dark copy offset down-right reads as the edge of the impression */}
      {emblem.type === 'emoji' && !stampReady ? null : emblem.type === 'emoji' && stamp ? (
        <div className="absolute" style={{ left: (size - emojiBox) / 2, top: (size - emojiBox) / 2, width: emojiBox, height: emojiBox }} aria-hidden>
          <StampCanvas stamp={stamp} box={emojiBox} fade={!stampWasReady.current} />
        </div>
      ) : emblem.type === 'emoji' ? (
        <span
          className="absolute inset-0 flex items-center justify-center leading-none select-none"
          style={{
            fontSize: size * 0.46,
            // Takes the wax's hue and keeps only the emoji's light and shade
            mixBlendMode: 'luminosity',
            filter: `brightness(1.15) drop-shadow(${size * 0.012}px ${size * 0.02}px 0 rgba(0,0,0,0.45))`,
          }}
          aria-hidden
        >
          {emblem.value}
        </span>
      ) : (
        <svg width={size} height={size} viewBox="0 0 64 64" className="absolute inset-0" aria-hidden>
          {emblem.type === 'initials' ? (
            <>
              <circle cx="32" cy="32" r="23" fill="none" stroke={pressed} strokeWidth="1.2" opacity="0.5" transform="translate(0.6 0.8)" />
              <circle cx="32" cy="32" r="23" fill="none" stroke={raised} strokeWidth="1.2" opacity="0.7" />
              {[pressed, raised].map((fill, i) => (
                <text
                  key={fill}
                  // Centred on the letters' ink; dominant-baseline "central" centres
                  // the em box, which sits high for this face
                  x="32" y={32 + initialsSize * inkCentre}
                  textAnchor="middle"
                  fill={fill}
                  opacity={i === 0 ? 0.6 : 1}
                  transform={i === 0 ? 'translate(0.8 1)' : undefined}
                  style={{
                    fontFamily: INITIALS_FONT,
                    fontWeight: 700,
                    fontSize: initialsSize,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {emblem.value}
                </text>
              ))}
            </>
          ) : (
            <g transform={iconTransform(emblem.value)}>
              <g transform="translate(0.8 1)" opacity="0.55">{iconShape(emblem.value, pressed, pressed)}</g>
              {iconShape(emblem.value, raised, detail, mixHex(color, '#000000', 0.15))}
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
