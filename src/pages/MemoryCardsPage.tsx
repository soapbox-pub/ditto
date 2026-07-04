import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Gamepad2, ChevronRight } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { PageHeader } from '@/components/PageHeader';
import { KindInfoButton } from '@/components/KindInfoButton';
import { MemoryCardIcon } from '@/components/MemoryCardIcon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useMemoryCard, useMemoryCardGallery, type ResolvedCard } from '@/hooks/useMemoryCards';
import { getExtraKindDef } from '@/lib/extraKinds';
import { getDisplayName } from '@/lib/getDisplayName';
import { isNostrId } from '@/lib/nostrId';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { tryNpubEncode } from '@/lib/safeNip19';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import {
  type CardSummary,
  decodeBlockVisual,
  hexToBytes,
  regionFlag,
  tagVal,
} from '@/lib/memorycard';

const cardsDef = getExtraKindDef('cards')!;

/** Decode a route npub/nprofile (or raw hex) param to a hex pubkey. */
function decodePubkey(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    // fall through to hex check
  }
  return isNostrId(value) ? value : undefined;
}

/** Compact avatar + name that links to the author's profile. */
function AuthorRow({ pubkey, size = 'sm' }: { pubkey: string; size?: 'sm' | 'md' }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = getDisplayName(metadata, pubkey);
  const npub = tryNpubEncode(pubkey);
  const avatarClass = size === 'md' ? 'size-8' : 'size-5';

  const inner = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar className={avatarClass}>
        {metadata?.picture && <AvatarImage src={sanitizeUrl(metadata.picture)} alt="" />}
        <AvatarFallback className="text-[10px]">{name[0]?.toUpperCase() ?? '?'}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm text-muted-foreground">{name}</span>
    </span>
  );

  if (!npub) return inner;
  return (
    <Link
      to={`/${npub}`}
      className="min-w-0 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </Link>
  );
}

function GalleryCardTile({ card }: { card: CardSummary }) {
  const visual = useMemo(() => {
    if (!card.iconEvent) return null;
    try {
      return decodeBlockVisual(hexToBytes(card.iconEvent.content));
    } catch {
      return null;
    }
  }, [card.iconEvent]);

  const npub = tryNpubEncode(card.pubkey);
  const href = npub ? `/ps1/${npub}/${encodeURIComponent(card.cardId)}` : '#';
  const blockLabel = `${card.blocks.size} block${card.blocks.size === 1 ? '' : 's'}`;

  return (
    <Link
      to={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-border/80 hover:shadow-md"
    >
      <MemoryCardIcon frames={visual?.frames ?? null} size={52} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {card.name ? `${card.name} ` : ''}
          <span className="font-mono text-sm text-muted-foreground">{card.cardId}</span>
        </p>
        <div className="mt-0.5">
          <AuthorRow pubkey={card.pubkey} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{blockLabel}</p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function GalleryView() {
  const { data: cards, isLoading } = useMemoryCardGallery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Skeleton className="size-[52px] rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 px-8 text-center">
        <p className="mx-auto max-w-sm text-muted-foreground">
          No memory cards found on your relays yet. Cards are published as kind 38192 events — check
          back soon, or point Ditto at a relay that carries them.
        </p>
      </div>
    );
  }

  const authorCount = new Set(cards.map((c) => c.pubkey)).size;

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{cards.length}</span>{' '}
        card{cards.length === 1 ? '' : 's'} from{' '}
        <span className="font-semibold text-foreground">{authorCount}</span>{' '}
        author{authorCount === 1 ? '' : 's'}
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {cards.map((card) => (
          <GalleryCardTile key={`${card.pubkey}|${card.cardId}`} card={card} />
        ))}
      </div>
    </>
  );
}

