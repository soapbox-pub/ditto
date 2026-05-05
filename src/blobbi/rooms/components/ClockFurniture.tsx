/**
 * ClockFurniture — Dynamic real-time clock renderer for furniture items.
 *
 * Renders analog (rotating hands) or digital (HH:mm) clock faces that update
 * once per minute using a single shared timer via useSyncExternalStore.
 *
 * Used inside RoomFurnitureLayer when a FurnitureDefinition has `isClock: true`.
 */

import { useSyncExternalStore } from 'react';

import { cn } from '@/lib/utils';

import type { ClockStyle } from '../lib/furniture-registry';

// ─── Shared Minute Ticker ─────────────────────────────────────────────────────
// One module-level timer shared by all mounted clock components.
// Auto-starts when first clock subscribes, auto-stops when last unmounts.

const listeners = new Set<() => void>();
let currentMinute = Math.floor(Date.now() / 60_000);
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      const m = Math.floor(Date.now() / 60_000);
      if (m !== currentMinute) {
        currentMinute = m;
        listeners.forEach((l) => l());
      }
    }, 1_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  return currentMinute;
}

/** Returns the current Date, re-rendering only when the minute changes. */
function useMinuteClock(): Date {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return new Date();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ClockFurnitureProps {
  clockKind: 'analog' | 'digital';
  clockStyle: ClockStyle;
  isSelected: boolean;
  isDragging: boolean;
  isHolding: boolean;
}

export function ClockFurniture({
  clockKind,
  clockStyle,
  isSelected,
  isDragging,
  isHolding,
}: ClockFurnitureProps) {
  const now = useMinuteClock();

  return (
    <div
      className={cn(
        'w-full h-full',
        isSelected && 'ring-2 ring-primary ring-offset-1 rounded-sm',
        isDragging && 'opacity-80 scale-105 transition-transform duration-100',
        isHolding && 'scale-[1.02] transition-transform duration-100',
      )}
    >
      {clockKind === 'digital' ? (
        <DigitalClockFace now={now} style={clockStyle} />
      ) : (
        <AnalogClockFace now={now} style={clockStyle} />
      )}
    </div>
  );
}

// ─── Analog Clock Face ────────────────────────────────────────────────────────

interface AnalogFaceProps {
  now: Date;
  style: ClockStyle;
}

/** Style config for analog clock rendering */
interface AnalogTheme {
  faceFill: string;
  rimStroke: string;
  rimWidth: number;
  hourHandColor: string;
  minuteHandColor: string;
  hourHandWidth: number;
  minuteHandWidth: number;
  hourHandLength: number;
  minuteHandLength: number;
  markerColor: string;
  centerDotColor: string;
  centerDotRadius: number;
  /** Extra SVG elements rendered before hands (decorations, markers) */
  extras?: (props: { hours: number; minutes: number }) => React.ReactNode;
  /** Outer SVG elements rendered outside the face circle (e.g. alarm bells, legs) */
  outer?: () => React.ReactNode;
  /** viewBox override (default "0 0 100 100") */
  viewBox?: string;
}

const ANALOG_THEMES: Record<string, AnalogTheme> = {
  classic: {
    faceFill: '#f8f4ee',
    rimStroke: '#706050',
    rimWidth: 4,
    hourHandColor: '#333',
    minuteHandColor: '#333',
    hourHandWidth: 3,
    minuteHandWidth: 2,
    hourHandLength: 22,
    minuteHandLength: 30,
    markerColor: '#706050',
    centerDotColor: '#333',
    centerDotRadius: 3,
    extras: () => (
      <>
        {/* 4 hour markers at 12, 3, 6, 9 */}
        <rect x="48" y="10" width="4" height="10" fill="#706050" />
        <rect x="48" y="80" width="4" height="10" fill="#706050" />
        <rect x="80" y="48" width="10" height="4" fill="#706050" />
        <rect x="10" y="48" width="10" height="4" fill="#706050" />
      </>
    ),
  },
  modern: {
    faceFill: '#ffffff',
    rimStroke: '#b0b0b0',
    rimWidth: 2,
    hourHandColor: '#222',
    minuteHandColor: '#222',
    hourHandWidth: 2.5,
    minuteHandWidth: 1.5,
    hourHandLength: 20,
    minuteHandLength: 32,
    markerColor: '#999',
    centerDotColor: '#222',
    centerDotRadius: 2.5,
    extras: () => (
      <>
        {/* Minimal tick marks */}
        <rect x="49" y="8" width="2" height="6" fill="#999" />
        <rect x="49" y="86" width="2" height="6" fill="#999" />
        <rect x="86" y="49" width="6" height="2" fill="#999" />
        <rect x="8" y="49" width="6" height="2" fill="#999" />
      </>
    ),
  },
  cute: {
    faceFill: '#fff0f5',
    rimStroke: '#f0a0c0',
    rimWidth: 4,
    hourHandColor: '#d06090',
    minuteHandColor: '#d06090',
    hourHandWidth: 4,
    minuteHandWidth: 3,
    hourHandLength: 20,
    minuteHandLength: 28,
    markerColor: '#f0a0c0',
    centerDotColor: '#d06090',
    centerDotRadius: 4,
    extras: () => (
      <>
        {/* Cute dot markers */}
        <circle cx="50" cy="14" r="3" fill="#f0a0c0" />
        <circle cx="50" cy="86" r="3" fill="#f0a0c0" />
        <circle cx="86" cy="50" r="3" fill="#f0a0c0" />
        <circle cx="14" cy="50" r="3" fill="#f0a0c0" />
        {/* Cat ears */}
        <polygon points="22,12 30,2 38,12" fill="#f0a0c0" />
        <polygon points="62,12 70,2 78,12" fill="#f0a0c0" />
      </>
    ),
  },
  'analog-table': {
    faceFill: '#f5f0e8',
    rimStroke: '#8b7355',
    rimWidth: 3,
    hourHandColor: '#4a3728',
    minuteHandColor: '#4a3728',
    hourHandWidth: 2.5,
    minuteHandWidth: 1.8,
    hourHandLength: 18,
    minuteHandLength: 26,
    markerColor: '#8b7355',
    centerDotColor: '#4a3728',
    centerDotRadius: 2.5,
    viewBox: '0 0 100 110',
    extras: () => (
      <>
        {/* Small hour markers */}
        <rect x="49" y="14" width="2" height="5" fill="#8b7355" />
        <rect x="49" y="81" width="2" height="5" fill="#8b7355" />
        <rect x="81" y="49" width="5" height="2" fill="#8b7355" />
        <rect x="14" y="49" width="5" height="2" fill="#8b7355" />
      </>
    ),
    outer: () => (
      <>
        {/* Table legs / stand */}
        <rect x="30" y="95" width="6" height="15" rx="2" fill="#8b7355" />
        <rect x="64" y="95" width="6" height="15" rx="2" fill="#8b7355" />
        <rect x="25" y="108" width="50" height="4" rx="2" fill="#6b5335" />
      </>
    ),
  },
  'cute-alarm': {
    faceFill: '#ffe8ec',
    rimStroke: '#ff6b8a',
    rimWidth: 3,
    hourHandColor: '#cc3355',
    minuteHandColor: '#cc3355',
    hourHandWidth: 3,
    minuteHandWidth: 2.5,
    hourHandLength: 18,
    minuteHandLength: 26,
    markerColor: '#ff6b8a',
    centerDotColor: '#cc3355',
    centerDotRadius: 3,
    viewBox: '0 0 100 115',
    extras: () => (
      <>
        {/* Dot markers */}
        <circle cx="50" cy="16" r="2.5" fill="#ff6b8a" />
        <circle cx="50" cy="84" r="2.5" fill="#ff6b8a" />
        <circle cx="84" cy="50" r="2.5" fill="#ff6b8a" />
        <circle cx="16" cy="50" r="2.5" fill="#ff6b8a" />
      </>
    ),
    outer: () => (
      <>
        {/* Alarm bells */}
        <circle cx="25" cy="12" r="10" fill="#ff8fa8" />
        <circle cx="75" cy="12" r="10" fill="#ff8fa8" />
        {/* Bell connector */}
        <rect x="45" y="2" width="10" height="5" rx="2.5" fill="#cc3355" />
        {/* Feet */}
        <rect x="32" y="98" width="5" height="12" rx="2" fill="#ff6b8a" transform="rotate(-10 34.5 104)" />
        <rect x="63" y="98" width="5" height="12" rx="2" fill="#ff6b8a" transform="rotate(10 65.5 104)" />
      </>
    ),
  },
};

function AnalogClockFace({ now, style }: AnalogFaceProps) {
  const theme = ANALOG_THEMES[style] ?? ANALOG_THEMES.classic;
  const hours = now.getHours();
  const minutes = now.getMinutes();

  const hourAngle = (hours % 12) * 30 + minutes * 0.5;
  const minuteAngle = minutes * 6;

  const viewBox = theme.viewBox ?? '0 0 100 100';

  return (
    <svg viewBox={viewBox} className="w-full h-full" aria-label="Clock">
      {/* Outer decorations (bells, legs) — rendered behind face */}
      {theme.outer?.()}
      {/* Face */}
      <circle cx="50" cy="50" r="45" fill={theme.faceFill} stroke={theme.rimStroke} strokeWidth={theme.rimWidth} />
      {/* Markers / decorations */}
      {theme.extras?.({ hours, minutes })}
      {/* Hour hand */}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2={50 - theme.hourHandLength}
        stroke={theme.hourHandColor}
        strokeWidth={theme.hourHandWidth}
        strokeLinecap="round"
        transform={`rotate(${hourAngle} 50 50)`}
      />
      {/* Minute hand */}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2={50 - theme.minuteHandLength}
        stroke={theme.minuteHandColor}
        strokeWidth={theme.minuteHandWidth}
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} 50 50)`}
      />
      {/* Center dot */}
      <circle cx="50" cy="50" r={theme.centerDotRadius} fill={theme.centerDotColor} />
    </svg>
  );
}

// ─── Digital Clock Face ───────────────────────────────────────────────────────

interface DigitalFaceProps {
  now: Date;
  style: ClockStyle;
}

/** Visual theme for digital clock styles */
interface DigitalTheme {
  viewBox: string;
  caseFill: string;
  caseStroke: string;
  caseStrokeWidth: number;
  caseRadius: number;
  screenFill: string;
  textFill: string;
  fontSize: number;
  fontFamily: string;
  ledColor?: string;
  /** Extra SVG elements (decorations, dividers) */
  extras?: (hours: string, minutes: string) => React.ReactNode;
}

const DIGITAL_THEMES: Record<string, DigitalTheme> = {
  'digital-bedside': {
    viewBox: '0 0 120 60',
    caseFill: '#1a1a2e',
    caseStroke: '#333355',
    caseStrokeWidth: 2,
    caseRadius: 6,
    screenFill: '#0a0a18',
    textFill: '#44ff88',
    fontSize: 22,
    fontFamily: 'monospace',
    ledColor: '#44ff88',
  },
  'digital-wall': {
    viewBox: '0 0 132 60',
    caseFill: '#2c2c2c',
    caseStroke: '#555555',
    caseStrokeWidth: 2,
    caseRadius: 4,
    screenFill: '#111111',
    textFill: '#ff3333',
    fontSize: 26,
    fontFamily: 'monospace',
    ledColor: '#ff3333',
  },
  'flip-wall': {
    viewBox: '0 0 120 60',
    caseFill: '#1a1a1a',
    caseStroke: '#444444',
    caseStrokeWidth: 2,
    caseRadius: 3,
    screenFill: '#0d0d0d',
    textFill: '#f0f0f0',
    fontSize: 24,
    fontFamily: 'monospace',
    extras: (hours, minutes) => (
      <>
        {/* Flip divider line */}
        <line x1="10" y1="30" x2="110" y2="30" stroke="#333" strokeWidth="1.5" />
        {/* Split panels for flip effect */}
        <rect x="14" y="14" width="40" height="32" rx="2" fill="#1a1a1a" />
        <rect x="66" y="14" width="40" height="32" rx="2" fill="#1a1a1a" />
        {/* Digits on panels */}
        <text x="34" y="35" textAnchor="middle" dominantBaseline="middle" fill="#f0f0f0" fontSize="22" fontFamily="monospace" fontWeight="bold">{hours}</text>
        <text x="86" y="35" textAnchor="middle" dominantBaseline="middle" fill="#f0f0f0" fontSize="22" fontFamily="monospace" fontWeight="bold">{minutes}</text>
        {/* Colon between panels */}
        <circle cx="60" cy="24" r="2.5" fill="#f0f0f0" />
        <circle cx="60" cy="36" r="2.5" fill="#f0f0f0" />
      </>
    ),
  },
  'digital-table': {
    viewBox: '0 0 120 60',
    caseFill: '#f5f0e8',
    caseStroke: '#c0b090',
    caseStrokeWidth: 2,
    caseRadius: 8,
    screenFill: '#2a2a3a',
    textFill: '#66ccff',
    fontSize: 20,
    fontFamily: 'monospace',
    ledColor: '#66ccff',
  },
};

function DigitalClockFace({ now, style }: DigitalFaceProps) {
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const theme = DIGITAL_THEMES[style] ?? DIGITAL_THEMES['digital-bedside'];

  // Derive geometry from viewBox width for proper centering
  const vbWidth = Number(theme.viewBox.split(' ')[2]) || 120;
  const caseX = 4;
  const caseWidth = vbWidth - 8;
  const screenX = 12;
  const screenWidth = vbWidth - 24;
  const centerX = vbWidth / 2;

  // Flip-wall style has custom rendering via extras
  if (theme.extras) {
    return (
      <svg viewBox={theme.viewBox} className="w-full h-full" aria-label="Digital clock">
        <rect x={caseX} y="4" width={caseWidth} height="52" rx={theme.caseRadius} fill={theme.caseFill} stroke={theme.caseStroke} strokeWidth={theme.caseStrokeWidth} />
        <rect x={screenX} y="10" width={screenWidth} height="40" rx="2" fill={theme.screenFill} />
        {theme.extras(hours, minutes)}
      </svg>
    );
  }

  return (
    <svg viewBox={theme.viewBox} className="w-full h-full" aria-label="Digital clock">
      {/* Case body */}
      <rect x={caseX} y="8" width={caseWidth} height="44" rx={theme.caseRadius} fill={theme.caseFill} stroke={theme.caseStroke} strokeWidth={theme.caseStrokeWidth} />
      {/* Screen area */}
      <rect x={screenX} y="14" width={screenWidth} height="32" rx="3" fill={theme.screenFill} />
      {/* Time display */}
      <text
        x={centerX}
        y="38"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={theme.textFill}
        fontSize={theme.fontSize}
        fontFamily={theme.fontFamily}
        fontWeight="bold"
      >
        {hours}:{minutes}
      </text>
      {/* Small LED indicator */}
      {theme.ledColor && (
        <circle cx={screenX + screenWidth - 8} cy="20" r="2" fill={theme.ledColor} opacity="0.6" />
      )}
    </svg>
  );
}
