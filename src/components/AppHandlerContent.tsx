import type { NostrEvent } from '@nostrify/nostrify';
import { Globe, Smartphone, Monitor, Apple, Layers } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { parseAppHandlerMeta } from '@/lib/appHandlerUtils';
import { getKindLabel } from '@/lib/extraKinds';

/** Get all values for a tag name. */
function getAllTags(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(([, v]) => v);
}

/** Detect which platforms this app supports based on tags. */
function getPlatforms(tags: string[][]): string[] {
  const platforms = new Set<string>();
  for (const [name] of tags) {
    if (name === 'web') platforms.add('Web');
    if (name === 'ios') platforms.add('iOS');
    if (name === 'android') platforms.add('Android');
  }
  return [...platforms];
}

/** Platform icon component. */
function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  switch (platform) {
    case 'Web': return <Globe className={className} />;
    case 'iOS': return <Apple className={className} />;
    case 'Android': return <Smartphone className={className} />;
    default: return <Monitor className={className} />;
  }
}

/** Get a human-readable label for a kind number, or return the raw number. */
function kindLabel(kind: string): string {
  const num = parseInt(kind, 10);
  if (isNaN(num)) return kind;
  const label = getKindLabel(num);
  if (label) return label;
  // Fallback well-known kinds not in extraKinds
  const WELL_KNOWN: Record<number, string> = {
    0: 'profiles',
    1: 'notes',
    3: 'contacts',
    4: 'DMs',
    5: 'deletions',
    6: 'reposts',
    7: 'reactions',
    9735: 'zaps',
    10002: 'relay lists',
    30023: 'articles',
  };
  return WELL_KNOWN[num] ?? `kind ${num}`;
}

/** Get a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

interface AppHandlerContentProps {
  event: NostrEvent;
  /** If true, show compact preview (used in NoteCard feed). */
  compact?: boolean;
}

/** Renders a kind 31990 NIP-89 app handler event. */
export function AppHandlerContent({ event, compact }: AppHandlerContentProps) {
  const meta = useMemo(() => parseAppHandlerMeta(event), [event]);
  const author = useAuthor(event.pubkey);
  const authorMeta = author.data?.metadata;

  // Resolve app metadata - content JSON takes priority, fallback to author kind 0
  const name = meta.name || meta.display_name || authorMeta?.name || getTag(event.tags, 'name') || 'Unknown App';
  const picture = meta.picture || authorMeta?.picture || getTag(event.tags, 'picture') || getTag(event.tags, 'icon');
  const about = meta.about || authorMeta?.about || '';
  const website = meta.website || (meta as Record<string, string>).web || authorMeta?.website;

  const supportedKinds = useMemo(() => getAllTags(event.tags, 'k'), [event.tags]);
  const platforms = useMemo(() => getPlatforms(event.tags), [event.tags]);
  const hashtags = useMemo(() => getAllTags(event.tags, 't'), [event.tags]);

  if (compact) {
    return (
      <div className="mt-2 space-y-2.5">
        {/* Header: icon + name + about */}
        <div className="flex items-start gap-3">
          {picture ? (
            <img
              src={picture}
              alt={name}
              className="size-12 rounded-xl object-cover shrink-0 shadow-sm"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Layers className="size-6 text-primary/50" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] leading-snug">{name}</h3>
            {about && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{about}</p>
            )}
          </div>
        </div>

        {/* Meta row: platforms + supported kinds count */}
        <div className="flex items-center gap-2 flex-wrap">
          {platforms.map((p) => (
            <Badge key={p} variant="secondary" className="text-xs px-2 py-0 gap-1">
              <PlatformIcon platform={p} className="size-3" />
              {p}
            </Badge>
          ))}
          {supportedKinds.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {supportedKinds.length} supported kind{supportedKinds.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Tags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hashtags.slice(0, 6).map((tag) => (
              <Link
                key={tag}
                to={`/t/${encodeURIComponent(tag)}`}
                className="text-xs text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full detail view
  return (
    <div className="mt-3 space-y-4">
      {/* Header: icon + name + about */}
      <div className="flex items-start gap-4">
        {picture ? (
          <img
            src={picture}
            alt={name}
            className="size-16 rounded-2xl object-cover shrink-0 shadow-md"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="size-8 text-primary/50" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold leading-snug">{name}</h2>

          {/* Platform badges */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {platforms.map((p) => (
              <Badge key={p} variant="secondary" className="text-xs px-2 py-0 gap-1">
                <PlatformIcon platform={p} className="size-3" />
                {p}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {website && (
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a href={website} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <Globe className="size-3.5" />
              Website
            </a>
          </Button>
        )}
      </div>

      {/* Description */}
      {about && (
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {about}
        </p>
      )}

      {/* Supported kinds */}
      {supportedKinds.length > 0 && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Layers className="size-4 text-primary" />
            <span>Supported Kinds</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {supportedKinds.map((k) => (
              <Badge key={k} variant="outline" className="text-xs px-2 py-0.5">
                {kindLabel(k)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hashtags.map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Skeleton loading state for AppHandlerContent. */
export function AppHandlerSkeleton() {
  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-start gap-4">
        <Skeleton className="size-16 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}
