import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  Download,
  Tag,
  Hash,
  Smartphone,
  Monitor,
  Globe,
  Shield,
  ExternalLink,
  GitCommit,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ZAPSTORE_RELAY } from '@/lib/appRelays';
import { openUrl } from '@/lib/downloadFile';

/** Get a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Get all tag entries for a tag name. */
function getAllTagEntries(tags: string[][], name: string): string[][] {
  return tags.filter(([n]) => n === name);
}

/** Get all values for a tag name. */
function getAllTags(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(([, v]) => v);
}

/** Map a MIME type to a human-readable platform label. */
function mimeToLabel(mime: string): string {
  const map: Record<string, string> = {
    'application/vnd.android.package-archive': 'Android APK',
    'application/vnd.apple.ipa': 'iOS IPA',
    'application/x-apple-diskimage': 'macOS DMG',
    'application/vnd.apple.installer+xml': 'macOS PKG',
    'application/x-msi': 'Windows MSI',
    'application/vnd.appimage': 'Linux AppImage',
    'application/vnd.flatpak': 'Linux Flatpak',
    'application/x-executable': 'Linux Binary',
    'application/x-mach-binary': 'macOS Binary',
    'application/vnd.microsoft.portable-executable': 'Windows EXE',
    'application/vsix': 'VS Code Extension',
    'application/x-chrome-extension': 'Chrome Extension',
    'application/x-xpinstall': 'Firefox Extension',
    'application/wasm': 'WebAssembly',
    'application/webbundle': 'Web Bundle',
    'application/vnd.oci.image.manifest.v1+json': 'OCI Image',
  };
  return map[mime] ?? mime;
}

/** Return a platform icon component for a MIME type. */
function PlatformIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.includes('android') || mime.includes('apple.ipa')) {
    return <Smartphone className={className} />;
  }
  if (mime.includes('apple') || mime.includes('mach') || mime.includes('msi') || mime.includes('portable-executable')) {
    return <Monitor className={className} />;
  }
  if (mime.includes('appimage') || mime.includes('flatpak') || mime.includes('executable')) {
    return <Monitor className={className} />;
  }
  if (mime.includes('wasm') || mime.includes('webbundle') || mime.includes('chrome') || mime.includes('xpinstall') || mime.includes('vsix')) {
    return <Globe className={className} />;
  }
  return <Package className={className} />;
}

