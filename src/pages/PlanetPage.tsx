import { useState, useEffect, useRef, useCallback, useMemo, type SVGProps, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  Clapperboard,
  Palette,

  PartyPopper,
  BarChart3,
  Radio,
  FileText,
  X,
  type LucideIcon,
} from 'lucide-react';

import { CardsIcon } from '@/components/icons/CardsIcon';
import { ChestIcon } from '@/components/icons/ChestIcon';
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

type IconComponent = LucideIcon | ForwardRefExoticComponent<SVGProps<SVGSVGElement> & RefAttributes<SVGSVGElement>>;

interface OrbitItem {
  kind: number;
  label: string;
  icon: IconComponent;
  verb: string;
  route: string;
  color: string;
}

const ORBIT_ITEMS: OrbitItem[] = [
  { kind: 34236, label: 'Vines', icon: Clapperboard, verb: 'shared', route: '/vines', color: '#f472b6' },
  { kind: 3367, label: 'Colors', icon: Palette, verb: 'painted', route: '/colors', color: '#facc15' },
  { kind: 37381, label: 'Decks', icon: CardsIcon, verb: 'built', route: '/decks', color: '#7dd3fc' },
  { kind: 37516, label: 'Treasures', icon: ChestIcon, verb: 'hidden', route: '/treasures', color: '#4ade80' },
  { kind: 39089, label: 'Packs', icon: PartyPopper, verb: 'curated', route: '/packs', color: '#c084fc' },
  { kind: 1068, label: 'Polls', icon: BarChart3, verb: 'asked', route: '/polls', color: '#fb923c' },
  { kind: 30311, label: 'Streams', icon: Radio, verb: 'went live', route: '/streams', color: '#f87171' },
  { kind: 30023, label: 'Articles', icon: FileText, verb: 'published', route: '/articles', color: '#60a5fa' },
];

const COUNT = ORBIT_ITEMS.length;

// ---------------------------------------------------------------------------
// Orbit geometry (pixels, in a 600x600 container)
//
// The Ditto logo SVG viewBox is "-5 -10 100 100" → maps 1:1 onto 600x600.
// Logo visual centre ≈ SVG (45,40) → pixel (300,300). The logo's built-in
// ring sweeps at roughly -25 deg. We use the same tilt for the orbit.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Orbit geometry — all in SVG viewBox units.
// The logo viewBox is "-5 -10 100 100" (width 100, height 100).
// The logo's visual centre is roughly at SVG (45, 40).
// The orbit ellipse sits across that centre like Saturn's ring.
// ---------------------------------------------------------------------------

const SVG_CX = 45;
const SVG_CY = 40;
const SVG_RX = 50;
const SVG_RY = 18;
const TILT_DEG = -22;
const TILT_RAD = (TILT_DEG * Math.PI) / 180;
const COS_T = Math.cos(TILT_RAD);
const SIN_T = Math.sin(TILT_RAD);
const PERIOD = 55;

/** Radius of the occluder circle (must match the <circle r={…}> in the SVG). */
const OCCLUDER_R = 33;

interface OrbitPoint {
  x: number;
  y: number;
  /** True when the icon is behind the planet (should be hidden). */
  behind: boolean;
}

/**
 * Compute an icon's position in SVG viewBox coordinates at angle `theta`.
 * Also determines if the icon is behind the planet body.
 */
function orbitPos(theta: number): OrbitPoint {
  const ex = SVG_RX * Math.cos(theta);
  const ey = SVG_RY * Math.sin(theta);
  const x = SVG_CX + ex * COS_T - ey * SIN_T;
  const y = SVG_CY + ex * SIN_T + ey * COS_T;

  // "Behind" = in the back arc (ey < 0, i.e. top half before tilt)
  // AND within the occluder disc.
  const dx = x - SVG_CX;
  const dy = y - SVG_CY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const behind = ey < 0 && dist < OCCLUDER_R;

  return { x, y, behind };
}

// ---------------------------------------------------------------------------
// Hook: drives every icon along the ellipse using rAF
// ---------------------------------------------------------------------------

