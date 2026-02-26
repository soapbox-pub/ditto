import { useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  MessageCircle,
  FileText,
  Heart,
  Zap,
  Users,
  Radio,
  Image,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';

import { DittoLogo } from '@/components/DittoLogo';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

/** An orbiting feature with its associated Nostr kind. */
interface OrbitItem {
  kind: number;
  label: string;
  icon: LucideIcon;
  color: string;
  /** Descriptive verb for the event card. */
  verb: string;
}

const ORBIT_ITEMS: OrbitItem[] = [
  { kind: 1, label: 'Notes', icon: MessageCircle, color: 'from-violet-500 to-purple-600', verb: 'posted' },
  { kind: 30023, label: 'Articles', icon: FileText, color: 'from-blue-500 to-cyan-500', verb: 'published' },
  { kind: 7, label: 'Reactions', icon: Heart, color: 'from-pink-500 to-rose-500', verb: 'reacted' },
  { kind: 9735, label: 'Zaps', icon: Zap, color: 'from-amber-400 to-yellow-500', verb: 'zapped' },
  { kind: 3, label: 'Follows', icon: Users, color: 'from-emerald-500 to-green-500', verb: 'followed' },
  { kind: 30311, label: 'Streams', icon: Radio, color: 'from-red-500 to-orange-500', verb: 'streamed' },
  { kind: 1063, label: 'Media', icon: Image, color: 'from-indigo-500 to-violet-500', verb: 'shared' },
  { kind: 1068, label: 'Polls', icon: BarChart3, color: 'from-teal-500 to-cyan-500', verb: 'polled' },
];

/** Number of items determines angular spacing. */
const ITEM_COUNT = ORBIT_ITEMS.length;

export function PlanetPage() {
  useSeoMeta({
    title: 'Planet Ditto',
    description: 'Explore the Nostr universe with Ditto.',
  });

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selectedItem = selectedIdx !== null ? ORBIT_ITEMS[selectedIdx] : null;

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center overflow-hidden px-4 py-12">
      {/* Background ambient glow */}
      <div className="pointer-events-none absolute inset-0 isolate overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.06] blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 -z-10 h-[300px] w-[300px] -translate-x-1/2 -translate-y-[60%] rounded-full bg-primary/[0.12] blur-[80px]" />
      </div>

      {/* Hero text */}
      <div className="relative z-10 mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Planet{' '}
          <span className="bg-gradient-to-r from-primary via-purple-400 to-primary bg-clip-text text-transparent">
            Ditto
          </span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
          A living universe of social events, orbiting in real time.
        </p>
      </div>

      {/* Orrery container */}
      <div className="relative flex items-center justify-center" style={{ width: 420, height: 420 }}>
        {/* Orbit ellipse — sits behind the planet via z-index layering */}
        <OrbitRing />

        {/* Planet (Ditto logo) — the front half occludes the ring */}
        <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <div className="group relative flex items-center justify-center">
            {/* Glow behind planet */}
            <div className="absolute h-32 w-32 rounded-full bg-primary/20 blur-xl transition-all duration-700 group-hover:bg-primary/30 group-hover:blur-2xl" />
            <DittoLogo size={96} className="relative drop-shadow-lg transition-transform duration-500 group-hover:scale-105" />
          </div>
        </div>

        {/* Orbiting icons */}
        {ORBIT_ITEMS.map((item, i) => (
          <OrbitIcon
            key={item.kind}
            item={item}
            index={i}
            total={ITEM_COUNT}
            isSelected={selectedIdx === i}
            onSelect={() => setSelectedIdx(selectedIdx === i ? null : i)}
          />
        ))}
      </div>

      {/* Subtitle beneath the orrery */}
      <p className="relative z-10 mt-6 text-center text-xs text-muted-foreground/70">
        Click an icon to see the latest event
      </p>

      {/* Event preview card */}
      <div className="relative z-30 mt-6 w-full max-w-sm" style={{ minHeight: 160 }}>
        {selectedItem ? (
          <EventCard item={selectedItem} onClose={() => setSelectedIdx(null)} />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/50 bg-card/30 backdrop-blur-sm">
            <p className="text-sm text-muted-foreground/60">Select an orbiting icon above</p>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="relative z-10 mt-8 flex gap-3">
        <Button asChild size="lg" className="rounded-full px-8 shadow-lg shadow-primary/20">
          <Link to="/">Explore the Feed</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-8">
          <Link to="/search">Search</Link>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orbit ring: an SVG ellipse that visually passes behind the planet
// ---------------------------------------------------------------------------

function OrbitRing() {
  return (
    <svg
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      width="420"
      height="420"
      viewBox="0 0 420 420"
      fill="none"
    >
      <defs>
        <linearGradient id="orbit-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
          <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.08" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      {/* Back arc — behind the planet (lower z) */}
      <ellipse
        cx="210"
        cy="210"
        rx="190"
        ry="90"
        stroke="url(#orbit-grad)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        className="opacity-60"
        style={{ transform: 'rotate(-12deg)', transformOrigin: '210px 210px' }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Individual orbiting icon
// ---------------------------------------------------------------------------

interface OrbitIconProps {
  item: OrbitItem;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Each icon sits at a fixed angle on the tilted ellipse.
 * Icons on the "back" portion (top half of the visual ellipse) get z-10 so
 * they pass behind the planet (z-20). Icons on the "front" portion (bottom
 * half) get z-30 so they pass in front.
 */
function OrbitIcon({ item, index, total, isSelected, onSelect }: OrbitIconProps) {
  const Icon = item.icon;

  // Angle in radians, distributed evenly
  const angle = (2 * Math.PI * index) / total;

  // Tilted ellipse: rx=190, ry=90, rotated -12deg
  const rx = 190;
  const ry = 90;
  const tiltDeg = -12;
  const tiltRad = (tiltDeg * Math.PI) / 180;

  // Position on untilted ellipse
  const ex = rx * Math.cos(angle);
  const ey = ry * Math.sin(angle);

  // Apply rotation
  const x = ex * Math.cos(tiltRad) - ey * Math.sin(tiltRad);
  const y = ex * Math.sin(tiltRad) + ey * Math.cos(tiltRad);

  // Determine if the icon is in the "back" arc (behind the planet)
  // The back arc is roughly where the y-translated position is above center
  // after tilt. We use the raw `ey` (untilted) to decide: negative ey = top arc = behind.
  const isBehind = ey < 0;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'absolute left-1/2 top-1/2 flex items-center justify-center rounded-full',
        'border border-border/60 bg-card shadow-md backdrop-blur-sm',
        'transition-all duration-300 hover:scale-110 hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        isSelected && 'scale-110 ring-2 ring-primary shadow-lg shadow-primary/20',
        isBehind ? 'z-10' : 'z-30',
      )}
      style={{
        width: 44,
        height: 44,
        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
      }}
      aria-label={`View latest ${item.label.toLowerCase()} event`}
    >
      <div className={cn('rounded-full bg-gradient-to-br p-1.5', item.color)}>
        <Icon className="h-4 w-4 text-white" strokeWidth={2.5} />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Event preview card
// ---------------------------------------------------------------------------

function EventCard({ item, onClose }: { item: OrbitItem; onClose: () => void }) {
  const { nostr } = useNostr();

  const { data: event, isLoading } = useQuery({
    queryKey: ['planet-latest', item.kind],
    queryFn: async ({ signal }) => {
      const events = await nostr.query([{ kinds: [item.kind], limit: 1 }], { signal });
      return events[0] ?? null;
    },
    staleTime: 30_000,
  });

  return (
    <Card className="animate-in fade-in-0 zoom-in-95 relative overflow-hidden border-border/60 bg-card/80 shadow-xl backdrop-blur-md duration-300">
      {/* Gradient accent top bar */}
      <div className={cn('h-1 w-full bg-gradient-to-r', item.color)} />

      <CardContent className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('rounded-full bg-gradient-to-br p-1.5', item.color)}>
              <item.icon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold">{item.label}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Body */}
        {isLoading ? (
          <EventCardSkeleton />
        ) : event ? (
          <EventCardBody event={event} item={item} />
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">No events found</p>
        )}
      </CardContent>
    </Card>
  );
}

function EventCardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

function EventCardBody({ event, item }: { event: NostrEvent; item: OrbitItem }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(event.pubkey);

  // Build a content preview
  const preview = useMemo(() => {
    if (event.content) {
      return event.content.slice(0, 140) + (event.content.length > 140 ? '...' : '');
    }
    // For kinds without meaningful content, show tag-based info
    const dTag = event.tags.find(([n]) => n === 'd')?.[1];
    const titleTag = event.tags.find(([n]) => n === 'title')?.[1];
    if (titleTag) return titleTag;
    if (dTag) return dTag;
    return `Kind ${event.kind} event`;
  }, [event]);

  // Compute the link to the event
  const eventLink = useMemo(() => {
    try {
      // Addressable events → naddr
      if (event.kind >= 30000 && event.kind < 40000) {
        const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
        return `/${nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag })}`;
      }
      // Regular events → nevent
      return `/${nip19.neventEncode({ id: event.id })}`;
    } catch {
      return null;
    }
  }, [event]);

  const timeAgo = useMemo(() => {
    const seconds = Math.floor(Date.now() / 1000) - event.created_at;
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }, [event.created_at]);

  return (
    <div className="space-y-3">
      {/* Author row */}
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={metadata?.picture} />
          <AvatarFallback className="bg-muted text-xs font-medium">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
          <p className="text-xs text-muted-foreground">
            {item.verb} {timeAgo}
          </p>
        </div>
      </div>

      {/* Content preview */}
      <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">{preview}</p>

      {/* Visit link */}
      {eventLink && (
        <Button asChild variant="ghost" size="sm" className="w-full justify-center text-primary">
          <Link to={eventLink}>View event &rarr;</Link>
        </Button>
      )}
    </div>
  );
}
