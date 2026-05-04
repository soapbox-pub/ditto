import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, QrCode, ExternalLink, Bitcoin, ShieldAlert, Mail } from 'lucide-react';
import { LinkFooter } from '@/components/LinkFooter';
import { Blurhash } from 'react-blurhash';
import { cn } from '@/lib/utils';
import { isValidBlurhash } from '@/lib/blurhash';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmbeddedNaddr } from '@/components/EmbeddedNaddr';
import { useToast } from '@/hooks/useToast';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import type { AddrCoords } from '@/hooks/useEvent';
import QRCode from 'qrcode';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/hooks/useAppContext';
import { getContentWarning } from '@/lib/contentWarning';
import { MiniAudioPlayer } from '@/components/MiniAudioPlayer';
import { isAudioUrl, isImageUrl, isVideoUrl } from '@/lib/mediaTypeDetection';
import { VideoPlayer } from '@/components/VideoPlayer';
import { parseDimToAspectRatio } from '@/lib/mediaUtils';
import { isWeatherFieldLabel } from '@/lib/weatherStation';
import { WeatherStationCard } from '@/components/WeatherStationCard';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Media-native kinds shown in the sidebar (excludes kind 1 text notes and kind 1111 comments). */
const SIDEBAR_MEDIA_KINDS = [20, 21, 22, 34236, 36787, 34139, 30054, 30055];

/** Maximum number of media tiles shown in the sidebar. */
const SIDEBAR_MEDIA_LIMIT = 9;

/** Simple email regex for display purposes. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Bech32 charset used by NIP-19 identifiers. */
const B32 = '023456789acdefghjklmnpqrstuvwxyz';

/** Regex that matches nostr:<nip19> URIs. */
const NOSTR_URI_REGEX = new RegExp(`^nostr:(note1|nevent1|naddr1|npub1|nprofile1)[${B32}]+$`);