function useOrbitPositions() {
  const [positions, setPositions] = useState<OrbitPoint[]>(() =>
    ORBIT_ITEMS.map((_, i) => orbitPos((2 * Math.PI * i) / COUNT)),
  );
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let raf: number;

    function tick(now: number) {
      if (startRef.current === null) startRef.current = now;
      const elapsed = (now - startRef.current) / 1000; // seconds
      const baseAngle = (elapsed / PERIOD) * 2 * Math.PI;

      const next = ORBIT_ITEMS.map((_, i) => {
        const theta = baseAngle + (2 * Math.PI * i) / COUNT;
        return orbitPos(theta);
      });

      setPositions(next);
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return positions;
}

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
  const positions = useOrbitPositions();

  const handleSelect = useCallback(
    (i: number) => setSelectedIdx((prev) => (prev === i ? null : i)),
    [],
  );

  return (
    <div className="relative flex h-dvh flex-col items-center overflow-hidden bg-background">
      {/* Hero text */}
      <div className="relative z-20 mt-16 text-center sm:mt-20">
        <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl">
          Ditto
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground sm:max-w-sm sm:text-base">
          More than notes. A universe of things to do.
        </p>
      </div>

      {/* Logo + orbit — single wrapper anchored to bottom, upper half peeks out */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[40%]"
        style={{ width: 'min(100vw, 1200px)', height: 'min(100vw, 1200px)' }}
      >
        {/* The Ditto logo SVG with orbit ring baked in */}
        <DittoLogoSVG />

        {/* Orbiting icons — positioned as % of this container using SVG coords.
            SVG viewBox is "-5 -10 100 100" → to convert SVG(x,y) to %:
            left = (x - (-5)) / 100 * 100% = (x + 5)%
            top  = (y - (-10)) / 100 * 100% = (y + 10)%  */}
        {ORBIT_ITEMS.map((item, i) => {
          const pos = positions[i];
          const leftPct = ((pos.x + 5) / 100) * 100;
          const topPct = ((pos.y + 10) / 100) * 100;
          return (
            <button
              key={item.kind}
              onClick={() => handleSelect(i)}
              className={cn(
                'absolute flex items-center justify-center rounded-full cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selectedIdx === i ? 'scale-110' : 'hover:scale-105',
              )}
              style={{
                width: 96,
                height: 96,
                left: `calc(${leftPct}% - 48px)`,
                top: `calc(${topPct}% - 48px)`,
                opacity: pos.behind ? 0 : 1,
                zIndex: pos.behind ? 0 : 10,
                animation: pos.behind ? 'none' : `icon-pulse 3s ease-in-out infinite`,
                animationDelay: `${(i / ORBIT_ITEMS.length) * 3}s`,
                transition: 'opacity 0.3s',
                willChange: 'left, top, opacity, transform',
              }}
              aria-label={`View latest ${item.label.toLowerCase()}`}
            >
              <item.icon className="h-16 w-16" strokeWidth={1.2} style={{ color: item.color }} />
            </button>
          );
        })}
      </div>

      {/* Event card */}
      <div className="absolute top-1/2 left-1/2 z-30 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 px-4 sm:top-[40%]">
        {selectedItem && (
          <EventCard item={selectedItem} onClose={() => setSelectedIdx(null)} />
        )}
      </div>

      <style>{`
        @keyframes icon-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
      `}</style>

      {/* CTA */}
      <div className="relative z-20 mt-auto pb-8 pt-2 flex gap-3">
        <Button asChild size="lg" className="rounded-full px-8">
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
// Ditto logo SVG (inlined paths, low-opacity primary fill)
// ---------------------------------------------------------------------------

function DittoLogoSVG() {
  return (
    <svg
      viewBox="-5 -10 100 100"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      {/* Occluder circle — bg-colored disc that hides icons behind the planet */}
      <circle
        cx={SVG_CX}
        cy={SVG_CY}
        r={33}
        fill="hsl(var(--background))"
      />

      {/* Logo paths */}
      <g style={{ fill: '#a855f7', opacity: 0.10 }}>
        <path d="m 71.719615,49.36907 -0.62891,0.37109 c -0.12891,0.07031 -0.26172,0.14844 -0.39062,0.21875 -3.9883,10.309 -14.008,17.617 -25.699,17.617 -4.1211,0 -8.0312,-0.89844 -11.539,-2.5391 -0.12891,0.03906 -0.26172,0.07031 -0.39063,0.10156 l -0.35156,0.08984 h -0.02734 l -0.25,0.05859 -0.07813,0.01953 -0.10938,0.03125 c -0.55859,0.12891 -1.1289,0.26172 -1.6992,0.39062 -0.10156,0.03125 -0.19922,0.05078 -0.30078,0.07031 l -0.30078,0.10156 -0.18359,0.0078 c -0.26953,0.05859 -1.3086,0.26953 -1.3086,0.26953 -0.28906,0.05859 -0.55859,0.10937 -0.82813,0.17187 4.9805,3.3086 10.961,5.2305 17.371,5.2305 15.059,0 27.699,-10.602 30.828,-24.738 -0.75,0.48828 -1.5195,0.96875 -2.2891,1.4414 -0.59375,0.36328 -1.2031,0.72656 -1.8242,1.0859 z" />
        <path d="m 30.926615,29.47807 c 0.36328,-0.48828 0.75,-0.95312 1.1523,-1.3828 0.75781,-0.80469 0.71484,-2.0703 -0.08984,-2.8281 -0.80469,-0.75781 -2.0703,-0.71484 -2.8281,0.08984 -0.50781,0.53906 -0.99219,1.125 -1.4492,1.7383 -0.65625,0.88672 -0.47266,2.1406 0.41406,2.7969 0.35938,0.26562 0.77344,0.39453 1.1875,0.39453 0.61719,0 1.2227,-0.27734 1.6133,-0.80859 z" />
        <path d="m 26.742615,32.67807 c -1.0586,-0.3125 -2.1719,0.29687 -2.4805,1.3594 -0.55859,1.9062 -0.83984,3.9141 -0.83984,5.9609 0,2.3789 0.39062,4.7227 1.1602,6.9609 0.28516,0.82812 1.0625,1.3516 1.8906,1.3516 0.21484,0 0.43359,-0.03516 0.64844,-0.10938 1.043,-0.35938 1.6016,-1.4961 1.2422,-2.543 -0.625,-1.8203 -0.94141,-3.7227 -0.94141,-5.6602 0,-1.668 0.22656,-3.2969 0.67969,-4.8398 0.30859,-1.0586 -0.30078,-2.168 -1.3594,-2.4805 z" />
        <path d="m 14.691615,48.83807 c 0.10156,0.33984 0.19922,0.67969 0.32812,1.0195 0.42969,1.3516 0.94922,2.6484 1.5781,3.9102 0.10156,-0.01172 0.21094,-0.01172 0.32031,-0.01953 l 0.16016,-0.01172 0.80078,-0.07031 c 0.37109,-0.03906 0.67188,-0.07031 0.98047,-0.10156 0.51172,-0.05859 1.0195,-0.12109 1.5586,-0.19922 l 0.21875,-0.03125 c 0.07031,-0.01172 0.14062,-0.01953 0.21094,-0.03125 -1.2188,-2.2109 -2.1484,-4.6016 -2.7305,-7.1211 -0.16016,-0.71094 -0.30078,-1.4297 -0.39844,-2.1602 -0.19922,-1.3086 -0.30078,-2.6602 -0.30078,-4.0312 0,-0.89844 0.03906,-1.7812 0.12891,-2.6484 0.07031,-0.71094 0.16016,-1.4102 0.28906,-2.1016 2.25,-12.949 13.57,-22.828 27.16,-22.828 6.0508,0 11.648,1.9609 16.211,5.3008 0.57031,0.41016 1.1289,0.85938 1.6719,1.3203 1.6914,1.4219 3.2109,3.0703 4.5,4.8789 0.42969,0.60156 0.83984,1.2109 1.2188,1.8398 1.3203,2.1602 2.3398,4.5117 3.0195,7 0.23828,-0.17188 0.42969,-0.30859 0.62891,-0.46875 0.64844,-0.48047 1.2109,-0.92188 1.7383,-1.3398 0.28125,-0.23047 0.5,-0.41016 0.71094,-0.57812 0.10156,-0.07813 0.19141,-0.16016 0.28125,-0.23828 -0.42969,-1.3516 -0.96094,-2.6484 -1.5898,-3.8984 -0.14062,-0.32812 -0.30859,-0.64844 -0.48047,-0.96875 -0.32812,-0.64844 -0.69922,-1.2891 -1.0898,-1.9102 -1.6797,-2.7109 -3.7695,-5.1406 -6.1719,-7.2188 -0.57031,-0.48828 -1.1484,-0.96875 -1.7617,-1.4102 -0.55859,-0.42188 -1.1406,-0.82812 -1.7305,-1.2109 -4.9414,-3.2188 -10.852,-5.0898 -17.16,-5.0898 -14.961,0 -27.531,10.469 -30.75,24.469 -0.17188,0.67969 -0.30859,1.3711 -0.42188,2.0703 -0.12891,0.73828 -0.21875,1.5 -0.28906,2.2617 -0.07813,0.91016 -0.12109,1.8398 -0.12109,2.7812 0,2.3008 0.25,4.5508 0.71875,6.7109 0.17188,0.71484 0.35156,1.4258 0.5625,2.125 z" />
        <path d="m 90.441615,21.60007 c -2.1797,-5.3398 -9.4102,-7.3984 -21,-6.0391 1.8906,1.8906 3.5391,3.9688 4.9297,6.2109 0.28906,0.46094 0.55859,0.92187 0.80859,1.3789 5.5391,-0.12109 7.6094,1.0391 7.8398,1.4492 0.12891,0.46875 -0.55078,2.7305 -4.5898,6.4805 -0.01953,0.01953 -0.03125,0.03125 -0.03906,0.03906 -0.26172,0.23828 -0.51953,0.48047 -0.80078,0.71875 -0.19922,0.17969 -0.41016,0.35938 -0.62891,0.53906 -0.10938,0.10156 -0.21875,0.19141 -0.33984,0.28906 -0.23828,0.19922 -0.5,0.41016 -0.76172,0.62109 -0.12891,0.10156 -0.26172,0.21094 -0.39844,0.32031 -0.42969,0.33984 -0.89063,0.69141 -1.3711,1.0508 -0.26953,0.21094 -0.53906,0.41016 -0.82812,0.60938 -0.32031,0.23047 -0.64062,0.46875 -0.98047,0.69922 0,0.01172 -0.01172,0.01172 -0.01172,0.01172 -0.26953,0.19141 -0.55078,0.37891 -0.82812,0.57031 -0.28125,0.19141 -0.55859,0.37109 -0.85156,0.55859 -0.25,0.16016 -0.5,0.32812 -0.76172,0.48828 -6,3.8984 -13.48,7.7188 -21.379,10.922 -8.0117,3.2383 -15.871,5.6602 -22.93,7.0391 -0.30078,0.05859 -0.60156,0.12109 -0.89062,0.17188 -0.60938,0.12109 -1.2188,0.21875 -1.8203,0.32031 -0.07031,0.01172 -0.12891,0.01953 -0.19922,0.03125 h -0.01953 c -0.28906,0.05078 -0.57031,0.08984 -0.83984,0.12891 -0.30859,0.05078 -0.60938,0.08984 -0.91016,0.12891 -0.57031,0.07813 -1.1094,0.14844 -1.6406,0.21094 -0.35156,0.03906 -0.69141,0.07031 -1.0195,0.10156 -0.30078,0.03125 -0.58984,0.05078 -0.87891,0.07813 -0.48047,0.03125 -0.92969,0.05859 -1.3711,0.07813 -0.39844,0.01953 -0.78125,0.03125 -1.1484,0.03906 -5.5116996,0.10938 -7.5702996,-1.0391 -7.8007996,-1.4492 -0.12891,-0.48047 0.55078,-2.7383 4.6093996,-6.5 -0.12891,-0.48828 -0.26172,-1 -0.37891,-1.5391 -0.51953,-2.4219 -0.78906,-4.8906 -0.78906,-7.3594 0,-0.17969 0,-0.37109 0.01172,-0.55078 -9.2733996,7.082 -13.0229996,13.59 -10.8749996,18.949 1.7383,4.2695 6.7188,6.4492 14.5899996,6.4492 2.8594,0 6.1016,-0.28906 9.7109,-0.87109 0.17188,-0.03125 0.33984,-0.05859 0.51953,-0.08984 0.17188,-0.03125 0.35156,-0.05859 0.51953,-0.08984 l 1.2188,-0.21875 c 0.57031,-0.10156 1.1484,-0.21875 1.7305,-0.33984 0.53125,-0.10938 1.0508,-0.21094 1.5781,-0.32812 0.01172,0 0.03125,-0.01172 0.03906,-0.01172 0.05078,-0.01172 0.08984,-0.01953 0.14062,-0.03125 0.07031,-0.01172 0.12891,-0.03125 0.19922,-0.05078 0.57812,-0.12891 1.1602,-0.26172 1.7383,-0.39844 0.05078,-0.01172 0.10156,-0.03125 0.14844,-0.03906 0.21094,-0.05078 0.42188,-0.10156 0.64062,-0.14844 h 0.01172 c 6.0898,-1.5117 12.559,-3.6406 19.102,-6.2891 6.5508,-2.6602 12.68,-5.6289 18.109,-8.7812 0.21875,-0.12891 0.44141,-0.26172 0.66016,-0.39062 0.58984,-0.33984 1.1797,-0.69141 1.7617,-1.0508 1.5703,-0.96094 3.0586,-1.9297 4.4805,-2.9102 0.12891,-0.08984 0.26172,-0.17969 0.39062,-0.26953 11.242,-7.8477 15.941,-15.09 13.594,-20.938 z" />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Event card
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
    <Card className="animate-in fade-in-0 zoom-in-95 relative overflow-hidden border-primary/10 bg-card/90 backdrop-blur-md duration-200">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <item.icon className="h-4 w-4" strokeWidth={1.5} style={{ color: item.color }} />
            <span className="text-sm font-medium text-foreground">{item.label}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
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

      <div className="flex gap-2">
        {eventLink && (
          <Button asChild variant="ghost" size="sm" className="flex-1 justify-center text-primary/80 hover:text-primary">
            <Link to={eventLink}>View event &rarr;</Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="flex-1 justify-center text-primary/80 hover:text-primary">
          <Link to={item.route}>All {item.label.toLowerCase()} &rarr;</Link>
        </Button>
      </div>
    </div>
  );
}
