import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { Gamepad2, ChevronRight, Copy, Download, Files, Loader2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { PageHeader } from '@/components/PageHeader';
import { KindInfoButton } from '@/components/KindInfoButton';
import { MemoryCardIcon } from '@/components/MemoryCardIcon';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeedTab } from '@/hooks/useFeedTab';
import {
  useMemoryCard,
  useMemoryCardGallery,
  type GalleryTab,
  type ResolvedCard,
} from '@/hooks/useMemoryCards';
import { useMemoryCardActions } from '@/hooks/useMemoryCardActions';
import { toast } from '@/hooks/useToast';
import { getExtraKindDef } from '@/lib/extraKinds';
import { getDisplayName } from '@/lib/getDisplayName';
import { isNostrId } from '@/lib/nostrId';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { tryNpubEncode } from '@/lib/safeNip19';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import {
  type CardSummary,
  decodeBlockVisual,
  hexToBytes,
  regionFlag,
  tagVal,
  validateCardId,
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

/**
 * A single save slot inside a memory-card tile's preview screen. Renders the
 * save's animated icon when the block decodes to one, a lit dot for a
 * continuation block, or a dim empty frame for a free slot.
 */
function CardSlot({ index, event }: { index: number; event: NostrEvent | undefined }) {
  const visual = useMemo(() => {
    if (!event) return null;
    try {
      return decodeBlockVisual(hexToBytes(event.content));
    } catch {
      return null;
    }
  }, [event]);

  if (visual) {
    return (
      <MemoryCardIcon
        frames={visual.frames}
        size={30}
        className="rounded-[3px] border-white/15 shadow-[0_0_6px_rgba(80,180,255,0.25)]"
      />
    );
  }

  const filled = !!event; // continuation block: occupied but no icon of its own
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-[30px] shrink-0 items-center justify-center rounded-[3px] border',
        filled
          ? 'border-cyan-300/30 bg-cyan-300/10'
          : 'border-dashed border-white/10 bg-white/[0.02]',
      )}
    >
      {filled && <div className="size-1.5 rounded-full bg-cyan-300/50" />}
      <span className="sr-only">Slot {index}</span>
    </div>
  );
}

/**
 * Gallery tile styled after the PlayStation 1 BIOS memory-card manager: a dark
 * CRT "screen" showing the card's 15 save slots as animated icons, framed by a
 * plastic card body with a gold connector strip, and author/usage meta below.
 */
function MemoryCardTile({ card }: { card: CardSummary }) {
  const npub = tryNpubEncode(card.pubkey);
  const href = npub ? `/memory-cards/${npub}/${encodeURIComponent(card.cardId)}` : '#';
  const used = card.blocks.size - (card.blocks.has(0) ? 1 : 0);

  return (
    <Link
      to={href}
      className="group block rounded-2xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Plastic memory-card body */}
      <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-gradient-to-b from-slate-800 to-slate-950 shadow-inner">
        {/* Gold connector strip */}
        <div className="flex h-2.5 items-stretch gap-[3px] bg-slate-900/80 px-3 py-[3px]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-[1px] bg-gradient-to-b from-amber-300/80 to-amber-500/60" />
          ))}
        </div>

        {/* CRT screen with the 5×3 slot grid */}
        <div className="relative p-3">
          {/* Scanline overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to bottom, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 3px)',
            }}
          />
          <div className="relative grid grid-cols-5 justify-items-center gap-2">
            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
              <CardSlot key={n} index={n} event={card.slots[n]} />
            ))}
          </div>
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3 flex items-center gap-2 px-0.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">
            {card.name ? `${card.name} ` : ''}
            <span className="font-mono text-xs text-muted-foreground">{card.cardId}</span>
          </p>
          <div className="mt-0.5">
            <AuthorRow pubkey={card.pubkey} />
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
          {used}/15
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

const GALLERY_EMPTY: Record<GalleryTab, string> = {
  mine: 'You haven’t published any memory cards yet. Clone a card or copy a save block to make one.',
  follows: 'None of the people you follow have shared a memory card yet. Try the Global tab.',
  global:
    'No memory cards found on your relays yet. Cards are published as kind 38192 events — check back soon, or point Ditto at a relay that carries them.',
};

function GalleryView({ tab }: { tab: GalleryTab }) {
  const { data: cards, isLoading, isPending } = useMemoryCardGallery(tab);

  if (isLoading || isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border p-3">
            <Skeleton className="h-[132px] w-full rounded-xl" />
            <div className="mt-3 flex items-center gap-2">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!cards || cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 px-8 text-center">
        <p className="mx-auto max-w-sm text-muted-foreground">{GALLERY_EMPTY[tab]}</p>
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <MemoryCardTile key={`${card.pubkey}|${card.cardId}`} card={card} />
        ))}
      </div>
    </>
  );
}

interface BlockSlotProps {
  index: number;
  event: NostrEvent | undefined;
  /** Copy this filled block into the user's card. Omit to hide (logged out). */
  onCopy?: (index: number, event: NostrEvent) => void;
  /** Download this filled block's raw 8 KB `.bin`. */
  onDownload?: (index: number, event: NostrEvent) => void;
}

