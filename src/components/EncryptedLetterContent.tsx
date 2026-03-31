/**
 * EncryptedLetterContent
 *
 * Public display for kind 8211 encrypted letters. Instead of showing raw
 * ciphertext, renders a 3D interactive envelope:
 *
 *   1. Back (default) — sealed envelope with sender & recipient names in script font
 *   2. Flip — click to flip envelope over (CSS 3D transform)
 *   3. Open — click again to open, revealing Nushu script representation of the ciphertext
 *
 * Nushu (Unicode U+1B170-U+1B2FF) is a real historical secret women's script
 * from China — visible, beautiful, unreadable. It represents modern encryption
 * as a tangible artifact.
 *
 * The envelope uses the same useCardTilt hook as badges for a 3D hover/touch
 * tilt effect, creating a physical "object you can pick up" feel.
 */

import { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Lock, Mail } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useCardTilt } from '@/hooks/useCardTilt';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Nushu character conversion
// ---------------------------------------------------------------------------

/**
 * A curated subset of simpler, more elegant Nushu characters.
 * These have fewer strokes and read as graceful, flowing script —
 * beautiful but unreadable.
 */
const NUSHU_CHARS = [
  '\u{1B170}', '\u{1B171}', '\u{1B172}', '\u{1B174}', '\u{1B177}',
  '\u{1B17A}', '\u{1B17D}', '\u{1B180}', '\u{1B183}', '\u{1B186}',
  '\u{1B189}', '\u{1B18C}', '\u{1B190}', '\u{1B194}', '\u{1B198}',
  '\u{1B19C}', '\u{1B1A0}', '\u{1B1A4}', '\u{1B1A8}', '\u{1B1AC}',
  '\u{1B1B0}', '\u{1B1B4}', '\u{1B1B8}', '\u{1B1BC}', '\u{1B1C0}',
  '\u{1B1C4}', '\u{1B1C8}', '\u{1B1CC}', '\u{1B1D0}', '\u{1B1D4}',
  '\u{1B1D8}', '\u{1B1DC}', '\u{1B1E0}', '\u{1B1E4}', '\u{1B1E8}',
  '\u{1B1EC}', '\u{1B1F0}', '\u{1B1F4}', '\u{1B1F8}', '\u{1B1FC}',
];

/**
 * Convert ciphertext into a sparse, elegant Nushu representation.
 * Uses byte values to pick from the curated character set.
 * Characters are spaced out rather than dense.
 */
function ciphertextToNushu(ciphertext: string, maxChars = 36): string {
  let bytes: Uint8Array;
  try {
    const binary = atob(ciphertext.replace(/\s/g, ''));
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } catch {
    bytes = new Uint8Array(ciphertext.length);
    for (let i = 0; i < ciphertext.length; i++) {
      bytes[i] = ciphertext.charCodeAt(i) & 0xFF;
    }
  }

  const chars: string[] = [];
  const step = Math.max(1, Math.floor(bytes.length / maxChars));
  for (let i = 0; i < bytes.length && chars.length < maxChars; i += step) {
    chars.push(NUSHU_CHARS[bytes[i] % NUSHU_CHARS.length]);
  }
  return chars.join('\u2009'); // thin space between characters
}

// ---------------------------------------------------------------------------
// Participant display
// ---------------------------------------------------------------------------

function NameLabel({ pubkey, prefix }: { pubkey: string; prefix: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);

  if (author.isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-sm opacity-60">{prefix}</span>
        <Skeleton className="h-4 w-20 inline-block" />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="text-sm opacity-60 shrink-0">{prefix}</span>
      <ProfileHoverCard pubkey={pubkey} asChild>
        <Link
          to={profileUrl}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold truncate hover:underline transition-colors"
          style={{ fontFamily: "'Caveat', 'Pacifico', cursive", fontSize: '1.15rem' }}
        >
          {displayName}
        </Link>
      </ProfileHoverCard>
    </span>
  );
}

function SealAvatar({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(pubkey, metadata);

  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      <Link to={profileUrl} onClick={(e) => e.stopPropagation()}>
        <Avatar shape={avatarShape} className="size-12 ring-2 ring-amber-900/30 shadow-lg">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-amber-900/20 text-amber-900 text-sm font-bold">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
    </ProfileHoverCard>
  );
}

// ---------------------------------------------------------------------------
// Envelope states
// ---------------------------------------------------------------------------

type EnvelopeState = 'back' | 'front' | 'open';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface EncryptedLetterContentProps {
  event: NostrEvent;
  /** Compact mode for feed cards (no opening, smaller). */
  compact?: boolean;
  className?: string;
}

