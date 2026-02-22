import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, QrCode, ExternalLink, Bitcoin, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { useToast } from '@/hooks/useToast';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import QRCode from 'qrcode';
import { useAppContext } from '@/hooks/useAppContext';
import { getContentWarning } from '@/components/ContentWarningGuard';

interface ProfileField {
  label: string;
  value: string;
}

interface ProfileRightSidebarProps {
  fields?: ProfileField[];
  /** Events from the profile feed — media is extracted client-side instead of a separate query. */
  events?: NostrEvent[];
  /** Whether the feed events are still loading. */
  eventsLoading?: boolean;
  /** Whether all feed pages have been loaded (no more pages to fetch). */
  eventsComplete?: boolean;
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

/** Extract the video URL from a vine's imeta tag. */
function extractImetaUrl(event: NostrEvent): string | undefined {
  const imetaTag = event.tags.find(([name]) => name === 'imeta');
  if (!imetaTag) return undefined;
  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i];
    if (part.startsWith('url ')) return part.slice(4);
  }
  return undefined;
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
      const imetaUrl = extractImetaUrl(event);
      if (imetaUrl && !seen.has(imetaUrl)) {
        seen.add(imetaUrl);
        const dTag = event.tags.find(([n]) => n === 'd')?.[1];
        items.push({ url: imetaUrl, eventId: event.id, authorPubkey: event.pubkey, kind: event.kind, dTag, hasContentWarning: hasCW });
      }
      continue;
    }

    // For kind 1, extract from content
    const images = extractImageUrls(event.content);
    const videos = extractVideoUrls(event.content);
    for (const url of [...images, ...videos]) {
      if (!seen.has(url)) {
        seen.add(url);
        items.push({ url, eventId: event.id, authorPubkey: event.pubkey, hasContentWarning: hasCW });
      }
    }
  }

  return items.slice(0, 9);
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

  // Regular field: label + linked value with favicon
  const isUrl = field.value.startsWith('http://') || field.value.startsWith('https://');

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

export function ProfileRightSidebar({ fields, events, eventsLoading, eventsComplete }: ProfileRightSidebarProps) {
  const { config } = useAppContext();
  const media = useMemo(
    () => extractMedia(events ?? [], config.contentWarningPolicy),
    [events, config.contentWarningPolicy],
  );
  const mediaLoading = (eventsLoading ?? false) || (media.length === 0 && !eventsComplete);

  return (
    <aside className="w-[300px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen overflow-y-auto pt-5 pb-3 px-5">
      {/* Media Section */}
      <section className="mb-6">
        <h2 className="text-xl font-bold mb-3">Media</h2>
        {mediaLoading ? (
          <div className="grid grid-cols-3 gap-0.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : media && media.length > 0 ? (
          <div className="grid grid-cols-3 gap-0.5">
            {media.map((item, i) => {
              // CW + blur: show a blurred placeholder instead of loading media
              if (item.hasContentWarning && config.contentWarningPolicy === 'blur') {
                return (
                  <Link
                    key={i}
                    to={eventLink(item)}
                    className="aspect-square rounded-lg overflow-hidden block relative"
                  >
                    <div className="w-full h-full bg-muted/60 blur-lg" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ShieldAlert className="size-5 text-muted-foreground" />
                    </div>
                  </Link>
                );
              }

              const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(item.url);
              return (
                <Link
                  key={i}
                  to={eventLink(item)}
                  className="aspect-square rounded-lg overflow-hidden hover:opacity-80 transition-opacity block"
                >
                  {isVideo ? (
                    <video
                      src={item.url}
                      className="w-full h-full object-cover"
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
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
        <section className="mb-6">
          <h2 className="text-xl font-bold mb-3">Profile fields</h2>
          <div className="space-y-4">
            {fields.map((field, i) => (
              <ProfileFieldRow key={i} field={field} />
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-auto pt-4 pb-4 text-right">
        <p className="text-xs text-muted-foreground">
          Vibed with{' '}
          <a href="https://shakespeare.diy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            Shakespeare
          </a>
        </p>
      </footer>
    </aside>
  );
}