/** Format file size for display. */
function formatSize(bytes: string | undefined): string | undefined {
  if (!bytes) return undefined;
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return bytes;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} KB`;
  return `${n} B`;
}

/** Map platform identifier to OS label. */
function platformLabel(f: string): string {
  const map: Record<string, string> = {
    'android-arm64-v8a': 'ARM64',
    'android-armeabi-v7a': 'ARMv7',
    'android-x86': 'x86',
    'android-x86_64': 'x64',
    'darwin-arm64': 'Apple Silicon',
    'darwin-x86_64': 'Intel',
    'linux-aarch64': 'ARM64',
    'linux-x86_64': 'x64',
    'linux-armv7l': 'ARMv7',
    'linux-riscv64': 'RISC-V',
    'windows-aarch64': 'ARM64',
    'windows-x86_64': 'x64',
    'ios-arm64': 'ARM64',
    'wasm32': 'WASM32',
    'wasm64': 'WASM64',
    'wasi-wasm32': 'WASI',
    'wasi-wasm64': 'WASI64',
  };
  return map[f] ?? f;
}

/** Channel label with color. */
function ChannelBadge({ channel }: { channel: string }) {
  const variants: Record<string, string> = {
    main: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    beta: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    nightly: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    dev: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  };
  const colorClass = variants[channel] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {channel}
    </span>
  );
}

/** Hook to fetch asset events (kind 3063) for a release. */
function useReleaseAssets(assetIds: string[]) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent[]>({
    queryKey: ['zapstore-assets', ...assetIds.sort()],
    queryFn: async ({ signal }) => {
      if (assetIds.length === 0) return [];
      try {
        const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
        // Try the Zapstore relay first
        const events = await nostr.relay(ZAPSTORE_RELAY).query(
          [{ kinds: [3063], ids: assetIds }],
          { signal: querySignal },
        );
        if (events.length > 0) return events;
        // Fallback to the default pool
        const fallbackSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
        const fallback = await nostr.query(
          [{ kinds: [3063], ids: assetIds }],
          { signal: fallbackSignal },
        );
        return fallback;
      } catch {
        return [];
      }
    },
    enabled: assetIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

/** Hook to fetch the linked app event (kind 32267) for a release. */
function useReleaseApp(appIdentifier: string | undefined, releasePubkey: string) {
  const { nostr } = useNostr();

  return useQuery<NostrEvent | null>({
    queryKey: ['zapstore-app-for-release', appIdentifier, releasePubkey],
    queryFn: async ({ signal }) => {
      if (!appIdentifier) return null;
      try {
        const querySignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
        const events = await nostr.relay(ZAPSTORE_RELAY).query(
          [{ kinds: [32267], authors: [releasePubkey], '#d': [appIdentifier], limit: 1 }],
          { signal: querySignal },
        );
        if (events.length > 0) return events[0];
        const fallbackSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
        const fallback = await nostr.query(
          [{ kinds: [32267], authors: [releasePubkey], '#d': [appIdentifier], limit: 1 }],
          { signal: fallbackSignal },
        );
        return fallback.length > 0 ? fallback[0] : null;
      } catch {
        return null;
      }
    },
    enabled: !!appIdentifier,
    staleTime: 5 * 60 * 1000,
  });
}

/** Single asset download row. */
function AssetRow({ event }: { event: NostrEvent }) {
  const mime = getTag(event.tags, 'm') ?? '';
  const url = getTag(event.tags, 'url');
  const version = getTag(event.tags, 'version');
  const size = formatSize(getTag(event.tags, 'size'));
  const platforms = getAllTags(event.tags, 'f');
  const variant = getTag(event.tags, 'variant');
  const commit = getTag(event.tags, 'commit');
  const hash = getTag(event.tags, 'x');

  const label = mimeToLabel(mime);
  const platformLabels = platforms.map(platformLabel);

  const handleDownload = async () => {
    if (url) {
      await openUrl(url);
    }
  };

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors group">
      {/* Platform icon */}
      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <PlatformIcon mime={mime} className="size-4 text-primary" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{label}</span>
          {variant && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              {variant}
            </Badge>
          )}
          {platformLabels.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {platformLabels.join(', ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {version && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Tag className="size-3" />
              {version}
            </span>
          )}
          {size && (
            <span className="text-xs text-muted-foreground">{size}</span>
          )}
          {commit && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <GitCommit className="size-3" />
              <code className="font-mono">{commit.slice(0, 7)}</code>
            </span>
          )}
          {hash && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Hash className="size-3" />
              <code className="font-mono">{hash.slice(0, 8)}</code>
            </span>
          )}
        </div>
      </div>

      {/* Download button */}
      {url && (
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        >
          <Download className="size-3.5" />
          Download
        </Button>
      )}
    </div>
  );
}

interface ZapstoreReleaseContentProps {
  event: NostrEvent;
  /** If true, show compact preview (used in NoteCard feed). */
  compact?: boolean;
}

/** Renders a kind 30063 Zapstore release event. */
export function ZapstoreReleaseContent({ event, compact }: ZapstoreReleaseContentProps) {
  const version = getTag(event.tags, 'version');
  const channel = getTag(event.tags, 'c') ?? 'main';
  const appIdentifier = getTag(event.tags, 'i');

  // Collect asset event IDs from `e` tags
  const assetEntries = useMemo(() => getAllTagEntries(event.tags, 'e'), [event.tags]);
  const assetIds = useMemo(() => assetEntries.map(([, id]) => id).filter(Boolean), [assetEntries]);

  const { data: assets = [], isLoading: assetsLoading } = useReleaseAssets(assetIds);
  const { data: appEvent } = useReleaseApp(appIdentifier, event.pubkey);

  const appName = appEvent
    ? (getTag(appEvent.tags, 'name') || getTag(appEvent.tags, 'd') || appIdentifier)
    : appIdentifier;
  const appIcon = appEvent ? getTag(appEvent.tags, 'icon') : undefined;
  const appId = appEvent ? getTag(appEvent.tags, 'd') : appIdentifier;

  // Build naddr link to the app event if we have it
  const appNaddr = appEvent
    ? nip19.naddrEncode({ kind: 32267, pubkey: appEvent.pubkey, identifier: getTag(appEvent.tags, 'd') ?? '' })
    : undefined;

  const releaseNotes = event.content;

  if (compact) {
    return (
      <div className="mt-2 space-y-2.5">
        {/* Header: icon + app name + version */}
        <div className="flex items-start gap-3">
          {appIcon ? (
            <img
              src={appIcon}
              alt={appName ?? ''}
              className="size-10 rounded-xl object-cover shrink-0 shadow-sm"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
            />
          ) : (
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="size-5 text-primary/50" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {appName && (
                appNaddr ? (
                  <Link
                    to={`/${appNaddr}`}
                    className="font-semibold text-[15px] leading-snug hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {appName}
                  </Link>
                ) : (
                  <span className="font-semibold text-[15px] leading-snug">{appName}</span>
                )
              )}
              {version && (
                <Badge variant="outline" className="text-xs px-2 py-0">
                  v{version}
                </Badge>
              )}
              <ChannelBadge channel={channel} />
            </div>
            {/* Asset count summary */}
            {assetIds.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {assetIds.length} {assetIds.length === 1 ? 'asset' : 'assets'} available
              </p>
            )}
          </div>
        </div>

        {/* Release notes (truncated) */}
        {releaseNotes && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words line-clamp-4">
            {releaseNotes}
          </p>
        )}
      </div>
    );
  }

  // Full detail view
  return (
    <div className="mt-3 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        {appIcon ? (
          <img
            src={appIcon}
            alt={appName ?? ''}
            className="size-14 rounded-2xl object-cover shrink-0 shadow-md"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
          />
        ) : (
          <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="size-7 text-primary/50" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {appName && (
            appNaddr ? (
              <Link
                to={`/${appNaddr}`}
                className="text-lg font-bold leading-snug hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {appName}
              </Link>
            ) : (
              <h2 className="text-lg font-bold leading-snug">{appName}</h2>
            )
          )}
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {version && (
              <Badge variant="secondary" className="text-xs px-2 py-0">
                v{version}
              </Badge>
            )}
            <ChannelBadge channel={channel} />
          </div>
        </div>
      </div>

      {/* Action row */}
      {appId && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <a
              href={`https://zapstore.dev/apps/${encodeURIComponent(appId)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3.5" />
              View on Zapstore
            </a>
          </Button>
          {appNaddr && (
            <Button size="sm" variant="ghost" className="gap-1.5" asChild>
              <Link to={`/${appNaddr}`} onClick={(e) => e.stopPropagation()}>
                <Package className="size-3.5" />
                App details
              </Link>
            </Button>
          )}
        </div>
      )}

      {/* Release notes */}
      {releaseNotes && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Release Notes
          </p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {releaseNotes}
          </p>
        </div>
      )}

      {/* Assets */}
      {assetIds.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            Downloads
          </p>
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {assetsLoading
              ? Array.from({ length: Math.min(assetIds.length, 3) }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <Skeleton className="size-8 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))
              : assets.length > 0
                ? assets.map((asset) => (
                    <AssetRow key={asset.id} event={asset} />
                  ))
                : assetIds.map((id) => (
                    <div key={id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Package className="size-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground font-mono truncate">{id.slice(0, 16)}…</p>
                      </div>
                    </div>
                  ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

/** Skeleton loading state for ZapstoreReleaseContent. */
export function ZapstoreReleaseSkeleton() {
  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-start gap-4">
        <Skeleton className="size-14 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        </div>
      </div>
      <Skeleton className="h-8 w-36 rounded-md" />
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <Skeleton className="size-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// kind 3063 — Software Asset card
// ---------------------------------------------------------------------------

interface ZapstoreAssetContentProps {
  event: NostrEvent;
  compact?: boolean;
}

/** Renders a kind 3063 Zapstore software asset event. */
export function ZapstoreAssetContent({ event, compact }: ZapstoreAssetContentProps) {
  const mime = getTag(event.tags, 'm') ?? '';
  const url = getTag(event.tags, 'url');
  const version = getTag(event.tags, 'version');
  const size = formatSize(getTag(event.tags, 'size'));
  const appIdentifier = getTag(event.tags, 'i');
  const platforms = getAllTags(event.tags, 'f');
  const variant = getTag(event.tags, 'variant');
  const commit = getTag(event.tags, 'commit');
  const hash = getTag(event.tags, 'x');
  const supportedNips = getAllTags(event.tags, 'supported_nip');
  const minPlatformVersion = getTag(event.tags, 'min_platform_version');

  const label = mimeToLabel(mime);
  const platformLabels = platforms.map(platformLabel);

  const handleDownload = async () => {
    if (url) {
      await openUrl(url);
    }
  };

  if (compact) {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <PlatformIcon mime={mime} className="size-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[15px] leading-snug">{label}</span>
              {variant && (
                <Badge variant="outline" className="text-xs px-1.5 py-0">{variant}</Badge>
              )}
              {version && (
                <span className="text-xs text-muted-foreground">v{version}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
              {appIdentifier && <span>{appIdentifier}</span>}
              {platformLabels.length > 0 && <span>{platformLabels.join(', ')}</span>}
              {size && <span>{size}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <PlatformIcon mime={mime} className="size-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold leading-snug">{label}</h2>
          {appIdentifier && (
            <p className="text-sm text-muted-foreground mt-0.5">{appIdentifier}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {version && (
              <Badge variant="secondary" className="text-xs px-2 py-0">
                v{version}
              </Badge>
            )}
            {variant && (
              <Badge variant="outline" className="text-xs px-2 py-0">{variant}</Badge>
            )}
            {platformLabels.length > 0 && (
              platformLabels.map((p) => (
                <Badge key={p} variant="outline" className="text-xs px-2 py-0">{p}</Badge>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Download button */}
      {url && (
        <Button
          size="sm"
          className="gap-1.5"
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        >
          <Download className="size-3.5" />
          Download
        </Button>
      )}

      {/* Metadata grid */}
      <div className="rounded-xl border border-border divide-y divide-border">
        {size && (
          <MetaRow label="File Size" value={size} />
        )}
        {mime && (
          <MetaRow label="MIME Type" value={<code className="text-xs font-mono">{mime}</code>} />
        )}
        {hash && (
          <MetaRow label="SHA-256" value={<code className="text-xs font-mono break-all">{hash}</code>} />
        )}
        {commit && (
          <MetaRow
            label="Commit"
            value={
              <span className="flex items-center gap-1">
                <GitCommit className="size-3 shrink-0" />
                <code className="text-xs font-mono">{commit}</code>
              </span>
            }
          />
        )}
        {minPlatformVersion && (
          <MetaRow label="Min Platform Version" value={minPlatformVersion} />
        )}
        {supportedNips.length > 0 && (
          <MetaRow
            label="Supported NIPs"
            value={
              <div className="flex flex-wrap gap-1">
                {supportedNips.map((nip) => (
                  <Badge key={nip} variant="secondary" className="text-xs px-1.5 py-0">
                    NIP-{nip}
                  </Badge>
                ))}
              </div>
            }
          />
        )}
      </div>

      {/* Certificate hashes (Android) */}
      {getAllTags(event.tags, 'apk_certificate_hash').length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            APK Certificate
          </p>
          {getAllTags(event.tags, 'apk_certificate_hash').map((hash) => (
            <div key={hash} className="flex items-center gap-2">
              <Shield className="size-3.5 text-green-600 shrink-0" />
              <code className="text-xs font-mono text-muted-foreground break-all">{hash}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A single metadata row inside the asset details grid. */
function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-3 py-2">
      <span className="text-xs text-muted-foreground w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm flex-1 min-w-0">{value}</span>
    </div>
  );
}

/** Skeleton for ZapstoreAssetContent. */
export function ZapstoreAssetSkeleton() {
  return (
    <div className="mt-3 space-y-4">
      <div className="flex items-start gap-4">
        <Skeleton className="size-14 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>
      <Skeleton className="h-8 w-28 rounded-md" />
      <div className="rounded-xl border border-border divide-y divide-border">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-4 px-3 py-2">
            <Skeleton className="h-3 w-28 mt-0.5 shrink-0" />
            <Skeleton className="h-3 w-48 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Re-export Separator so it's available if needed
export { Separator };
