import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, QrCode, ExternalLink, Bitcoin, ShieldAlert } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { useToast } from '@/hooks/useToast';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import QRCode from 'qrcode';
import { useAppContext } from '@/hooks/useAppContext';
import { getContentWarning } from '@/lib/contentWarning';
import { MiniAudioPlayer, isAudioUrl } from '@/components/MiniAudioPlayer';

interface ProfileField {
  label: string;
  value: string;
}

interface ProfileRightSidebarProps {
  fields?: ProfileField[];
  /** Media events fetched via a dedicated search query (video:true image:true). */
  mediaEvents?: NostrEvent[];
  /** Whether the media events are still loading. */
  mediaLoading?: boolean;
  /** Called when a media tile is clicked. If provided, tiles don't navigate. */
  onMediaClick?: (url: string) => void;
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
}

/** Extracts image URLs from content. */
function extractImageUrls(content: string): string[] {
  const regex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi;
  return content.match(regex) || [];
}

/** Extracts video URLs from content. */
function extractVideoUrls(content: string): string[] {
  const regex = /https?:\/\/[^\s]+\.(mp4|webm|mov)(\?[^\s]*)?/gi;
  return content.match(regex) || [];
}

/** Extract url and blurhash from the first matching imeta tag for a given URL (or the first tag if no URL given). */
function extractImetaFields(event: NostrEvent, matchUrl?: string): { url?: string; blurhash?: string } {
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
    return { url: fields.url, blurhash: fields.blurhash };
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
      const { url, blurhash } = extractImetaFields(event);
      if (url && !seen.has(url)) {
        seen.add(url);
        const dTag = event.tags.find(([n]) => n === 'd')?.[1];
        items.push({ url, blurhash, eventId: event.id, authorPubkey: event.pubkey, kind: event.kind, dTag, hasContentWarning: hasCW });
      }
      continue;
    }

    // For kind 1, extract URLs from content, then look up blurhash in imeta tags
    const images = extractImageUrls(event.content);
    const videos = extractVideoUrls(event.content);
    for (const url of [...images, ...videos]) {
      if (!seen.has(url)) {
        seen.add(url);
        const { blurhash } = extractImetaFields(event, url);
        items.push({ url, blurhash, eventId: event.id, authorPubkey: event.pubkey, hasContentWarning: hasCW });
      }
    }
  }

  return items.slice(0, 9);
}

/** Single media tile with a blurhash/skeleton shown until the image loads. */
function MediaTile({ item }: { item: MediaItem }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(item.url);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Blurhash or skeleton placeholder while media loads */}
      {!loaded && (
        item.blurhash ? (
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
          autoPlay
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

  // Audio file: render mini player
  const isUrl = field.value.startsWith('http://') || field.value.startsWith('https://');

  if (isUrl && isAudioUrl(field.value)) {
    return (
      <div>
        <div className="font-semibold text-sm mb-1.5">{field.label}</div>
        <MiniAudioPlayer src={field.value} />
      </div>
    );
  }

  // Regular field: label + linked value with favicon
  return (
    <div>
      <div className="font-semibold text-sm">{field.label}</div>
      {isUrl ? (
        <a
          href={field.value}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-primary hover:underline truncate mt-0.5"
        >
          <ExternalFavicon url={field.value} size={16} className="shrink-0" />
          <span className="truncate">{field.value.replace(/^https?:\/\//, '')}</span>
        </a>
      ) : (
        <p className="text-sm text-muted-foreground truncate">{field.value}</p>
      )}
    </div>
  );
}

export function ProfileRightSidebar({ fields, mediaEvents, mediaLoading: mediaLoadingProp, onMediaClick }: ProfileRightSidebarProps) {
  const { config } = useAppContext();
  const media = useMemo(
    () => extractMedia(mediaEvents ?? [], config.contentWarningPolicy),
    [mediaEvents, config.contentWarningPolicy],
  );
  const mediaLoading = mediaLoadingProp ?? false;

  return (
    <aside className="w-[300px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen overflow-y-auto pt-2 pb-3 px-3">
      {/* Media Section */}
      <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
        <h2 className="text-xl font-bold mb-3">Media</h2>
        {mediaLoading ? (
          <div className="grid grid-cols-3 gap-0.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : media && media.length > 0 ? (
          <div className="grid grid-cols-3 gap-0.5">
            {media.map((item, i) => {
              // CW + blur: show a blurred placeholder instead of loading media
              if (item.hasContentWarning && config.contentWarningPolicy === 'blur') {
                const cwInner = (
                  <>
                    <div className="w-full h-full bg-muted/60 blur-lg" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ShieldAlert className="size-5 text-muted-foreground" />
                    </div>
                  </>
                );
                if (onMediaClick) {
                  return (
                    <button key={i} className="aspect-square rounded-lg overflow-hidden block relative w-full" onClick={() => onMediaClick(item.url)}>
                      {cwInner}
                    </button>
                  );
                }
                return (
                  <Link key={i} to={eventLink(item)} className="aspect-square rounded-lg overflow-hidden block relative">
                    {cwInner}
                  </Link>
                );
              }

              if (onMediaClick) {
                return (
                  <button
                    key={i}
                    className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity block relative w-full"
                    onClick={() => onMediaClick(item.url)}
                  >
                    <MediaTile item={item} />
                  </button>
                );
              }
              return (
                <Link
                  key={i}
                  to={eventLink(item)}
                  className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity block relative"
                >
                  <MediaTile item={item} />
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No media yet.</p>
        )}
      </section>

      {/* Profile Fields Section */}
      {fields && fields.length > 0 && (
        <section className="mb-6 bg-background/85 rounded-xl p-3 -mx-1">
          <h2 className="text-xl font-bold mb-3">Profile fields</h2>
          <div className="space-y-4">
            {fields.map((field, i) => (
              <ProfileFieldRow key={i} field={field} />
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-auto pt-4 pb-4 text-left bg-background/85 rounded-xl p-3 -mx-1">
        <p className="text-xs text-muted-foreground">
          <a href="https://shakespeare.diy/clone?url=https%3A%2F%2Fgitlab.com%2Fsoapbox-pub%2Fditto.git" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            Edit Ditto with Shakespeare
          </a>
        </p>
      </footer>
    </aside>
  );
}
