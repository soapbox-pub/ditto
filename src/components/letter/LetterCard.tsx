import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Mail, MailOpen, Loader2, Lock, MoreHorizontal, Link2, Trash2, Braces } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { useDecryptLetter } from '@/hooks/useLetters';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useShareOrigin } from '@/hooks/useShareOrigin';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { FONT_OPTIONS, LETTER_KIND, LINE_HEIGHT_RATIO, type Letter } from '@/lib/letterTypes';
import { ensureLetterFonts } from '@/lib/letterUtils';
import { sanitizeCssString } from '@/lib/fontLoader';
import { StationeryBackground } from './StationeryBackground';
import { useStationeryColors } from '@/hooks/useStationeryColors';
import { LetterStickers } from './LetterStickers';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface LetterCardProps {
  letter: Letter;
  mode: 'inbox' | 'sent';
}

export function LetterCard({ letter, mode }: LetterCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const letterRef = useRef<HTMLDivElement>(null);
  const [lineHeightPx, setLineHeightPx] = useState(0);
  const otherPubkey = mode === 'inbox' ? letter.sender : letter.recipient;
  const author = useAuthor(otherPubkey);
  const { data: decrypted, isLoading: isDecrypting } = useDecryptLetter(letter);
  const content = decrypted?.content;
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const shareOrigin = useShareOrigin();

  const displayName = author.data?.metadata?.name || author.data?.metadata?.display_name || genUserName(otherPubkey);
  const avatar = author.data?.metadata?.picture;
  const npub = nip19.npubEncode(otherPubkey);

  const noteId = nip19.noteEncode(letter.event.id);
  const letterUrl = `${shareOrigin}/${noteId}`;
  const isOwnLetter = user?.pubkey === letter.sender;

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(letterUrl);
    toast({ description: 'Link copied to clipboard.' });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();

    const removeFn = (old: Letter[] | undefined) =>
      old ? old.filter((l) => l.event.id !== letter.event.id) : [];
    queryClient.setQueriesData<Letter[]>({ queryKey: ['letters-inbox'] }, removeFn);
    queryClient.setQueriesData<Letter[]>({ queryKey: ['letters-sent'] }, removeFn);

    publishEvent(
      {
        kind: 5,
        content: '',
        tags: [
          ['e', letter.event.id],
          ['k', String(LETTER_KIND)],
        ],
      },
      {
        onError: () => {
          queryClient.invalidateQueries({ queryKey: ['letters-inbox'] });
          queryClient.invalidateQueries({ queryKey: ['letters-sent'] });
        },
      }
    );
  };

  const effectiveStationery = decrypted?.stationery;
  const effectiveFrame = effectiveStationery?.frame;
  const effectiveFrameTint = effectiveStationery?.frameTint;

  const timeAgo = formatDistanceToNow(new Date(letter.timestamp * 1000), { addSuffix: true });

  const { text: textColor, faint: faintColor, line: lineColor } = useStationeryColors(effectiveStationery);
  // Sanitize event-sourced font family before CSS interpolation (M-6).
  const rawFont = effectiveStationery?.fontFamily
    ? sanitizeCssString(effectiveStationery.fontFamily)
    : undefined;
  const letterFontFamily = rawFont
    ? (rawFont.includes(',') ? rawFont : `${rawFont}, ${FONT_OPTIONS[0].family}`)
    : FONT_OPTIONS[0].family;

  // Lazy-load the letter's font when decrypted content is available
  useLayoutEffect(() => { ensureLetterFonts(letterFontFamily); }, [letterFontFamily]);

  useEffect(() => {
    const el = letterRef.current;
    if (!el) return;
    let raf: number;
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        setLineHeightPx(Math.round(w * LINE_HEIGHT_RATIO));
      });
    });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [hasOpened]);

  return (
    <div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this letter?</AlertDialogTitle>
            <AlertDialogDescription>
              This publishes a deletion request. It may not be removed from all relays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Envelope card */}
      <div className="relative">
        <button
          onClick={() => { setIsOpen(o => !o); setHasOpened(true); }}
          className={`
            w-full text-left group
            rounded-3xl overflow-hidden shadow-sm transition-all duration-200
            ${isOpen
              ? 'shadow-md ring-1 ring-primary/20'
              : 'hover:shadow-md hover:ring-1 hover:ring-primary/10'
            }
          `}
        >
          <StationeryBackground
            stationery={effectiveStationery}
            className="h-16 w-full relative"
          >
            <div className="absolute inset-x-0 bottom-0 h-4">
              <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="w-full h-full">
                <path d="M0 12 L50 1 L100 12 Z" fill="hsl(var(--card))" />
              </svg>
            </div>
          </StationeryBackground>

          <div className="bg-card px-4 pb-5 pt-1">
            <div className="flex items-center gap-3">
              {avatar ? (
                <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-background shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-secondary-foreground shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0 leading-none pt-1">
                <div className="truncate leading-none">
                  <span className="text-sm font-normal text-muted-foreground">{mode === 'inbox' ? 'from ' : 'to '}</span>
                  <Link
                    to={`/${npub}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-lg font-semibold text-foreground hover:text-primary transition-colors"
                  >{displayName}</Link>
                </div>
                <span className="text-xs text-muted-foreground leading-none mt-0.5 block">{timeAgo}</span>
              </div>
              {isOpen ? (
                <MailOpen className="w-8 h-8 text-primary shrink-0 translate-y-0.5" strokeWidth={2} />
              ) : (
                <Mail className="w-8 h-8 text-muted-foreground shrink-0 translate-y-0.5" strokeWidth={2} />
              )}
            </div>
          </div>
        </button>

        {/* Menu — top right of card, only when open */}
        {isOpen && (
          <div className="absolute top-2 right-2 z-20">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopyLink}>
                  <Link2 className="w-4 h-4 mr-2" />
                  Copy link
                </DropdownMenuItem>
                {content && (
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
                    toast({ description: 'Decrypted JSON copied.' });
                  }}>
                    <Braces className="w-4 h-4 mr-2" />
                    Copy decrypted JSON
                  </DropdownMenuItem>
                )}
                {isOwnLetter && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Letter — expands below the card */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: isOpen ? '800px' : '0',
          transition: 'max-height 0.3s ease-in-out',
        }}
        aria-hidden={!isOpen}
      >
        <div style={{ padding: '8px 0 8px' }}>
          {hasOpened && (
            <div style={effectiveFrame && effectiveFrame !== 'none'
              ? { padding: '28px 28px 44px' }
              : { padding: '0 0 0' }
            }>
              <div ref={letterRef} className="relative" style={{ containerType: 'inline-size' }}>
                <StationeryBackground
                  stationery={effectiveStationery}
                  frame={effectiveFrame}
                  frameTint={effectiveFrameTint}
                  className="rounded-3xl shadow-inner shadow-black/5"
                >
                  <div
                    className="relative z-10 flex flex-col"
                    style={{ aspectRatio: '5 / 4', padding: '5cqw' }}
                  >
                    {isDecrypting ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2.5" style={{ color: faintColor }}>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-xs">unsealing...</span>
                        </div>
                      </div>
                    ) : content ? (
                      <>
                        <p
                          dir="auto"
                          className="whitespace-pre-wrap font-semibold tracking-wide overflow-hidden flex-1 min-h-0"
                          style={{
                            fontSize: '4.8cqw',
                            lineHeight: lineHeightPx > 0 ? `${lineHeightPx}px` : '8.4cqw',
                            letterSpacing: '0.06em',
                            paddingTop: '0.5cqw',
                            fontFamily: letterFontFamily,
                            color: textColor,
                            ...(lineHeightPx > 0 ? {
                              backgroundImage: `linear-gradient(to bottom, transparent ${lineHeightPx - 3}px, ${lineColor} ${lineHeightPx - 3}px)`,
                              backgroundSize: `100% ${lineHeightPx}px`,
                              backgroundRepeat: 'repeat-y',
                              maxHeight: `${lineHeightPx * 5}px`,
                            } : {}),
                            backgroundPosition: '0 0',
                          }}
                        >
                          {content.body}
                        </p>
                        {(content.closing || content.signature) && (
                          <div className="flex flex-col items-end" style={{ paddingTop: '6cqw', gap: '3cqw', paddingRight: '4cqw', fontFamily: letterFontFamily }}>
                            {content.closing && (
                              <p dir="auto" style={{ fontSize: '4.8cqw', color: textColor }}>{content.closing}</p>
                            )}
                            {content.signature && (
                              <p dir="auto" className="font-semibold" style={{ fontSize: '5cqw', color: textColor }}>{content.signature}</p>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2" style={{ color: faintColor }}>
                          <Lock className="w-5 h-5" />
                          <p className="text-xs italic">couldn't unseal this one</p>
                        </div>
                      </div>
                    )}
                  </div>
                </StationeryBackground>

                {content?.stickers && content.stickers.length > 0 && (
                  <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none" style={{ zIndex: 20 }}>
                    <div className="relative w-full h-full">
                      <LetterStickers stickers={content.stickers} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