/** Hover/focus action row for a filled block. */
function BlockActions({
  index,
  event,
  onCopy,
  onDownload,
}: {
  index: number;
  event: NostrEvent;
  onCopy?: (index: number, event: NostrEvent) => void;
  onDownload: (index: number, event: NostrEvent) => void;
}) {
  const btn =
    'inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary';
  return (
    <div className="mt-auto flex gap-1 pt-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <button
        type="button"
        className={btn}
        onClick={(e) => {
          e.stopPropagation();
          onDownload(index, event);
        }}
      >
        <Download className="size-3" /> .bin
      </button>
      {onCopy && (
        <button
          type="button"
          className={btn}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(index, event);
          }}
        >
          <Copy className="size-3" /> copy
        </button>
      )}
    </div>
  );
}

function BlockSlot({ index, event, onCopy, onDownload }: BlockSlotProps) {
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
      <div className="group relative flex min-h-[132px] flex-col rounded-xl border border-border bg-secondary/20 p-3">
        <span className="absolute right-2.5 top-2 font-mono text-[11px] text-muted-foreground/70">#{index}</span>
        <p className="text-sm text-muted-foreground">↳ continuation</p>
        {onDownload && <BlockActions index={index} event={event} onCopy={onCopy} onDownload={onDownload} />}
      </div>
    );
  }

  const filename = tagVal(event, 'filename');
  const region = tagVal(event, 'region');
  const flag = regionFlag(region, filename);
  const title = visual.title || tagVal(event, 'title') || '(untitled save)';

  return (
    <div className="group relative flex min-h-[132px] flex-col rounded-xl border border-border bg-card p-3">
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
      {onDownload && <BlockActions index={index} event={event} onCopy={onCopy} onDownload={onDownload} />}
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

  const { canManage, myPubkey, publishBlock, cloneCard, downloadCard, downloadBlock } =
    useMemoryCardActions();
  const mine = canManage && myPubkey === pubkey;

  const [cloneOpen, setCloneOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState<{ index: number; event: NostrEvent } | null>(null);

  const handleDownloadCard = async () => {
    try {
      const { present, hasHeader: header } = await downloadCard(card.cardId, card.blocks);
      toast({
        title: `Downloaded ${card.cardId}.mcd`,
        description: header
          ? `${present}/16 blocks written.`
          : `${present}/16 blocks — block 0 missing, so emulators may reject it.`,
      });
    } catch (e) {
      toast({ title: 'Download failed', description: String(e), variant: 'destructive' });
    }
  };

  const handleDownloadBlock = async (index: number, event: NostrEvent) => {
    try {
      await downloadBlock(card.cardId, index, event);
    } catch (e) {
      toast({ title: 'Download failed', description: String(e), variant: 'destructive' });
    }
  };

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
            {mine && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                your card
              </span>
            )}
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

      {/* Card-level actions — their own row so they never crowd the banner meta */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleDownloadCard}>
          <Download className="mr-1.5 size-4" />
          Download .mcd
        </Button>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setCloneOpen(true)}>
            <Files className="mr-1.5 size-4" />
            {mine ? 'Duplicate card' : 'Clone to my card'}
          </Button>
        )}
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
                  to={npub ? `/memory-cards/${npub}/${encodeURIComponent(id)}` : '#'}
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
          <BlockSlot
            key={n}
            index={n}
            event={card.blocks[n]}
            onDownload={handleDownloadBlock}
            onCopy={canManage ? (index, event) => setCopyTarget({ index, event }) : undefined}
          />
        ))}
      </div>

      {cloneOpen && (
        <CloneCardDialog
          card={card}
          mine={mine}
          myPubkey={myPubkey}
          cloneCard={cloneCard}
          onClose={() => setCloneOpen(false)}
        />
      )}
      {copyTarget && (
        <CopyBlockDialog
          source={copyTarget.event}
          defaultBlock={copyTarget.index}
          defaultCardId={mine ? card.cardId : 'main'}
          myPubkey={myPubkey}
          publishBlock={publishBlock}
          onClose={() => setCopyTarget(null)}
        />
      )}
    </div>
  );
}

