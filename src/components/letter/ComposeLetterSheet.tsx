import { useState, useMemo, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import { ArrowLeft, Pencil, Sticker } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import {
  LETTER_KIND,
  FONT_OPTIONS,
  type Stationery,
  type FrameStyle,
  type LetterContent,
  type LetterSticker,
  presetToStationery,
} from '@/lib/letterTypes';
import { useLetterPreferences } from '@/hooks/useLetterPreferences';
import { useCustomEmojis } from '@/hooks/useCustomEmojis';
import { LetterEditor } from './LetterEditor';
import { LetterStickers } from './LetterStickers';
import { StickerPicker } from './StickerPicker';
import { DrawingCanvas } from './DrawingCanvas';
import { LetterRecipientInput } from './LetterRecipientInput';

const BODY_MAX_LENGTH = 220;

type Overlay = 'none' | 'font' | 'stationery' | 'frame' | 'sticker' | 'draw';

interface ComposeLetterSheetProps {
  onClose: () => void;
  toPubkey?: string;
}

export function ComposeLetterSheet({ onClose, toPubkey }: ComposeLetterSheetProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyAreaRef = useRef<HTMLDivElement>(null);

  const initialRecipient = useMemo(() => {
    if (!toPubkey) return undefined;
    try {
      if (toPubkey.startsWith('npub1')) {
        const d = nip19.decode(toPubkey);
        if (d.type === 'npub') return d.data;
      }
      if (/^[0-9a-f]{64}$/i.test(toPubkey)) return toPubkey;
    } catch { /* ignore */ }
    return undefined;
  }, [toPubkey]);

  const { prefs } = useLetterPreferences();

  const [resolvedRecipient, setResolvedRecipient] = useState<string | undefined>(initialRecipient);
  const [body, setBody] = useState('');
  const [closing, setClosing] = useState(() => prefs.closing ?? 'Warmly,');
  const [signature, setSignature] = useState(() => prefs.signature ?? '');
  const [selectedFont, setSelectedFont] = useState(
    () => FONT_OPTIONS.find((f) => f.value === prefs.font) ?? FONT_OPTIONS[0],
  );
  const [stationery, setStationery] = useState<Stationery>(
    () => (prefs.stationery as Stationery) ?? presetToStationery('parchment') ?? { color: '#F5E6D3' },
  );
  const [frame, setFrame] = useState<FrameStyle>(() => prefs.frame ?? 'none');
  const [frameTint, setFrameTint] = useState(() => prefs.frameTint ?? false);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [stickers, setStickers] = useState<LetterSticker[]>([]);
  const { emojis: customEmojis } = useCustomEmojis();
  const [sealing, setSealing] = useState(false);
  const [flyingAway, setFlyingAway] = useState(false);
  const [sent, setSent] = useState(false);

  const recipientAuthor = useAuthor(resolvedRecipient);
  const recipientName = recipientAuthor.data?.metadata?.display_name
    || recipientAuthor.data?.metadata?.name
    || (resolvedRecipient ? genUserName(resolvedRecipient) : 'friend');

  const [textareaPadPx, setTextareaPadPx] = useState(0);
  useEffect(() => {
    const el = bodyAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
      setTextareaPadPx(Math.ceil(w * 0.005));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canSend = !!resolvedRecipient && body.trim().length > 0 && !!user;

  const handleAddSticker = useCallback((emoji: { shortcode: string; url: string }) => {
    setStickers((prev) => [
      ...prev,
      {
        url: emoji.url,
        shortcode: emoji.shortcode,
        x: 20 + Math.random() * 60,
        y: 20 + Math.random() * 60,
        rotation: -15 + Math.random() * 30,
      },
    ]);
    setOverlay('none');
  }, []);

  const handleAddDrawing = useCallback((svg: string) => {
    setStickers((prev) => [
      ...prev,
      {
        url: '',
        shortcode: 'drawing',
        svg,
        x: 20 + Math.random() * 60,
        y: 20 + Math.random() * 60,
        rotation: -15 + Math.random() * 30,
      },
    ]);
    setOverlay('none');
  }, []);

  const handleUpdateSticker = useCallback((index: number, patch: Partial<LetterSticker>) => {
    setStickers((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }, []);

  const handleRemoveSticker = useCallback((index: number) => {
    setStickers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const buildLetterContent = useCallback((): LetterContent => {
    const finalStationery: Stationery = {
      ...stationery,
      ...(selectedFont.family !== FONT_OPTIONS[0].family
        ? { fontFamily: selectedFont.family }
        : {}),
      ...(frame && frame !== 'none' ? { frame } : {}),
      ...(frame && frame !== 'none' && frameTint ? { frameTint: true } : {}),
    };
    return {
      body: body.trim(),
      ...(closing.trim() ? { closing: closing.trim() } : {}),
      ...(signature.trim() ? { signature: signature.trim() } : {}),
      ...(stickers.length > 0 ? { stickers } : {}),
      stationery: finalStationery,
    };
  }, [body, closing, signature, stickers, stationery, selectedFont, frame, frameTint]);

  const handleSend = async () => {
    if (!canSend || !user || !resolvedRecipient) return;
    if (!user.signer.nip44) {
      toast({ title: "your signer doesn't support encryption yet", variant: 'destructive' });
      return;
    }

    setSealing(true);

    try {
      const letterContent = buildLetterContent();
      const encrypted = await user.signer.nip44.encrypt(
        resolvedRecipient,
        JSON.stringify(letterContent)
      );

      const tags: string[][] = [
        ['p', resolvedRecipient],
        ['alt', 'Encrypted letter'],
      ];

      await createEvent({ kind: LETTER_KIND, content: encrypted, tags });
      queryClient.invalidateQueries({ queryKey: ['letters-sent'] });
      queryClient.invalidateQueries({ queryKey: ['letters-inbox'] });

      setFlyingAway(true);
      await new Promise((r) => setTimeout(r, 420));
      setSent(true);
      setTimeout(onClose, 1800);
    } catch (err) {
      console.error('Failed to send letter:', err);
      setSealing(false);
      setFlyingAway(false);
      toast({ title: "couldn't send that one", variant: 'destructive' });
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 px-8">
          <div className="text-6xl animate-bounce">✉️</div>
          <p className="text-xl font-semibold">letter sent!</p>
          <p className="text-muted-foreground">your letter is on its way to {recipientName}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={bodyAreaRef} className="min-h-screen bg-background flex flex-col">
      <LetterEditor
        state={{
          selectedFont, setSelectedFont,
          stationery, setStationery,
          frame, setFrame,
          frameTint, setFrameTint,
          closing, setClosing,
          signature, setSignature,
        }}
        overlay={overlay}
        setOverlay={(o) => setOverlay(o as Overlay)}
        headerLeft={
          <button
            onClick={onClose}
            className="p-2.5 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
          </button>
        }
        extraButtons={
          <>
            {customEmojis.length > 0 && (
              <button
                onClick={() => setOverlay(overlay === 'sticker' ? 'none' : 'sticker')}
                className={`p-2.5 rounded-2xl transition-colors ${
                  overlay === 'sticker'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title="stickers"
              >
                <Sticker className="h-6 w-6" strokeWidth={2.5} />
              </button>
            )}
            <button
              onClick={() => setOverlay(overlay === 'draw' ? 'none' : 'draw')}
              className={`p-2.5 rounded-2xl transition-colors ${
                overlay === 'draw'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="draw sticker"
            >
              <Pencil className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </>
        }
        extraDrawerContent={
          <>
            {overlay === 'sticker' && <StickerPicker onSelect={handleAddSticker} />}
            {overlay === 'draw' && <DrawingCanvas onConfirm={handleAddDrawing} onCancel={() => setOverlay('none')} />}
          </>
        }
        beforeCard={
          <div className="max-w-xl mx-auto w-full px-5 pt-4 pb-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground shrink-0 w-14">To</span>
              {!initialRecipient ? (
                <div className="flex-1">
                  <LetterRecipientInput
                    onSelect={(pubkey) => setResolvedRecipient(pubkey)}
                    initialNpub={resolvedRecipient ? nip19.npubEncode(resolvedRecipient) : undefined}
                    friendsOnly={prefs.friendsOnlySearch}
                  />
                </div>
              ) : (
                <span className="text-sm font-semibold text-foreground">
                  {nip19.npubEncode(initialRecipient).slice(0, 16)}...
                </span>
              )}
            </div>
          </div>
        }
        bodyContent={({ lineHeightPx, stationeryTextColor: textColor, stationeryLineColor: lineColor, resolvedFontFamily: fontFamily }) => (
          <textarea
            ref={textareaRef}
            value={body}
            onFocus={() => setOverlay('none')}
            onChange={(e) => {
              const el = e.target;
              const next = e.target.value;
              if (next.length > BODY_MAX_LENGTH) {
                el.value = body;
                return;
              }
              if (next.length > body.length && el.scrollHeight > el.clientHeight) {
                el.value = body;
                return;
              }
              setBody(next);
            }}
            maxLength={BODY_MAX_LENGTH}
            placeholder="dear friend..."
            className="w-full flex-1 min-h-0 border-none shadow-none resize-none overflow-hidden focus:outline-none font-semibold tracking-wide"
            style={{
              paddingTop: '0.5cqw',
              paddingBottom: 0,
              fontSize: '4.8cqw',
              lineHeight: lineHeightPx > 0 ? `${lineHeightPx}px` : '8.4cqw',
              ...(lineHeightPx > 0 ? { maxHeight: `${lineHeightPx * 5 + textareaPadPx}px` } : {}),
              letterSpacing: '0.06em',
              fontFamily,
              color: textColor,
              caretColor: textColor,
              backgroundColor: 'transparent',
              ...(lineHeightPx > 0 ? {
                backgroundImage: `linear-gradient(to bottom, transparent ${lineHeightPx - 3}px, ${lineColor} ${lineHeightPx - 3}px)`,
                backgroundSize: `100% ${lineHeightPx}px`,
                backgroundRepeat: 'repeat-y',
              } : {}),
            }}
          />
        )}
        cardOverlay={
          <LetterStickers
            stickers={stickers}
            editable
            onUpdate={handleUpdateSticker}
            onRemove={handleRemoveSticker}
            containerRef={bodyAreaRef}
          />
        }
      />

      {/* Send button — fixed to bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-6">
        <button
          onClick={handleSend}
          disabled={!canSend || sealing}
          style={{
            WebkitTapHighlightColor: 'transparent',
            ...(flyingAway
              ? {
                  animation: 'none',
                  transform: 'translateY(-100vh) scale(0.8)',
                  transition: 'transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)',
                  pointerEvents: 'none' as const,
                }
              : !canSend || sealing
                ? {
                    transform: 'translateY(8px)',
                    opacity: 0.5,
                    transition: 'transform 0.3s ease-out, opacity 0.3s ease',
                  }
                : {}
            ),
          } as CSSProperties}
          className="group relative disabled:cursor-not-allowed"
        >
          <div className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg shadow-lg transition-all duration-150 ${
            canSend && !sealing
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-1 active:scale-95 active:translate-y-0'
              : 'bg-muted text-muted-foreground'
          }`}>
            {sealing ? (
              <>
                <span className="animate-spin">✉️</span>
                <span>sealing...</span>
              </>
            ) : (
              <>
                <span>✉️</span>
                <span>send letter</span>
              </>
            )}
          </div>
        </button>
      </div>

      {/* Bottom padding so content doesn't hide behind the send button */}
      <div className="h-28" />
    </div>
  );
}
