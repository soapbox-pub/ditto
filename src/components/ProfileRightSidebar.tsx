import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Check, QrCode, ExternalLink, Bitcoin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/useToast';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import QRCode from 'qrcode';

interface ProfileField {
  label: string;
  value: string;
}

interface ProfileRightSidebarProps {
  pubkey: string;
  fields?: ProfileField[];
}

interface MediaItem {
  url: string;
  eventId: string;
  authorPubkey: string;
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

/** Hook to query media from a user's posts, returning URL + event ID pairs. */
function useProfileMedia(pubkey: string) {
  const { nostr } = useNostr();

  return useQuery<MediaItem[]>({
    queryKey: ['profile-media', pubkey],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [1], authors: [pubkey], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );

      const items: MediaItem[] = [];
      const seen = new Set<string>();

      for (const event of events) {
        const images = extractImageUrls(event.content);
        const videos = extractVideoUrls(event.content);
        for (const url of [...images, ...videos]) {
          if (!seen.has(url)) {
            seen.add(url);
            items.push({ url, eventId: event.id, authorPubkey: event.pubkey });
          }
        }
      }

      return items.slice(0, 9);
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });
}

/** Build a nevent link for navigating to an event. */
function eventLink(item: MediaItem): string {
  return `/${nip19.neventEncode({ id: item.eventId, author: item.authorPubkey })}`;
}

/** Try multiple favicon paths: /favicon.ico, then /favicon.svg. */
function Favicon({ url }: { url: string }) {
  const candidates = useMemo(() => {
    try {
      const origin = new URL(url).origin;
      return [`${origin}/favicon.ico`, `${origin}/favicon.svg`];
    } catch {
      return [];
    }
  }, [url]);

  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  if (candidates.length === 0 || failed) return null;

  const src = candidates[index];

  return (
    <img
      src={src}
      alt=""
      className="size-4 shrink-0"
      loading="lazy"
      onError={() => {
        if (index < candidates.length - 1) {
          setIndex(index + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
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
    <DialogContent className="sm:max-w-[360px] p-0 overflow-hidden rounded-2xl">
      <div className="bg-card p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="size-7 rounded-full bg-orange-500 flex items-center justify-center">
              <Bitcoin className="size-4 text-white" />
            </div>
            <span>Bitcoin</span>
            <a
              href={`https://mempool.space/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink className="size-4" />
            </a>
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
        <div className="space-y-2">
          <div className="bg-secondary/60 rounded-lg px-3 py-2.5 font-mono text-xs break-all leading-relaxed">
            {address}
          </div>
          <Button
            onClick={handleCopy}
            className="w-full rounded-lg font-semibold"
          >
            {copied ? <><Check className="size-4 mr-2" /> Copied</> : 'Copy address'}
          </Button>
        </div>
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
          <Favicon url={field.value} />
          <span className="truncate">{field.value.replace(/^https?:\/\//, '')}</span>
        </a>
      ) : (
        <p className="text-sm text-muted-foreground truncate">{field.value}</p>
      )}
    </div>
  );
}

export function ProfileRightSidebar({ pubkey, fields }: ProfileRightSidebarProps) {
  const { data: media, isLoading: mediaLoading } = useProfileMedia(pubkey);

  return (
    <aside className="w-[340px] shrink-0 hidden xl:flex flex-col sticky top-0 h-screen overflow-y-auto pt-6 pb-3 px-6">
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
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{ imageRendering: 'auto' }}
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