export function EncryptedLetterContent({ event, compact, className }: EncryptedLetterContentProps) {
  const [state, setState] = useState<EnvelopeState>('back');

  const recipientPubkey = event.tags.find(([n]) => n === 'p')?.[1];
  const senderPubkey = event.pubkey;

  const nushuText = useMemo(
    () => ciphertextToNushu(event.content, compact ? 20 : 36),
    [event.content, compact],
  );

  // 3D tilt effect (same as badges)
  const tilt = useCardTilt(18, 1.03, 800);

  const handleClick = useCallback(() => {
    if (compact) {
      setState((s) => (s === 'back' ? 'front' : 'back'));
      return;
    }
    setState((s) => {
      if (s === 'back') return 'front';
      if (s === 'front') return 'open';
      return 'back';
    });
  }, [compact]);

  if (!recipientPubkey) {
    return (
      <div className={cn('mt-2 px-4 py-3', className)}>
        <p className="text-sm text-muted-foreground italic">Encrypted letter (no recipient found)</p>
      </div>
    );
  }

  const isFlipped = state === 'front' || state === 'open';
  const isOpen = state === 'open';

  return (
    <div className={cn('mt-3', className)}>
      {/* Centered, padded container with max-width */}
      <div className={cn(
        'mx-auto',
        compact ? 'max-w-sm px-2' : 'max-w-md px-4',
      )}>
        {/* 3D tilt wrapper */}
        <div
          ref={tilt.ref}
          style={{
            ...tilt.style,
            // Override touch-action so scrolling still works — tilt is a bonus
            touchAction: 'pan-y',
          }}
          onPointerDown={tilt.onPointerDown}
          onPointerMove={tilt.onPointerMove}
          onPointerUp={tilt.onPointerUp}
          onPointerLeave={tilt.onPointerLeave}
        >
          {/* Click handler — separate from tilt so both work together */}
          <div
            className="cursor-pointer select-none"
            style={{ perspective: '1200px' }}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }}
            aria-label={
              state === 'back'
                ? 'Sealed envelope — click to flip'
                : state === 'front'
                  ? 'Click to open the envelope'
                  : 'Encrypted letter — click to close'
            }
          >
            <div
              className="relative w-full transition-transform duration-700 ease-in-out"
              style={{
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                aspectRatio: compact ? '16 / 9' : '4 / 3',
              }}
            >
              {/* ========================= BACK FACE ========================= */}
              <div
                className="absolute inset-0 rounded-2xl overflow-hidden shadow-lg"
                style={{ backfaceVisibility: 'hidden' }}
              >
                {/* Envelope paper background */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(145deg, #F5E6D3 0%, #E8D5BF 40%, #D4C4AA 100%)',
                  }}
                />

                {/* Paper texture overlay */}
                <div
                  className="absolute inset-0 opacity-[0.03]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23n)'/%3E%3C/svg%3E")`,
                  }}
                />

                {/* V-fold lines */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 400 300"
                  preserveAspectRatio="none"
                >
                  <path d="M0,0 L200,180" stroke="#C4A882" strokeWidth="1" fill="none" opacity="0.3" />
                  <path d="M400,0 L200,180" stroke="#C4A882" strokeWidth="1" fill="none" opacity="0.3" />
                  <path d="M0,300 L200,180" stroke="#C4A882" strokeWidth="0.8" fill="none" opacity="0.2" />
                  <path d="M400,300 L200,180" stroke="#C4A882" strokeWidth="0.8" fill="none" opacity="0.2" />
                </svg>

                {/* Wax seal in center */}
                <div
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{ top: compact ? '45%' : '50%', transform: 'translate(-50%, -50%)' }}
                >
                  <div
                    className="rounded-full flex items-center justify-center"
                    style={{
                      width: compact ? 48 : 64,
                      height: compact ? 48 : 64,
                      background: 'radial-gradient(ellipse at 35% 30%, #d4524d 0%, #a52422 50%, #7a1a19 100%)',
                      boxShadow: '0 4px 12px rgba(122, 26, 25, 0.4), inset 0 2px 4px rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.2)',
                    }}
                  >
                    <SealAvatar pubkey={senderPubkey} />
                  </div>
                </div>

                {/* Names — sender top-left, recipient bottom-right */}
                <div className="absolute inset-0 flex flex-col justify-between p-4" style={{ color: '#5C4A3A' }}>
                  <div className="self-start">
                    <NameLabel pubkey={senderPubkey} prefix="From" />
                  </div>
                  {!compact && (
                    <div className="self-end">
                      <NameLabel pubkey={recipientPubkey} prefix="To" />
                    </div>
                  )}
                </div>

                {/* Subtle shadow edges */}
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{
                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 8px rgba(0,0,0,0.08)',
                  }}
                />
              </div>

              {/* ========================= FRONT FACE ========================= */}
              <div
                className="absolute inset-0 rounded-2xl overflow-hidden shadow-lg"
                style={{
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                {/* Envelope paper */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(145deg, #EDD9C3 0%, #E0CCAF 50%, #D0BC9C 100%)',
                  }}
                />

                {/* Flap */}
                <div className="absolute top-0 left-0 right-0" style={{ zIndex: 2 }}>
                  <svg viewBox="0 0 400 120" className="w-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="flap-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D4C4AA" />
                        <stop offset="100%" stopColor="#C4B494" />
                      </linearGradient>
                    </defs>
                    <path
                      d={isOpen ? 'M0,0 L200,-80 L400,0 L400,0 L0,0 Z' : 'M0,0 L200,100 L400,0 L400,0 L0,0 Z'}
                      fill="url(#flap-grad)"
                      className="transition-all duration-500"
                    />
                    <path
                      d={isOpen ? 'M0,0 L200,-80 L400,0' : 'M0,0 L200,100 L400,0'}
                      fill="none"
                      stroke="#B5A48A"
                      strokeWidth="1"
                      opacity="0.4"
                      className="transition-all duration-500"
                    />
                  </svg>
                </div>

                {/* Letter content area — slides up when opened */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center transition-all duration-500"
                  style={{
                    zIndex: isOpen ? 3 : 1,
                    opacity: isOpen ? 1 : 0,
                    transform: isOpen ? 'translateY(-8px)' : 'translateY(20px)',
                  }}
                >
                  {/* Inner letter sheet */}
                  <div
                    className="rounded-lg mx-4 p-5 max-h-[85%] overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg, #FDFAF5 0%, #F8F0E5 100%)',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                      width: 'calc(100% - 2rem)',
                    }}
                  >
                    {/* Nushu ciphertext */}
                    <p
                      className="text-center select-none"
                      style={{
                        fontFamily: 'serif',
                        fontSize: compact ? '1rem' : '1.25rem',
                        color: '#3A2E26',
                        lineHeight: 2.2,
                        letterSpacing: '0.25em',
                      }}
                      aria-label="Encrypted content rendered as Nushu script"
                    >
                      {nushuText}
                    </p>

                    {/* Decorative rule */}
                    <div
                      className="mx-auto mt-3"
                      style={{
                        width: '40%',
                        height: 1,
                        background: 'linear-gradient(90deg, transparent, #C4A882, transparent)',
                      }}
                    />

                    {/* Encrypted message notice */}
                    <p
                      className="flex items-center justify-center gap-1.5 mt-3 text-xs"
                      style={{ color: '#8B7355' }}
                    >
                      <Lock className="size-3" />
                      This message is encrypted
                    </p>
                  </div>
                </div>

                {/* Inner shadow */}
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{
                    boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.2), inset 0 -2px 8px rgba(0,0,0,0.06)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact card for embedded notes / quote posts
// ---------------------------------------------------------------------------

interface EncryptedLetterCompactProps {
  event: { id: string; kind: number; pubkey: string; content: string; created_at: number; tags: string[][] };
  className?: string;
}

/**
 * Minimal inline card for kind 8211 in embedded contexts.
 * Shows sender avatar + "Sent a letter to [recipient]".
 */
export function EncryptedLetterCompact({ event, className }: EncryptedLetterCompactProps) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(event.pubkey);
  const recipientPubkey = event.tags.find(([n]) => n === 'p')?.[1];
  const recipientAuthor = useAuthor(recipientPubkey ?? '');
  const recipientName = recipientPubkey
    ? getDisplayName(recipientAuthor.data?.metadata, recipientPubkey)
    : undefined;
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  const neventId = useMemo(
    () => nip19.neventEncode({ id: event.id, author: event.pubkey }),
    [event.id, event.pubkey],
  );

  return (
    <div
      className={cn(
        'group block rounded-2xl border border-border overflow-hidden',
        'hover:bg-secondary/40 transition-colors cursor-pointer',
        className,
      )}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/${neventId}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/${neventId}`);
        }
      }}
    >
      <div className="px-3 py-2 space-y-1">
        {/* Author row */}
        <div className="flex items-center gap-2 min-w-0">
          {author.isLoading ? (
            <>
              <Skeleton className="size-5 rounded-full shrink-0" />
              <Skeleton className="h-3.5 w-24" />
            </>
          ) : (
            <>
              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link
                  to={profileUrl}
                  className="shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Avatar shape={avatarShape} className="size-5">
                    <AvatarImage src={metadata?.picture} alt={displayName} />
                    <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                      {displayName[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </ProfileHoverCard>

              <ProfileHoverCard pubkey={event.pubkey} asChild>
                <Link
                  to={profileUrl}
                  className="text-sm font-semibold truncate hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {displayName}
                </Link>
              </ProfileHoverCard>
            </>
          )}
        </div>

        {/* Content line */}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Mail className="size-3.5 shrink-0" />
          <span>
            Sent a letter{recipientName ? <> to <span className="font-medium text-foreground">{recipientName}</span></> : ''}
          </span>
        </p>
      </div>
    </div>
  );
}
