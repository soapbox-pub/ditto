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
  X,
  type LucideIcon,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface OrbitItem {
  kind: number;
  label: string;
  icon: LucideIcon;
  verb: string;
}

const ORBIT_ITEMS: OrbitItem[] = [
  { kind: 1, label: 'Notes', icon: MessageCircle, verb: 'posted' },
  { kind: 30023, label: 'Articles', icon: FileText, verb: 'published' },
  { kind: 7, label: 'Reactions', icon: Heart, verb: 'reacted' },
  { kind: 9735, label: 'Zaps', icon: Zap, verb: 'zapped' },
  { kind: 3, label: 'Follows', icon: Users, verb: 'followed' },
  { kind: 30311, label: 'Streams', icon: Radio, verb: 'streamed' },
  { kind: 1063, label: 'Media', icon: Image, verb: 'shared' },
  { kind: 1068, label: 'Polls', icon: BarChart3, verb: 'polled' },
];

const ITEM_COUNT = ORBIT_ITEMS.length;

/** Orbit ellipse parameters. */
const RX = 260;
const RY = 80;
const TILT_DEG = -15;
const ORBIT_DURATION = 60; // seconds per full revolution

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PlanetPage() {
  useSeoMeta({
    title: 'Planet Ditto',
    description: 'Explore the Nostr universe with Ditto.',
  });

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selectedItem = selectedIdx !== null ? ORBIT_ITEMS[selectedIdx] : null;

  return (
    <div className="relative flex h-dvh flex-col items-center justify-start overflow-hidden bg-background">
      {/* ---- Massive Ditto logo peeking from the bottom ---- */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[45%] opacity-[0.07]"
        role="img"
        aria-hidden="true"
        style={{
          width: 'min(130vw, 1100px)',
          height: 'min(130vw, 1100px)',
          backgroundColor: 'hsl(var(--foreground))',
          maskImage: 'url(/logo.svg)',
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: 'url(/logo.svg)',
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
        }}
      />

      {/* ---- Hero text ---- */}
      <div className="relative z-10 mt-16 text-center sm:mt-24">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl">
          Ditto
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground sm:text-base">
          A social universe, orbiting in real time.
        </p>
      </div>

      {/* ---- Orbit system ---- */}
      <div
        className="relative z-10 mt-12 sm:mt-16"
        style={{ width: RX * 2 + 60, height: RY * 2 + 60 }}
      >
        {/* Orbit track (SVG ellipse) */}
        <OrbitRing />

        {/* Rotating icon container — one CSS animation drives all icons */}
        <div
          className="absolute inset-0"
          style={{
            animation: `planet-orbit ${ORBIT_DURATION}s linear infinite`,
            transformOrigin: 'center center',
          }}
        >
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
      </div>

      {/* ---- Hint text ---- */}
      <p className="relative z-10 mt-5 text-center text-xs text-muted-foreground/50">
        Click an icon to peek at the latest event
      </p>

      {/* ---- Event preview card ---- */}
      <div className="relative z-30 mt-4 w-full max-w-sm px-4">
        {selectedItem ? (
          <EventCard item={selectedItem} onClose={() => setSelectedIdx(null)} />
        ) : null}
      </div>

      {/* ---- CTA ---- */}
      <div className="relative z-10 mt-auto pb-10 flex gap-3">
        <Button asChild size="lg" className="rounded-full px-8">
          <Link to="/">Explore the Feed</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-8">
          <Link to="/search">Search</Link>
        </Button>
      </div>

      {/* Inline keyframes for the orbit rotation */}
      <style>{`
        @keyframes planet-orbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes planet-counter-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orbit ring
// ---------------------------------------------------------------------------

function OrbitRing() {
  const cx = RX + 30;
  const cy = RY + 30;
  const w = RX * 2 + 60;
  const h = RY * 2 + 60;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
    >
      <ellipse
        cx={cx}
        cy={cy}
        rx={RX}
        ry={RY}
        stroke="hsl(var(--foreground))"
        strokeWidth="1"
        strokeOpacity="0.1"
        style={{ transform: `rotate(${TILT_DEG}deg)`, transformOrigin: `${cx}px ${cy}px` }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Orbiting icon
// ---------------------------------------------------------------------------

interface OrbitIconProps {
  item: OrbitItem;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: () => void;
}

function OrbitIcon({ item, index, total, isSelected, onSelect }: OrbitIconProps) {
  const Icon = item.icon;

  // Place each icon at its starting angle on the tilted ellipse.
  const angle = (2 * Math.PI * index) / total;
  const tiltRad = (TILT_DEG * Math.PI) / 180;

  const ex = RX * Math.cos(angle);
  const ey = RY * Math.sin(angle);

  const x = ex * Math.cos(tiltRad) - ey * Math.sin(tiltRad);
  const y = ex * Math.sin(tiltRad) + ey * Math.cos(tiltRad);

  // Center of the orbit container
  const cx = RX + 30;
  const cy = RY + 30;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'absolute flex items-center justify-center rounded-full',
        'transition-all duration-200',
        'hover:text-foreground hover:scale-125',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'text-foreground scale-125'
          : 'text-muted-foreground/60',
      )}
      style={{
        width: 36,
        height: 36,
        left: cx + x - 18,
        top: cy + y - 18,
        // Counter-rotate so icons stay upright while the parent spins
        animation: `planet-counter-rotate ${ORBIT_DURATION}s linear infinite`,
      }}
      aria-label={`View latest ${item.label.toLowerCase()} event`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
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
    <Card className="animate-in fade-in-0 zoom-in-95 relative overflow-hidden border-border/50 bg-card/90 backdrop-blur-sm duration-200">
      <CardContent className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <item.icon className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-sm font-medium text-foreground">{item.label}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

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

  const preview = useMemo(() => {
    if (event.content) {
      return event.content.slice(0, 140) + (event.content.length > 140 ? '...' : '');
    }
    const titleTag = event.tags.find(([n]) => n === 'title')?.[1];
    const dTag = event.tags.find(([n]) => n === 'd')?.[1];
    if (titleTag) return titleTag;
    if (dTag) return dTag;
    return `Kind ${event.kind} event`;
  }, [event]);

  const eventLink = useMemo(() => {
    try {
      if (event.kind >= 30000 && event.kind < 40000) {
        const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
        return `/${nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag })}`;
      }
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

      <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">{preview}</p>

      {eventLink && (
        <Button asChild variant="ghost" size="sm" className="w-full justify-center text-primary">
          <Link to={eventLink}>View event &rarr;</Link>
        </Button>
      )}
    </div>
  );
}
