import * as React from 'react';
import { Pencil } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  /** Current color in hex format (#RRGGBB) */
  value: string;
  /** Called with new hex color */
  onChange: (hex: string) => void;
  /** Optional label */
  label?: string;
  /** Optional className for the trigger */
  className?: string;
  /** Disable the picker */
  disabled?: boolean;
}

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Color picker with a swatch trigger and popover containing a gradient area,
 * hue slider, and hex input.
 */
export function ColorPicker({ value, onChange, label, className, disabled }: ColorPickerProps) {
  const [localHex, setLocalHex] = React.useState(value);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const hueRef = React.useRef<HTMLCanvasElement>(null);
  const [hue, setHue] = React.useState(() => hexToHue(value));
  const [isDraggingSL, setIsDraggingSL] = React.useState(false);
  const [isDraggingHue, setIsDraggingHue] = React.useState(false);
  const [popoverOpen, setPopoverOpen] = React.useState(false);

  // Sync external value changes
  React.useEffect(() => {
    setLocalHex(value);
    setHue(hexToHue(value));
  }, [value]);

  // Draw the saturation/lightness gradient.
  // Uses requestAnimationFrame to ensure the canvas is in the DOM after popover opens.
  React.useEffect(() => {
    if (!popoverOpen) return;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // White to hue (horizontal)
      const gradH = ctx.createLinearGradient(0, 0, w, 0);
      gradH.addColorStop(0, '#ffffff');
      gradH.addColorStop(1, `hsl(${hue}, 100%, 50%)`);
      ctx.fillStyle = gradH;
      ctx.fillRect(0, 0, w, h);

      // Transparent to black (vertical)
      const gradV = ctx.createLinearGradient(0, 0, 0, h);
      gradV.addColorStop(0, 'rgba(0,0,0,0)');
      gradV.addColorStop(1, '#000000');
      ctx.fillStyle = gradV;
      ctx.fillRect(0, 0, w, h);
    };

    // Defer drawing to next frame so Radix has time to mount the portal content
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [hue, popoverOpen]);

  // Draw the hue bar when popover opens
  React.useEffect(() => {
    if (!popoverOpen) return;

    const draw = () => {
      const canvas = hueRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      for (let i = 0; i <= 360; i += 30) {
        grad.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    };

    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [popoverOpen]);

  /** Extract clientX/clientY from either a mouse or touch event. */
  const getPointer = (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      const touch = e.touches[0] ?? (e as TouchEvent).changedTouches[0];
      return { clientX: touch.clientX, clientY: touch.clientY };
    }
    return { clientX: (e as MouseEvent).clientX, clientY: (e as MouseEvent).clientY };
  };

  const handleSLInteraction = React.useCallback(
    (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { clientX, clientY } = getPointer(e);
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      const s = x * 100;
      const v = (1 - y) * 100;
      // HSV to HSL conversion
      const l = v * (1 - s / 200);
      const sl = l === 0 || l === 100 ? 0 : ((v - l) / Math.min(l, 100 - l)) * 100;

      const hex = hslToHex(hue, sl, l);
      setLocalHex(hex);
      onChange(hex);
    },
    [hue, onChange],
  );

  const handleHueInteraction = React.useCallback(
    (e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
      const canvas = hueRef.current;
      if (!canvas) return;
      const { clientX } = getPointer(e);
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newHue = Math.round(x * 360);
      setHue(newHue);

      // Re-derive color with new hue but keep sat/light from current value
      const { s, l } = hexToHSL(localHex);
      const hex = hslToHex(newHue, s, l);
      setLocalHex(hex);
      onChange(hex);
    },
    [localHex, onChange],
  );

  // Global mouse + touch handlers for dragging
  React.useEffect(() => {
    if (!isDraggingSL && !isDraggingHue) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (isDraggingSL) handleSLInteraction(e);
      if (isDraggingHue) handleHueInteraction(e);
    };
    const handleUp = () => {
      setIsDraggingSL(false);
      setIsDraggingHue(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDraggingSL, isDraggingHue, handleSLInteraction, handleHueInteraction]);

  const handleHexInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!val.startsWith('#')) val = '#' + val;
    setLocalHex(val);
    if (HEX_REGEX.test(val)) {
      onChange(val);
      setHue(hexToHue(val));
    }
  };

  // Compute the SL picker indicator position
  const { s, l } = hexToHSL(value);
  // HSL to HSV for positioning
  const v = l + s * Math.min(l, 100 - l) / 100;
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  const indicatorX = sv * 100;
  const indicatorY = (1 - v / 100) * 100;
  const hueX = (hue / 360) * 100;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'group transition-colors',
            'flex flex-col items-center gap-1.5',
            'sidebar:flex-row sidebar:items-center sidebar:gap-2.5',
            disabled && 'opacity-50 cursor-not-allowed',
            className,
          )}
        >
          {/* Color circle swatch */}
          <div
            className="relative size-12 rounded-full border-2 border-border shadow-sm cursor-pointer transition-all group-hover:scale-105 group-hover:shadow-md group-hover:border-foreground/20 shrink-0"
            style={{ backgroundColor: value }}
          >
            {/* Edit overlay */}
            <div className="absolute inset-0 rounded-full flex items-center justify-center transition-colors">
              <Pencil className="size-3.5 text-white drop-shadow-sm" />
            </div>
          </div>
          {label && (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs font-medium text-foreground">{label}</span>
              <span className="text-[10px] text-muted-foreground font-mono uppercase">{value}</span>
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="center" sideOffset={8} onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Saturation/Lightness area */}
        <div className="relative w-full aspect-square rounded-lg overflow-hidden cursor-crosshair">
          <canvas
            ref={canvasRef}
            width={256}
            height={256}
            className="w-full h-full touch-none"
            onMouseDown={(e) => {
              setIsDraggingSL(true);
              handleSLInteraction(e);
            }}
            onTouchStart={(e) => {
              setIsDraggingSL(true);
              handleSLInteraction(e);
            }}
          />
          {/* Indicator */}
          <div
            className="absolute size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)] pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${indicatorX}%`, top: `${indicatorY}%` }}
          />
        </div>

        {/* Hue slider */}
        <div className="relative w-full h-3 rounded-full overflow-hidden cursor-pointer">
          <canvas
            ref={hueRef}
            width={256}
            height={12}
            className="w-full h-full touch-none"
            onMouseDown={(e) => {
              setIsDraggingHue(true);
              handleHueInteraction(e);
            }}
            onTouchStart={(e) => {
              setIsDraggingHue(true);
              handleHueInteraction(e);
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)] pointer-events-none"
            style={{ left: `${hueX}%` }}
          />
        </div>

        {/* Hex input */}
        <div className="flex items-center gap-2">
          <div
            className="size-8 rounded-md border border-border shrink-0"
            style={{ backgroundColor: localHex }}
          />
          <Input
            value={localHex}
            onChange={handleHexInput}
            className="h-8 font-mono text-base uppercase"
            maxLength={7}
            spellCheck={false}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Color Helpers (local, lightweight) ────────────────────────────────

function hexToHue(hex: string): number {
  return hexToHSL(hex).h;
}

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
