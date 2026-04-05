import { useEffect, useState } from 'react';
import { nip19 } from 'nostr-tools';
import QRCode from 'qrcode';
import { Copy, Check } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { parseHsl, hslToRgb, rgbToHex, getContrastRatio, isDarkTheme } from '@/lib/colorUtils';

/** Minimum contrast ratio between QR modules and background for reliable scanning. */
const MIN_QR_CONTRAST = 3;

/** Saturation threshold (%) above which a color is considered "colorful". */
const COLORFUL_SAT_MIN = 15;
/** Lightness range within which a color appears visually colorful. */
const COLORFUL_L_MIN = 20;
const COLORFUL_L_MAX = 80;

/** Read a CSS custom property as a parsed HSL object, or null if unavailable. */
function readCssHsl(prop: string): { h: number; s: number; l: number } | null {
  if (typeof document === 'undefined') return null;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
  if (!raw) return null;
  const { h, s, l } = parseHsl(raw);
  if ([h, s, l].some(isNaN)) return null;
  return { h, s, l };
}

/**
 * Darken an HSL color until it reaches the minimum contrast against a reference RGB.
 * Returns the adjusted hex color.
 */
function darkenToContrast(
  hsl: { h: number; s: number; l: number },
  refRgb: [number, number, number],
): string {
  let l = hsl.l;
  let rgb = hslToRgb(hsl.h, hsl.s, l);
  let ratio = getContrastRatio(rgb, refRgb);
  while (l > 0 && ratio < MIN_QR_CONTRAST) {
    l = Math.max(0, l - 2);
    rgb = hslToRgb(hsl.h, hsl.s, l);
    ratio = getContrastRatio(rgb, refRgb);
  }
  return rgbToHex(...rgb);
}

/**
 * Lighten an HSL color until it reaches the minimum contrast against a reference RGB.
 * Returns the adjusted hex color.
 */
function lightenToContrast(
  hsl: { h: number; s: number; l: number },
  refRgb: [number, number, number],
): string {
  let l = hsl.l;
  let rgb = hslToRgb(hsl.h, hsl.s, l);
  let ratio = getContrastRatio(rgb, refRgb);
  while (l < 100 && ratio < MIN_QR_CONTRAST) {
    l = Math.min(100, l + 2);
    rgb = hslToRgb(hsl.h, hsl.s, l);
    ratio = getContrastRatio(rgb, refRgb);
  }
  return rgbToHex(...rgb);
}

/**
 * Choose the best module color from primary and foreground.
 *
 * Strongly prefers primary since it carries the theme's brand identity.
 * Only picks foreground if it is colorful (saturation > threshold) AND
 * has significantly better contrast (> 1.5x) against the QR background.
 */
function pickModuleColor(
  primary: { h: number; s: number; l: number },
  foreground: { h: number; s: number; l: number } | null,
  bgRgb: [number, number, number],
): { h: number; s: number; l: number } {
  const fgIsColorful = foreground
    && foreground.s >= COLORFUL_SAT_MIN
    && foreground.l >= COLORFUL_L_MIN
    && foreground.l <= COLORFUL_L_MAX;

  if (!fgIsColorful) return primary;

  const primaryRgb = hslToRgb(primary.h, primary.s, primary.l);
  const fgRgb = hslToRgb(foreground.h, foreground.s, foreground.l);
  const primaryContrast = getContrastRatio(primaryRgb, bgRgb);
  const fgContrast = getContrastRatio(fgRgb, bgRgb);

  // Foreground must be significantly better to override primary
  return fgContrast > primaryContrast * 1.5 ? foreground : primary;
}

/**
 * Derive QR module and background hex colors from the active theme.
 *
 * Light themes: white background, best themed color as modules (darkened if needed).
 * Dark themes: --background as QR background, best themed color as modules (lightened if needed).
 *
 * "Best themed color" is --primary by default. If --foreground is colorful
 * (saturation > 15%) and offers better contrast, it wins instead.
 */
function getThemedQRColors(): { dark: string; light: string } {
  const primary = readCssHsl('--primary');
  const foreground = readCssHsl('--foreground');
  const background = readCssHsl('--background');

  if (!primary) return { dark: '#000000', light: '#ffffff' };

  const isDark = background ? isDarkTheme(`${background.h} ${background.s}% ${background.l}%`) : false;

  if (!isDark) {
    const white: [number, number, number] = [255, 255, 255];
    const module = pickModuleColor(primary, foreground, white);
    return { dark: darkenToContrast(module, white), light: '#ffffff' };
  }

  if (!background) return { dark: '#ffffff', light: '#000000' };
  const bgRgb = hslToRgb(background.h, background.s, background.l);
  const module = pickModuleColor(primary, foreground, bgRgb);
  return {
    dark: lightenToContrast(module, bgRgb),
    light: rgbToHex(...bgRgb),
  };
}

interface FollowQRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FollowQRDialog({ open, onOpenChange }: FollowQRDialogProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey ?? '');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const metadata = author.data?.metadata;
  const displayName = user ? metadata?.name || genUserName(user.pubkey) : '';

  const npub = user ? nip19.npubEncode(user.pubkey) : '';
  const followUrl = npub ? `${window.location.origin}/follow/${npub}` : '';

  useEffect(() => {
    if (!followUrl || !open) return;

    const { dark, light } = getThemedQRColors();

    QRCode.toDataURL(followUrl, {
      width: 400,
      margin: 2,
      color: { dark, light },
      errorCorrectionLevel: 'M',
    })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [followUrl, open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(followUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-6 flex flex-col items-center gap-5 rounded-2xl">
        <DialogTitle className="sr-only">Share follow link</DialogTitle>

        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-2">
          <Avatar shape={getAvatarShape(metadata)} className="size-16 ring-2 ring-secondary">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="text-xl font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm text-muted-foreground text-center">
            Scan to follow <span className="text-foreground font-medium">{displayName}</span>
          </p>
        </div>

        {/* QR code */}
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Follow QR code"
            className="w-full rounded-xl border border-border"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div className="w-full aspect-square rounded-xl border border-border bg-muted animate-pulse" />
        )}

        {/* Copy link */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied
            ? <Check className="size-3.5 text-primary flex-shrink-0" />
            : <Copy className="size-3.5 flex-shrink-0" />}
          <span className="truncate max-w-64">{followUrl}</span>
        </button>
      </DialogContent>
    </Dialog>
  );
}