function BlockSlot({ index, event }: { index: number; event: NostrEvent | undefined }) {
  const visual = useMemo(() => {
    if (!event) return null;
    try {
      return decodeBlockVisual(hexToBytes(event.content));
    } catch {
      return null;
    }
  }, [event]);

  if (!event) {
    return (
      <div className="relative flex min-h-[132px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
        <span className="absolute right-2.5 top-2 font-mono text-[11px] text-muted-foreground/70">#{index}</span>
        <span className="text-2xl opacity-40">+</span>
        <span className="text-xs">free</span>
      </div>
    );
  }

  const state = tagVal(event, 'state');
  const isContinuation = state === 'middle' || state === 'last';

  if (isContinuation || !visual) {
    return (
      <div className="relative flex min-h-[132px] flex-col justify-center rounded-xl border border-border bg-secondary/20 p-3">
        <span className="absolute right-2.5 top-2 font-mono text-[11px] text-muted-foreground/70">#{index}</span>
        <p className="text-sm text-muted-foreground">↳ continuation</p>
      </div>
    );
  }

  const filename = tagVal(event, 'filename');
  const region = tagVal(event, 'region');
  const flag = regionFlag(region, filename);
  const title = visual.title || tagVal(event, 'title') || '(untitled save)';

  return (
    <div className="relative flex min-h-[132px] flex-col rounded-xl border border-border bg-card p-3">
      <span className="absolute right-2.5 top-2 font-mono text-[11px] text-muted-foreground/70">#{index}</span>
      <div className="flex gap-2.5">
        <MemoryCardIcon frames={visual.frames} size={48} />
        <div className="min-w-0 flex-1 pr-4">
          <p className="line-clamp-3 break-words text-sm font-semibold leading-tight">{title}</p>
          {filename && <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{filename}</p>}
          {region && (
            <span className="mt-1.5 inline-block rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {flag ? `${flag} ` : ''}
              {region}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CardViewer({ pubkey, cardId }: { pubkey: string; cardId: string | undefined }) {
  const { data: card, isLoading } = useMemoryCard(pubkey, cardId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="min-h-[132px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!card) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 px-8 text-center">
        <p className="mx-auto max-w-sm text-muted-foreground">
          No card found for this key{cardId ? ` under card “${cardId}”` : ''}. It may not be published to
          your relays.
        </p>
      </div>
    );
  }

  return <CardGrid pubkey={pubkey} card={card} />;
}

function CardGrid({ pubkey, card }: { pubkey: string; card: ResolvedCard }) {
  const used = Object.keys(card.blocks).filter((n) => Number(n) >= 1).length;
  const hasHeader = !!card.blocks[0];

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-gradient-to-b from-secondary/40 to-card p-4">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-[10px] font-bold tracking-wide text-muted-foreground">
          {used}/15
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <span className="font-mono">{card.cardId}</span>
          </h2>
          <div className="mt-1">
            <AuthorRow pubkey={pubkey} size="md" />
          </div>
          <div className="mt-2 max-w-xs">
            <div className="h-2 overflow-hidden rounded-full border border-border bg-background">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(used / 15) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{used} of 15 save blocks used</p>
          </div>
        </div>
      </div>

      {/* Other cards by this author */}
      {card.cardIds.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Other cards:</span>
          {card.cardIds
            .filter((id) => id !== card.cardId)
            .map((id) => {
              const npub = tryNpubEncode(pubkey);
              return (
                <Link
                  key={id}
                  to={npub ? `/ps1/${npub}/${encodeURIComponent(id)}` : '#'}
                  className="rounded border border-border px-2 py-0.5 font-mono text-xs hover:bg-secondary"
                >
                  {id}
                </Link>
              );
            })}
        </div>
      )}

      {/* System block hint */}
      <p className="text-sm text-muted-foreground">
        🗂️{' '}
        {hasHeader
          ? 'System block 0: header and allocation table present.'
          : 'System block 0 not published — emulators may reject a reconstructed image.'}
      </p>

      {/* 15 save slots — capped at 3 columns so titles stay readable inside
          Ditto's narrow center column (2 cols on phones). */}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
          <BlockSlot key={n} index={n} event={card.blocks[n]} />
        ))}
      </div>
    </div>
  );
}

/**
 * Dedicated page for PlayStation 1 memory cards (NIP-XX kind 38192).
 *
 * - `/ps1` — Explore gallery of every card on the relay.
 * - `/ps1/:npub` — open that author's fullest card.
 * - `/ps1/:npub/:cardId` — open a specific card.
 *
 * Read-only: blocks decode to titles and animated icons straight from their raw
 * bytes; no signing or editing.
 */
export function MemoryCardsPage() {
  const { config } = useAppContext();
  const { npub, cardId: rawCardId } = useParams<{ npub?: string; cardId?: string }>();

  const pubkey = useMemo(() => decodePubkey(npub), [npub]);
  const cardId = rawCardId ? decodeURIComponent(rawCardId) : undefined;
  const viewing = !!npub;

  useSeoMeta({
    title: `Memory Cards | ${config.appName}`,
    description: 'PlayStation 1 memory cards shared over Nostr',
  });

  useLayoutOptions({ showFAB: false });

  return (
    <main className="flex-1 min-w-0">
      <PageHeader
        title="Memory Cards"
        icon={sidebarItemIcon('cards', 'size-5')}
        backTo={viewing ? '/ps1' : '/'}
        alwaysShowBack={viewing}
      >
        <KindInfoButton kindDef={cardsDef} icon={<Gamepad2 className="size-5" />} />
      </PageHeader>

      <div className="p-4">
        {viewing ? (
          pubkey ? (
            <CardViewer pubkey={pubkey} cardId={cardId} />
          ) : (
            <div className="rounded-xl border border-dashed border-border py-12 px-8 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                That doesn’t look like a valid npub.{' '}
                <Link to="/ps1" className="text-primary hover:underline">
                  Back to all cards
                </Link>
                .
              </p>
            </div>
          )
        ) : (
          <GalleryView />
        )}
      </div>
    </main>
  );
}

export default MemoryCardsPage;