/** Dialog: copy a single block into one of the user's cards. */
function CopyBlockDialog({
  source,
  defaultBlock,
  defaultCardId,
  myPubkey,
  publishBlock,
  onClose,
}: {
  source: NostrEvent;
  defaultBlock: number;
  defaultCardId: string;
  myPubkey: string | undefined;
  publishBlock: (source: NostrEvent, cardId: string, block: number) => Promise<void>;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [cardId, setCardId] = useState(defaultCardId);
  const [block, setBlock] = useState(String(defaultBlock));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const id = cardId.trim();
    const err = validateCardId(id);
    if (err) {
      toast({ title: err, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await publishBlock(source, id, Number(block));
      toast({ title: 'Block copied', description: `Published to “${id}” at block #${block}.` });
      const npub = tryNpubEncode(myPubkey ?? '');
      onClose();
      if (npub) navigate(`/memory-cards/${npub}/${encodeURIComponent(id)}`);
    } catch (e) {
      toast({ title: 'Copy failed', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy save block to your card</DialogTitle>
          <DialogDescription>
            Publishes this block under your key. The save bytes stay identical, so its integrity tag
            remains valid.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="mc-copy-card">Write to card id</Label>
            <Input
              id="mc-copy-card"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
              placeholder="e.g. main"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mc-copy-block">Target block</Label>
            <select
              id="mc-copy-block"
              value={block}
              onChange={(e) => setBlock(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Block #{n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Copy block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog: clone every block of a card into a card under the user's key. */
function CloneCardDialog({
  card,
  mine,
  myPubkey,
  cloneCard,
  onClose,
}: {
  card: ResolvedCard;
  mine: boolean;
  myPubkey: string | undefined;
  cloneCard: (blocks: Record<number, NostrEvent>, cardId: string) => Promise<number>;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const blockCount = Object.keys(card.blocks).length;
  const [cardId, setCardId] = useState(mine ? `${card.cardId}-copy` : card.cardId);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const id = cardId.trim();
    const err = validateCardId(id);
    if (err) {
      toast({ title: err, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const ok = await cloneCard(card.blocks, id);
      toast({
        title: 'Card cloned',
        description: `Published ${ok} block${ok === 1 ? '' : 's'} to “${id}”.`,
      });
      const npub = tryNpubEncode(myPubkey ?? '');
      onClose();
      if (npub) navigate(`/memory-cards/${npub}/${encodeURIComponent(id)}`);
    } catch (e) {
      toast({ title: 'Clone failed', description: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mine ? 'Duplicate this card' : 'Clone to your card'}</DialogTitle>
          <DialogDescription>
            Re-publishes all {blockCount} block{blockCount === 1 ? '' : 's'} under your key. Your
            signer prompts once per block. Publishing to a card id you already use overwrites its
            blocks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="mc-clone-card">Write to card id</Label>
          <Input
            id="mc-clone-card"
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            placeholder="e.g. main"
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {`Publish ${blockCount} block${blockCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dedicated page for PlayStation 1 memory cards (kind 38192).
 *
 * - `/memory-cards` — Explore gallery of every card on the relay.
 * - `/memory-cards/:npub` — open that author's fullest card.
 * - `/memory-cards/:npub/:cardId` — open a specific card.
 *
 * Read-only: blocks decode to titles and animated icons straight from their raw
 * bytes; no signing or editing.
 */
export function MemoryCardsPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { npub, cardId: rawCardId } = useParams<{ npub?: string; cardId?: string }>();

  const pubkey = useMemo(() => decodePubkey(npub), [npub]);
  const cardId = rawCardId ? decodeURIComponent(rawCardId) : undefined;
  const viewing = !!npub;

  const [storedTab, setActiveTab] = useFeedTab<GalleryTab>(
    'memory-cards',
    ['mine', 'follows', 'global'],
    'global',
  );
  // Author-scoped tabs need a logged-in user; fall back to Global otherwise.
  const activeTab: GalleryTab = user ? storedTab : 'global';

  useSeoMeta({
    title: `Memory Cards | ${config.appName}`,
    description: 'PlayStation 1 memory cards shared over Nostr',
  });

  useLayoutOptions({ showFAB: false, hasSubHeader: !viewing });

  return (
    <main className="flex-1 min-w-0">
      <PageHeader
        title="Memory Cards"
        icon={sidebarItemIcon('cards', 'size-5')}
        backTo={viewing ? '/memory-cards' : '/'}
        alwaysShowBack={viewing}
      >
        <KindInfoButton kindDef={cardsDef} icon={<Gamepad2 className="size-5" />} />
      </PageHeader>

      {viewing ? (
        <div className="p-4">
          {pubkey ? (
            <CardViewer pubkey={pubkey} cardId={cardId} />
          ) : (
            <div className="rounded-xl border border-dashed border-border py-12 px-8 text-center">
              <p className="mx-auto max-w-sm text-muted-foreground">
                That doesn’t look like a valid npub.{' '}
                <Link to="/memory-cards" className="text-primary hover:underline">
                  Back to all cards
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          <SubHeaderBar>
            <TabButton
              label="Mine"
              active={activeTab === 'mine'}
              onClick={() => setActiveTab('mine')}
              disabled={!user}
            />
            <TabButton
              label="Follows"
              active={activeTab === 'follows'}
              onClick={() => setActiveTab('follows')}
              disabled={!user}
            />
            <TabButton
              label="Global"
              active={activeTab === 'global'}
              onClick={() => setActiveTab('global')}
            />
          </SubHeaderBar>

          <div style={{ height: ARC_OVERHANG_PX }} />

          <div className="p-4">
            <GalleryView tab={activeTab} />
          </div>
        </>
      )}
    </main>
  );
}

export default MemoryCardsPage;
