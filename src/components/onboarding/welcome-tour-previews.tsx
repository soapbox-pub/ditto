/**
 * Per-step illustrated previews for the welcome tour.
 *
 * These are intentionally lightweight, illustrative previews — not full live
 * components — so they render fast on the card without pulling in heavy
 * feature code (emoji-mart, badge data fetches, etc.).
 *
 * Each preview is designed to fit roughly 200×120 inside a WelcomeTourCard.
 */

import {
  Award,
  Compass,
  Egg,
  Hash,
  Heart,
  Mail,
  Music,
  Palette,
  Plus,
  Podcast,
  Sparkles,
  Star,
  Video,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/** Common shell — theme-aware rounded panel that hosts the illustration. */
function PreviewShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative w-full h-32 sm:h-36 rounded-2xl overflow-hidden',
        'bg-muted/50 border border-border',
        'flex items-center justify-center',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── Welcome ────────────────────────────────────────────────────────────────

export function WelcomePreview() {
  return (
    <PreviewShell>
      <div className="relative flex items-center justify-center">
        <Sparkles className="absolute -top-6 -left-8 size-5 text-amber-400 animate-pulse" />
        <Star className="absolute -top-4 right-2 size-4 text-pink-400 animate-pulse" />
        <Heart className="absolute bottom-0 -left-6 size-4 text-rose-400 animate-pulse" />
        <Sparkles className="absolute -bottom-2 right-6 size-5 text-sky-400 animate-pulse" />
        <div className="text-5xl">🎉</div>
      </div>
    </PreviewShell>
  );
}

// ─── Blobbi hub ─────────────────────────────────────────────────────────────

export function BlobbiHubPreview() {
  return (
    <PreviewShell>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1">
          <div className="size-12 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 flex items-center justify-center shadow-inner">
            <Egg className="size-6 text-amber-700" />
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Egg</span>
        </div>
        <div className="text-muted-foreground">→</div>
        <div className="flex flex-col items-center gap-1">
          <div className="size-12 rounded-full bg-gradient-to-br from-pink-200 to-fuchsia-300 flex items-center justify-center shadow-inner">
            <span className="text-2xl">🐣</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Baby</span>
        </div>
        <div className="text-muted-foreground">→</div>
        <div className="flex flex-col items-center gap-1">
          <div className="size-12 rounded-full bg-gradient-to-br from-violet-200 to-indigo-300 flex items-center justify-center shadow-inner">
            <span className="text-2xl">🦄</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Adult</span>
        </div>
      </div>
    </PreviewShell>
  );
}

// ─── Themes ─────────────────────────────────────────────────────────────────

export function ThemesPreview() {
  const swatches: Array<[string, string]> = [
    ['#fef3c7', '#f59e0b'],
    ['#fce7f3', '#ec4899'],
    ['#dbeafe', '#3b82f6'],
    ['#dcfce7', '#22c55e'],
    ['#ede9fe', '#8b5cf6'],
    ['#fee2e2', '#ef4444'],
  ];
  return (
    <PreviewShell>
      <div className="flex items-center gap-3">
        <Palette className="size-5 text-muted-foreground" />
        <div className="grid grid-cols-3 gap-2">
          {swatches.map(([bg, fg], i) => (
            <div
              key={i}
              className="size-8 rounded-lg border border-white/60 shadow-sm"
              style={{ background: `linear-gradient(135deg, ${bg}, ${fg})` }}
            />
          ))}
        </div>
      </div>
    </PreviewShell>
  );
}

// ─── Emoji packs ────────────────────────────────────────────────────────────

export function EmojiPacksPreview() {
  const items = [
    { e: '🥳', code: ':party:' },
    { e: '🪐', code: ':saturn:' },
    { e: '🐸', code: ':frog:' },
    { e: '✨', code: ':sparkle:' },
  ];
  return (
    <PreviewShell>
      <div className="grid grid-cols-2 gap-2 px-2">
        {items.map((it) => (
          <div
            key={it.code}
            className="flex items-center gap-2 px-2 py-1 rounded-lg bg-card border border-border"
          >
            <span className="text-lg leading-none">{it.e}</span>
            <span className="text-[11px] font-mono text-muted-foreground">{it.code}</span>
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}

// ─── Letters ────────────────────────────────────────────────────────────────

export function LettersPreview() {
  return (
    <PreviewShell>
      <div className="relative">
        {/* Envelope body */}
        <div className="relative w-32 h-20 rounded-lg overflow-hidden shadow-md bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200">
          {/* Flap fold lines */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-px bg-amber-300/60" style={{ transform: 'translateY(-2px)' }} />
          </div>
          <div
            className="absolute left-0 top-0 w-full h-full"
            style={{
              background:
                'linear-gradient(135deg, transparent 49.5%, rgba(180,140,90,0.18) 50%, transparent 50.5%), linear-gradient(225deg, transparent 49.5%, rgba(180,140,90,0.18) 50%, transparent 50.5%)',
            }}
          />
          {/* Wax seal */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-7 rounded-full bg-gradient-to-br from-rose-500 to-rose-700 shadow-md flex items-center justify-center">
            <Heart className="size-3.5 text-white" />
          </div>
        </div>
        <Mail className="absolute -top-3 -right-3 size-5 text-amber-600 bg-background rounded-full p-0.5 shadow" />
      </div>
    </PreviewShell>
  );
}

// ─── Badges ─────────────────────────────────────────────────────────────────

export function BadgesPreview() {
  return (
    <PreviewShell>
      <div className="flex items-center gap-3">
        {[
          { from: 'from-amber-300', to: 'to-amber-500', icon: <Star className="size-5 text-amber-900" /> },
          { from: 'from-sky-300', to: 'to-sky-500', icon: <Award className="size-5 text-sky-900" /> },
          { from: 'from-rose-300', to: 'to-rose-500', icon: <Heart className="size-5 text-rose-900" /> },
        ].map((b, i) => (
          <div
            key={i}
            className={cn(
              'size-12 rounded-full bg-gradient-to-br flex items-center justify-center shadow-md ring-2 ring-white/60',
              b.from,
              b.to,
            )}
            style={{ transform: `rotate(${i % 2 === 0 ? -6 : 6}deg)` }}
          >
            {b.icon}
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}

// ─── Follow people ──────────────────────────────────────────────────────────

export function FollowPeoplePreview() {
  const colors = [
    'from-rose-300 to-rose-500',
    'from-sky-300 to-sky-500',
    'from-emerald-300 to-emerald-500',
  ];
  return (
    <PreviewShell>
      <div className="flex items-center gap-3">
        {colors.map((c, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className={cn('size-10 rounded-full bg-gradient-to-br shadow-sm', c)} />
            <div className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
              Follow
            </div>
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}

// ─── Hashtags / interests ───────────────────────────────────────────────────

export function FollowHashtagsPreview() {
  const tags = ['#nostr', '#photography', '#bitcoin', '#art', '#coffee'];
  return (
    <PreviewShell>
      <div className="flex flex-wrap items-center justify-center gap-1.5 px-4">
        {tags.map((t, i) => (
          <div
            key={t}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border',
              'bg-card border-border',
              i % 2 === 0 ? 'text-fuchsia-600 dark:text-fuchsia-300' : 'text-sky-600 dark:text-sky-300',
            )}
          >
            <Hash className="size-3" />
            {t.replace('#', '')}
          </div>
        ))}
      </div>
    </PreviewShell>
  );
}

// ─── More sidebar ───────────────────────────────────────────────────────────

export function MoreSidebarPreview() {
  const items = [
    { icon: <Video className="size-4" />, label: 'Videos' },
    { icon: <Music className="size-4" />, label: 'Music' },
    { icon: <Podcast className="size-4" />, label: 'Podcasts' },
    { icon: <Compass className="size-4" />, label: 'World' },
  ];
  return (
    <PreviewShell>
      <div className="flex items-center gap-2 px-2">
        {/* Mini sidebar column */}
        <div className="flex flex-col gap-1">
          <div className="px-2 py-1 rounded-md bg-primary/15 text-primary text-[10px] font-semibold">More</div>
          <div className="w-1 h-1 rounded-full bg-muted-foreground/40 mx-auto" />
          <div className="w-1 h-1 rounded-full bg-muted-foreground/40 mx-auto" />
        </div>
        <div className="text-muted-foreground">→</div>
        {/* Items fan-out */}
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((it) => (
            <div
              key={it.label}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border border-border text-[11px]"
            >
              {it.icon}
              <span>{it.label}</span>
            </div>
          ))}
        </div>
      </div>
    </PreviewShell>
  );
}

// ─── First post ─────────────────────────────────────────────────────────────

export function FirstPostPreview() {
  return (
    <PreviewShell>
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Mock post bubble */}
        <div className="absolute left-4 top-4 max-w-[60%] rounded-2xl rounded-bl-sm bg-card border border-border px-3 py-2 shadow-sm">
          <div className="text-xs font-medium">Hi, Nostr! 👋</div>
          <div className="text-[10px] text-muted-foreground">just now</div>
        </div>
        {/* FAB pointer */}
        <div className="absolute right-4 bottom-3 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">tap +</span>
          <div className="size-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center">
            <Plus className="size-5" />
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}