/** Parse a nostr: URI value and return embed info, or null if not a valid nostr URI. */
function parseNostrUri(value: string): { type: 'note'; eventId: string } | { type: 'nevent'; eventId: string; relays?: string[]; author?: string } | { type: 'naddr'; addr: AddrCoords } | { type: 'profile'; pubkey: string } | null {
  const trimmed = value.trim();
  if (!NOSTR_URI_REGEX.test(trimmed)) return null;
  try {
    const bech32 = trimmed.slice('nostr:'.length);
    const decoded = nip19.decode(bech32);
    switch (decoded.type) {
      case 'note':
        return { type: 'note', eventId: decoded.data as string };
      case 'nevent':
        return { type: 'nevent', eventId: decoded.data.id, relays: decoded.data.relays, author: decoded.data.author };
      case 'naddr':
        return { type: 'naddr', addr: decoded.data as AddrCoords };
      case 'npub':
        return { type: 'profile', pubkey: decoded.data as string };
      case 'nprofile':
        return { type: 'profile', pubkey: decoded.data.pubkey };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

interface ProfileField {
  label: string;
  value: string;
}

interface ProfileRightSidebarProps {
  fields?: ProfileField[];
  /** Pubkey whose media-native events to display in the sidebar. */
  pubkey?: string;
  /** Called when a media tile is clicked. If provided, tiles don't navigate. */
  onMediaClick?: (url: string) => void;
  /** Override the root element's className (e.g. to show on mobile). */
  className?: string;
}

interface MediaItem {
  url: string;
  eventId: string;
  authorPubkey: string;
  /** For addressable events — needed to build naddr links. */
  kind?: number;
  dTag?: string;
  /** True if the source event has a NIP-36 content-warning tag. */
  hasContentWarning: boolean;
  /** NIP-94 blurhash value from the imeta tag, if available. */
  blurhash?: string;
  /** NIP-94 dim value from the imeta tag, e.g. "1280x720". */
  dim?: string;
  /** MIME type from the imeta `m` field, e.g. "video/mp4". */
  mime?: string;
}

/** Extracts image URLs from content. */
function extractImageUrls(content: string): string[] {
  const regex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  return content.match(regex) || [];
}

/** Extracts video URLs from content. */
function extractVideoUrls(content: string): string[] {
  const regex = /https?:\/\/[^\s]+\.(mp4|webm|mov|qt)(\?[^\s]*)?/gi;
  return content.match(regex) || [];
}

/** Extract url, blurhash, dim, and mime from the first matching imeta tag for a given URL (or the first tag if no URL given). */
function extractImetaFields(event: NostrEvent, matchUrl?: string): { url?: string; blurhash?: string; dim?: string; mime?: string } {
  const imetaTags = event.tags.filter(([name]) => name === 'imeta');
  for (const imetaTag of imetaTags) {
    const fields: Record<string, string> = {};
    for (let i = 1; i < imetaTag.length; i++) {
      const spaceIdx = imetaTag[i].indexOf(' ');
      if (spaceIdx === -1) continue;
      fields[imetaTag[i].slice(0, spaceIdx)] = imetaTag[i].slice(spaceIdx + 1);
    }
    if (!fields.url) continue;
    if (matchUrl && fields.url !== matchUrl) continue;
    return { url: fields.url, blurhash: fields.blurhash, dim: fields.dim, mime: fields.m };
  }
  return {};
}

/** Extract media items from an array of events (pure function, no query). */
function extractMedia(events: NostrEvent[], cwPolicy: string): MediaItem[] {
  const items: MediaItem[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const hasCW = getContentWarning(event) !== undefined;

    // Skip CW events entirely when policy is "hide"
    if (hasCW && cwPolicy === 'hide') continue;

    // For media-native kinds (vines etc.), extract from imeta tags
    if (event.kind !== 1) {
      const { url, blurhash, dim, mime } = extractImetaFields(event);
      if (url && !seen.has(url)) {
        seen.add(url);
        const dTag = event.tags.find(([n]) => n === 'd')?.[1];
        items.push({ url, blurhash, dim, mime, eventId: event.id, authorPubkey: event.pubkey, kind: event.kind, dTag, hasContentWarning: hasCW });
      }
      continue;
    }

    // For kind 1, extract URLs from content, then look up blurhash/dim in imeta tags
    const images = extractImageUrls(event.content);
    const videos = extractVideoUrls(event.content);
    for (const url of [...images, ...videos]) {
      if (!seen.has(url)) {
        seen.add(url);
        const { blurhash, dim, mime } = extractImetaFields(event, url);
        items.push({ url, blurhash, dim, mime, eventId: event.id, authorPubkey: event.pubkey, hasContentWarning: hasCW });
      }
    }
  }

  return items.slice(0, 9);
}

/** Event kinds that are inherently video content. */
const VIDEO_KINDS = new Set([34236, 21, 22]);

/** Detect whether a media item is a video using mime type, file extension, or event kind. */
function isVideoItem(item: MediaItem): boolean {
  if (item.mime?.startsWith('video/')) return true;
  if (/\.(mp4|webm|mov|qt)(\?.*)?$/i.test(item.url)) return true;
  if (item.kind !== undefined && VIDEO_KINDS.has(item.kind)) return true;
  return false;
}

/** Single media tile with a blurhash/skeleton shown until the image loads. */
function MediaTile({ item }: { item: MediaItem }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const { config } = useAppContext();
  const isVideo = isVideoItem(item);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Blurhash or skeleton placeholder while media loads */}
      {!loaded && (
        isValidBlurhash(item.blurhash) ? (
          <Blurhash
            hash={item.blurhash}
            width={32}
            height={32}
            resolutionX={32}
            resolutionY={32}
            punch={1}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          />
        ) : (
          <Skeleton className="absolute inset-0 w-full h-full rounded-none" />
        )
      )}
      {isVideo ? (
        <video
          src={item.url}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          autoPlay={config.autoplayVideos}
          loop
          playsInline
          preload="metadata"
          onLoadedData={() => setLoaded(true)}
        />
      ) : (
        <img
          ref={imgRef}
          src={item.url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
}

/** Build a nevent/naddr link for navigating to an event. */
function eventLink(item: MediaItem): string {
  if (item.kind && item.kind >= 30000 && item.kind < 40000 && item.dTag !== undefined) {
    return `/${nip19.naddrEncode({ kind: item.kind, pubkey: item.authorPubkey, identifier: item.dTag })}`;
  }
  return `/${nip19.neventEncode({ id: item.eventId, author: item.authorPubkey })}`;
}

/** Bitcoin QR code modal */
function BitcoinQRModal({ address }: { address: string }) {
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    QRCode.toDataURL(`bitcoin:${address}`, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    }).then(setQrUrl).catch(console.error);
  }, [address]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast({ title: 'Copied', description: 'Bitcoin address copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DialogContent className="sm:max-w-[360px] p-6 overflow-hidden rounded-2xl [&>button]:top-6 [&>button]:right-6">
      <div className="min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
              <Bitcoin className="size-4 text-white" />
            </div>
            <span>Bitcoin</span>
          </DialogTitle>
        </DialogHeader>

        {/* QR Code */}
        <div className="flex justify-center my-5">
          <div className="bg-white p-3 rounded-xl">
            {qrUrl ? (
              <img src={qrUrl} alt="Bitcoin QR" className="size-[220px]" />
            ) : (
              <div className="size-[220px] bg-muted animate-pulse rounded" />
            )}
          </div>
        </div>

        {/* Address + Copy */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 w-full bg-secondary/60 hover:bg-secondary/80 transition-colors rounded-lg pl-3 pr-2.5 py-2.5 text-left cursor-pointer overflow-hidden"
        >
          <span className="min-w-0 font-mono text-xs truncate">{address}</span>
          <span className="shrink-0 ml-auto">
            {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4 text-muted-foreground" />}
          </span>
        </button>
      </div>
    </DialogContent>
  );
}

/** A single profile field row. Handles $BTC specially. */
function ProfileFieldRow({ field }: { field: ProfileField }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const isBtc = field.label === '$BTC';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(field.value);
    setCopied(true);
    toast({ title: 'Copied', description: 'Bitcoin address copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  if (isBtc) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="size-5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
            <Bitcoin className="size-3 text-white" />
          </div>
          <span className="font-semibold text-sm">Bitcoin</span>
          <div className="ml-auto flex items-center gap-1">
            <Dialog>
              <DialogTrigger asChild>
                <button className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary">
                  <QrCode className="size-4" />
                </button>
              </DialogTrigger>
              <BitcoinQRModal address={field.value} />
            </Dialog>
            <a
              href={`https://mempool.space/address/${field.value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-secondary/60 rounded-lg px-3 py-2 font-mono text-xs truncate">
            {field.value}
          </div>
          <Button
            onClick={handleCopy}
            size="sm"
            className="shrink-0 rounded-lg font-semibold text-xs h-8"
          >
            {copied ? <Check className="size-3.5" /> : 'Copy'}
          </Button>
        </div>
      </div>
    );
  }

  if (isWeatherFieldLabel(field.label)) {
    return <WeatherFieldRow value={field.value} />;
  }

  // Nostr URI: render embedded event
  const nostrEmbed = parseNostrUri(field.value);
  if (nostrEmbed) {
    return (
      <div>
        <div className="font-semibold text-sm mb-1.5">{field.label}</div>
        {nostrEmbed.type === 'note' && (
          <EmbeddedNote eventId={nostrEmbed.eventId} />
        )}
        {nostrEmbed.type === 'nevent' && (
          <EmbeddedNote eventId={nostrEmbed.eventId} relays={nostrEmbed.relays} authorHint={nostrEmbed.author} />
        )}
        {nostrEmbed.type === 'naddr' && (
          <EmbeddedNaddr addr={nostrEmbed.addr} />
        )}
        {nostrEmbed.type === 'profile' && (
          <Link to={`/${nip19.npubEncode(nostrEmbed.pubkey)}`} className="text-sm text-primary hover:underline">
            {nip19.npubEncode(nostrEmbed.pubkey).slice(0, 16)}...
          </Link>
        )}
      </div>
    );
  }

  // Email field: render as mailto link
  const isEmail = field.label.toLowerCase() === 'email' && EMAIL_REGEX.test(field.value);
  if (isEmail) {
    return (
      <div>
        <div className="font-semibold text-sm">{field.label}</div>
        <a
          href={`mailto:${field.value}`}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline truncate mt-0.5"
        >
          <Mail className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{field.value}</span>
        </a>
      </div>
    );
  }

  // Media fields: render inline players/previews based on file extension
  const safeUrl = sanitizeUrl(field.value);

  if (safeUrl && isAudioUrl(safeUrl)) {
    return (
      <div>
        <div className="font-semibold text-sm mb-1.5">{field.label}</div>
        <MiniAudioPlayer src={safeUrl} />
      </div>
    );
  }

  if (safeUrl && isImageUrl(safeUrl)) {
    return (
      <div>
        {field.label && <div className="font-semibold text-sm mb-1.5">{field.label}</div>}
        <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={safeUrl}
            alt={field.label || 'Profile image'}
            className="w-full rounded-lg object-cover"
            loading="lazy"
          />
        </a>
      </div>
    );
  }

  if (safeUrl && isVideoUrl(safeUrl)) {
    return (
      <div>
        {field.label && <div className="font-semibold text-sm mb-1.5">{field.label}</div>}
        <div className="rounded-lg overflow-hidden">
          <VideoPlayer src={safeUrl} />
        </div>
      </div>
    );
  }

  // Regular field: label + linked value with favicon
  return (
    <div>
      <div className="font-semibold text-sm">{field.label}</div>
      {safeUrl ? (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-primary hover:underline truncate mt-0.5"
        >
          <ExternalFavicon url={safeUrl} size={16} className="shrink-0" />
          <span className="truncate">{safeUrl.replace(/^https?:\/\//, '')}</span>
        </a>
      ) : (
        <p className="text-sm text-muted-foreground truncate">{field.value}</p>
      )}
    </div>
  );
}

function WeatherFieldRow({ value }: { value: string }) {
  return <WeatherStationCard value={value} />;
}

/** Compute justified rows for the sidebar collage. */
function sidebarJustifiedLayout(items: MediaItem[]): { items: MediaItem[]; heightFraction: number }[] {
  if (items.length === 0) return [];
  const rows: { items: MediaItem[]; heightFraction: number }[] = [];
  let currentRow: MediaItem[] = [];
  let currentAspectSum = 0;
  // Sidebar target row height as fraction of container width — ~33%
  const targetRowHeight = 0.35;
  const maxRowItems = 4;

  for (const item of items) {
    const ar = parseDimToAspectRatio(item.dim);
    currentRow.push(item);
    currentAspectSum += ar;
    const rowHeightFraction = 1 / currentAspectSum;
    if (rowHeightFraction <= targetRowHeight || currentRow.length >= maxRowItems) {
      rows.push({ items: [...currentRow], heightFraction: rowHeightFraction });
      currentRow = [];
      currentAspectSum = 0;
    }
  }
  // Drop orphan single-item trailing rows — they look oversized in the compact sidebar
  if (currentRow.length > 1) {
    const rowHeightFraction = 1 / currentAspectSum;
    rows.push({ items: currentRow, heightFraction: Math.min(rowHeightFraction, targetRowHeight) });
  }
  return rows;
}

export function ProfileRightSidebar({ fields, pubkey, onMediaClick, className }: ProfileRightSidebarProps) {
  const { config } = useAppContext();
  const { nostr } = useNostr();

  // Single query: fetch media-native events, then fill remaining slots with kind 1 media if needed.
  const { data: sidebarEvents, isPending: mediaLoading } = useQuery({
    queryKey: ['sidebar-media', pubkey ?? ''],
    queryFn: async ({ signal }) => {
      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
      const now = Math.floor(Date.now() / 1000);

      const primaryEvents = await nostr.query(
        [{ kinds: SIDEBAR_MEDIA_KINDS, authors: [pubkey!], limit: SIDEBAR_MEDIA_LIMIT }],
        { signal: querySignal },
      );
      const primary = primaryEvents.filter((e) => e.created_at <= now).sort((a, b) => b.created_at - a.created_at);

      // Only fetch kind 1 fallback if there aren't enough media-native events.
      if (primary.length >= SIDEBAR_MEDIA_LIMIT) return primary;

      const fallbackEvents = await nostr.query(
        [{ kinds: [1], authors: [pubkey!], search: 'media:true', limit: SIDEBAR_MEDIA_LIMIT } as { kinds: number[]; authors: string[]; search: string; limit: number }],
        { signal: querySignal },
      );
      const fallback = fallbackEvents.filter((e) => e.created_at <= now).sort((a, b) => b.created_at - a.created_at);

      return [...primary, ...fallback];
    },
    enabled: !!pubkey,
    staleTime: 30_000,
  });

  const media = useMemo(
    () => extractMedia(sidebarEvents ?? [], config.contentWarningPolicy),
    [sidebarEvents, config.contentWarningPolicy],
  );

  const sidebarRows = useMemo(() => sidebarJustifiedLayout(media), [media]);

  return (
    <aside className={cn("w-1/4 max-w-[300px] shrink-0 hidden lg:flex flex-col sticky top-0 h-screen overflow-y-auto pt-2 pb-3 px-3", className)}>
      {/* Media Section — only shown when pubkey prop is provided */}
      {pubkey !== undefined && <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
        <h2 className="text-xl font-bold mb-3" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>Media</h2>
        {mediaLoading ? (
          <div className="flex flex-col gap-0.5">
            {[
              [1.5, 0.8, 1.2],
              [1, 1.3, 0.9],
              [0.75, 1.5, 1],
            ].map((ratios, rowIdx) => {
              const rowAR = ratios.reduce((s, r) => s + r, 0);
              return (
                <div key={rowIdx} className="flex gap-0.5" style={{ aspectRatio: `${rowAR}` }}>
                  {ratios.map((ar, colIdx) => (
                    <Skeleton
                      key={colIdx}
                      className="rounded-lg h-full"
                      style={{ flexGrow: ar, flexBasis: 0 }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ) : media && media.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {sidebarRows.map((row, rowIdx) => {
              const rowAR = row.items.reduce((s, item) => s + parseDimToAspectRatio(item.dim), 0);
              return (
                <div key={rowIdx} className="flex gap-0.5" style={{ aspectRatio: `${rowAR}` }}>
                  {row.items.map((item, i) => {
                    const ar = parseDimToAspectRatio(item.dim);
                    const cellStyle: React.CSSProperties = {
                      flexGrow: ar,
                      flexBasis: 0,
                      position: 'relative',
                    };

                    // CW + blur: show a blurred placeholder instead of loading media
                    if (item.hasContentWarning && config.contentWarningPolicy === 'blur') {
                      const cwInner = (
                        <>
                          <div className="absolute inset-0 bg-muted/60 blur-lg" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ShieldAlert className="size-5 text-muted-foreground" />
                          </div>
                        </>
                      );
                      if (onMediaClick) {
                        return (
                          <div key={i} style={cellStyle} className="rounded-lg overflow-hidden h-full">
                            <button className="absolute inset-0 w-full h-full" onClick={() => onMediaClick(item.url)}>
                              {cwInner}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div key={i} style={cellStyle} className="rounded-lg overflow-hidden h-full">
                          <Link to={eventLink(item)} className="absolute inset-0 block">
                            {cwInner}
                          </Link>
                        </div>
                      );
                    }

                    if (onMediaClick) {
                      return (
                        <div key={i} style={cellStyle} className="rounded-lg overflow-hidden h-full">
                          <button
                            className="absolute inset-0 hover:opacity-80 transition-opacity w-full h-full"
                            onClick={() => onMediaClick(item.url)}
                          >
                            <MediaTile item={item} />
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div key={i} style={cellStyle} className="rounded-lg overflow-hidden h-full">
                        <Link
                          to={eventLink(item)}
                          className="absolute inset-0 hover:opacity-80 transition-opacity block"
                        >
                          <MediaTile item={item} />
                        </Link>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No media yet.</p>
        )}
      </section>}

      {/* Profile Fields Section */}
      {fields && fields.length > 0 && (
        <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
          <h2 className="text-xl font-bold mb-3" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>Profile fields</h2>
          <div className="space-y-4">
            {fields.map((field, i) => (
              <ProfileFieldRow key={i} field={field} />
            ))}
          </div>
        </section>
      )}

      {/* Footer — hidden when used as a fields-only preview */}
      {pubkey !== undefined && <LinkFooter />}
    </aside>
  );
}
