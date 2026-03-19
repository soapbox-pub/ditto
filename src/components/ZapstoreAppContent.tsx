import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, GitFork, Globe, Package, Shield } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ZAPSTORE_RELAY } from '@/lib/appRelays';

/** Get a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Get all values for a tag name. */
function getAllTags(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(([, v]) => v);
}

/** Map platform identifiers to readable labels. */
function formatPlatform(platform: string): string {
  const map: Record<string, string> = {
    'android-arm64-v8a': 'Android',
    'android-armeabi-v7a': 'Android',
    'android-x86': 'Android',
    'android-x86_64': 'Android',
    'darwin-arm64': 'macOS',
    'darwin-x86_64': 'macOS',
    'linux-aarch64': 'Linux',
    'linux-x86_64': 'Linux',
    'linux-armv7l': 'Linux',
    'linux-riscv64': 'Linux',
    'windows-aarch64': 'Windows',
    'windows-x86_64': 'Windows',
    'ios-arm64': 'iOS',
    'web': 'Web',
  };
  return map[platform] || platform;
}

/** Deduplicate platform labels. */
function getUniquePlatforms(platforms: string[]): string[] {
  return [...new Set(platforms.map(formatPlatform))];
}

/** Hook to fetch the latest release for an app from the zapstore relay. */
function useLatestRelease(appIdentifier: string | undefined, appPubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['zapstore-release', appIdentifier, appPubkey],
    queryFn: async ({ signal }) => {
      if (!appIdentifier || !appPubkey) return null;

      try {
        const relay = nostr.relay(ZAPSTORE_RELAY);
        const querySignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
        const events = await relay.query(
          [{ kinds: [30063], authors: [appPubkey], '#i': [appIdentifier], limit: 5 }],
          { signal: querySignal },
        );

        if (events.length === 0) return null;

        // Find the latest "main" channel release, or just the latest
        const mainRelease = events.find((e) => {
          const channel = getTag(e.tags, 'c');
          return !channel || channel === 'main';
        });

        return mainRelease || events[0];
      } catch {
        return null;
      }
    },
    enabled: !!appIdentifier && !!appPubkey,
    staleTime: 5 * 60 * 1000,
  });
}

interface ZapstoreAppContentProps {
  event: NostrEvent;
  /** If true, show compact preview (used in NoteCard feed). */
  compact?: boolean;
}

/** Renders a kind 32267 Zapstore app event. */
export function ZapstoreAppContent({ event, compact }: ZapstoreAppContentProps) {
  const name = getTag(event.tags, 'name') || getTag(event.tags, 'd') || 'Unknown App';
  const summary = getTag(event.tags, 'summary');
  const icon = getTag(event.tags, 'icon');
  const images = getAllTags(event.tags, 'image');
  const platforms = getAllTags(event.tags, 'f');
  const uniquePlatforms = useMemo(() => getUniquePlatforms(platforms), [platforms]);
  const hashtags = getAllTags(event.tags, 't');
  const websiteUrl = getTag(event.tags, 'url');
  const repoUrl = getTag(event.tags, 'repository');
  const license = getTag(event.tags, 'license');
  const appId = getTag(event.tags, 'd');

  const { data: latestRelease } = useLatestRelease(appId, event.pubkey);
  const latestVersion = latestRelease ? getTag(latestRelease.tags, 'version') : undefined;

  const description = event.content;

  if (compact) {
    return (
      <div className="mt-2 space-y-2.5">
        {/* Header: icon + name + summary */}
        <div className="flex items-start gap-3">
          {icon ? (
            <img
              src={icon}
              alt={name}
              className="size-12 rounded-xl object-cover shrink-0 shadow-sm"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="size-6 text-primary/50" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[15px] leading-snug">{name}</h3>
            {summary && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{summary}</p>
            )}
          </div>
        </div>

        {/* Meta row: platforms + version + license */}
        <div className="flex items-center gap-2 flex-wrap">
          {uniquePlatforms.map((p) => (
            <Badge key={p} variant="secondary" className="text-xs px-2 py-0">
              {p}
            </Badge>
          ))}
          {latestVersion && (
            <span className="text-xs text-muted-foreground">v{latestVersion}</span>
          )}
          {license && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="size-3" />
              {license}
            </span>
          )}
        </div>

        {/* Screenshot strip */}
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {images.slice(0, 3).map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="h-36 rounded-lg object-cover shrink-0 shadow-sm"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            ))}
          </div>
        )}

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
      {/* Header: icon + name + summary */}
      <div className="flex items-start gap-4">
        {icon ? (
          <img
            src={icon}
            alt={name}
            className="size-16 rounded-2xl object-cover shrink-0 shadow-md"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="size-8 text-primary/50" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold leading-snug">{name}</h2>
          {summary && (
            <p className="text-sm text-muted-foreground mt-0.5">{summary}</p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {uniquePlatforms.map((p) => (
              <Badge key={p} variant="secondary" className="text-xs px-2 py-0">
                {p}
              </Badge>
            ))}
            {latestVersion && (
              <Badge variant="outline" className="text-xs px-2 py-0">
                v{latestVersion}
              </Badge>
            )}
            {license && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Shield className="size-3" />
                {license}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {websiteUrl && (
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <Globe className="size-3.5" />
              Website
            </a>
          </Button>
        )}
        {repoUrl && (
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a href={repoUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              <GitFork className="size-3.5" />
              Source
            </a>
          </Button>
        )}
        {appId && (
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a
              href={`https://zapstore.dev/apps/${encodeURIComponent(appId)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3.5" />
              Zapstore
            </a>
          </Button>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
          {description}
        </p>
      )}

      {/* Screenshot gallery */}
      {images.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1.5 -mx-1 px-1 scrollbar-none">
          {images.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="h-52 rounded-xl object-cover shrink-0 shadow-sm"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          ))}
        </div>
      )}

      {/* Release notes */}
      {latestRelease && latestRelease.content && (
        <div className="rounded-xl border border-border p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Package className="size-4 text-primary" />
            <span>Release {latestVersion}</span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words line-clamp-6">
            {latestRelease.content}
          </p>
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

/** Skeleton loading state for ZapstoreAppContent. */
export function ZapstoreAppSkeleton() {
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
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}
