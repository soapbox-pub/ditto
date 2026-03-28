import { useState, useMemo, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { ArrowLeft, Loader2, Pencil, Send, Sticker, X } from 'lucide-react';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { FabButton } from '@/components/FabButton';
import { nip19 } from 'nostr-tools';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useStationeryColors } from '@/hooks/useStationeryColors';
import { toast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { backgroundTextColor } from '@/lib/colorUtils';
import {
  LETTER_KIND,
  FONT_OPTIONS,
  LINE_HEIGHT_RATIO,
  DEFAULT_STATIONERY_COLOR,
  resolveStationery,
  type Stationery,
  type FrameStyle,
  type LetterContent,
  type LetterSticker,
} from '@/lib/letterTypes';
import { useLetterPreferences } from '@/hooks/useLetterPreferences';
import { useThemeStationery } from '@/hooks/useThemeStationery';
import { useCustomEmojis } from '@/hooks/useCustomEmojis';
import { LetterEditor } from './LetterEditor';
import { LetterStickers } from './LetterStickers';
import { StickerPicker } from './StickerPicker';
import { DrawingCanvas } from './DrawingCanvas';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { StationeryBackground } from './StationeryBackground';
import { SendAnimation, useEnvelopeDimensions } from './SendAnimation';

/** Lightweight letter preview used inside the send animation */
function AnimationLetter({ content, width }: { content: LetterContent; width: number }) {
  const { text: textColor, line: lineColor } = useStationeryColors(content.stationery);
  const resolved = resolveStationery(content.stationery ?? { color: DEFAULT_STATIONERY_COLOR });
  const fontFamily = resolved.fontFamily ?? FONT_OPTIONS[0].family;
  const lh = Math.round(width * LINE_HEIGHT_RATIO);

  return (
    <div className="relative" style={{ containerType: 'inline-size', width }}>
      <StationeryBackground
        stationery={content.stationery}
        frame={content.stationery?.frame}
        frameTint={content.stationery?.frameTint}
        className="rounded-2xl"
      >
        <div className="relative z-10 flex flex-col" style={{ aspectRatio: '5 / 4', padding: '5cqw' }}>
          <p
            className="whitespace-pre-wrap font-semibold tracking-wide overflow-hidden flex-1 min-h-0"
            style={{
              fontSize: '4.8cqw',
              lineHeight: `${lh}px`,
              letterSpacing: '0.06em',
              paddingTop: '0.5cqw',
              fontFamily,
              color: textColor,
              backgroundImage: `linear-gradient(to bottom, transparent ${lh - 3}px, ${lineColor} ${lh - 3}px)`,
              backgroundSize: `100% ${lh}px`,
              backgroundRepeat: 'repeat-y',
              maxHeight: `${lh * 5}px`,
            }}
          >
            {content.body}
          </p>
          {content.closing && (
            <div className="flex flex-col items-end" style={{ paddingTop: '6cqw', gap: '3cqw', paddingRight: '4cqw', fontFamily }}>
              <p style={{ fontSize: '4.8cqw', color: textColor }}>{content.closing}</p>
            </div>
          )}
        </div>
      </StationeryBackground>
      {content.stickers && content.stickers.length > 0 && (
        <LetterStickers stickers={content.stickers} />
      )}
    </div>
  );
}

const BODY_MAX_LENGTH = 220;

/** Inline chip showing the selected recipient with avatar + name + optional clear. */
function SelectedRecipient({ pubkey, onClear }: { pubkey: string; onClear?: () => void }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name || genUserName(pubkey);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-muted/60 min-w-0">
      <Avatar className="size-6 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/15 text-[10px] font-bold text-primary">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <span className="text-base font-medium truncate">{displayName}</span>
      {onClear && (
        <button
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground shrink-0 transition-colors p-0.5"
        >
          <X className="size-4" strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

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

  const { prefs, isThemeDefault } = useLetterPreferences();
  const themeStationery = useThemeStationery();


  const [resolvedRecipient, setResolvedRecipient] = useState<string | undefined>(initialRecipient);
  const [body, setBody] = useState('');
  const [closing, setClosing] = useState(() => prefs.closing ?? 'Warmly,');
  const [signature, setSignature] = useState(() => prefs.signature ?? '');
  const [selectedFont, setSelectedFont] = useState(
    () => FONT_OPTIONS.find((f) => f.value === prefs.font) ?? FONT_OPTIONS[0],
  );
  // Start from the live theme stationery immediately — don't wait for encrypted settings.
  // If the user has saved a custom stationery preference, switch to it once prefs load.
  const [stationery, setStationery] = useState<Stationery>(themeStationery);
  const [frame, setFrame] = useState<FrameStyle>(() => prefs.frame ?? 'none');
  const [frameTint, setFrameTint] = useState(() => prefs.frameTint ?? false);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [stickers, setStickers] = useState<LetterSticker[]>([]);
  const { emojis: customEmojis } = useCustomEmojis();
  const [sealing, setSealing] = useState(false);
  const [sendAnimationContent, setSendAnimationContent] = useState<LetterContent | null>(null);
  const envDims = useEnvelopeDimensions();
  const animLetterW = envDims.letterW;

  // Once encrypted settings load, apply saved stationery preference (if any).
  // isThemeDefault is false only when the user has an explicit saved stationery.
  const prefsLoadedRef = useRef(false);
  useEffect(() => {
    if (prefsLoadedRef.current) return;
    if (!isThemeDefault && prefs.stationery) {
      setStationery(prefs.stationery as Stationery);
      prefsLoadedRef.current = true;
    } else if (isThemeDefault) {
      // Settings loaded and confirmed no override — stay with theme stationery.
      // Keep the live theme stationery in sync if the theme changes.
      prefsLoadedRef.current = true;
    }
  }, [isThemeDefault, prefs.stationery]);

  // Keep stationery in sync with the live theme when using the theme default.
  // If the user has explicitly chosen a stationery in this session, don't override it.
  const userPickedStationery = useRef(false);
  const handleSetStationery = useCallback((s: Stationery) => {
    userPickedStationery.current = true;
    setStationery(s);
  }, []);

  useEffect(() => {
    if (!userPickedStationery.current && isThemeDefault) {
      setStationery(themeStationery);
    }
  }, [themeStationery, isThemeDefault]);

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

      setSendAnimationContent(letterContent);
    } catch (err) {
      console.error('Failed to send letter:', err);
      setSealing(false);
      toast({ title: "couldn't send that one", variant: 'destructive' });
    }
  };

  const recipientAuthor = useAuthor(resolvedRecipient);
  const recipientName = recipientAuthor.data?.metadata?.display_name
    || recipientAuthor.data?.metadata?.name
    || (resolvedRecipient ? genUserName(resolvedRecipient) : 'friend');

  const resolvedSt = useMemo(() => resolveStationery(stationery ?? { color: DEFAULT_STATIONERY_COLOR }), [stationery]);
  const bgColor = resolvedSt.color ?? DEFAULT_STATIONERY_COLOR;
  const primaryColor = resolvedSt.primaryColor ?? '#7c52e0';
  const textColor = resolvedSt.textColor ?? backgroundTextColor(bgColor);

  // Memoize the animation letter element — only recompute when content or width changes.
  // Uses sendAnimationContent directly (not a ref) so deps are exhaustive.
  const animLetterElement = useMemo(
    () => sendAnimationContent
      ? <AnimationLetter content={sendAnimationContent} width={animLetterW} />
      : <AnimationLetter content={{ body: '' }} width={animLetterW} />,
    [sendAnimationContent, animLetterW],
  );

  return (
    <>
      {/* Pre-render letter hidden so images/fonts are loaded before animation fires */}
      <div aria-hidden className="absolute opacity-0 pointer-events-none" style={{ width: animLetterW, top: -9999 }}>
        <AnimationLetter content={buildLetterContent()} width={animLetterW} />
      </div>
      {sendAnimationContent && (
        <SendAnimation
          letterElement={animLetterElement}
          letterWidth={animLetterW}
          recipientName={recipientName}
          recipientPicture={recipientAuthor.data?.metadata?.picture}
          bgColor={bgColor}
          primaryColor={primaryColor}
          textColor={textColor}
          onComplete={onClose}
        />
      )}
      <div
        ref={bodyAreaRef}
        className="absolute inset-0 z-40 bg-background flex flex-col overflow-y-auto"
        style={sendAnimationContent ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
      >
      <LetterEditor
        state={{
          selectedFont, setSelectedFont,
          stationery, setStationery: handleSetStationery,
          frame, setFrame,
          frameTint, setFrameTint,
          closing, setClosing,
          signature, setSignature,
        }}
        overlay={overlay}
        setOverlay={(o) => setOverlay(o as Overlay)}
        renderToolbarButtons={(buttons: ReactNode, drawer: ReactNode) => (
          <div className="sticky top-0 z-20">
            {drawer}
            <SubHeaderBar className="relative !top-0">
              <button
                onClick={onClose}
                className="pl-3 pr-1 py-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="size-5" />
              </button>
              {buttons}
            </SubHeaderBar>
          </div>
        )}
        extraButtons={
          <>
            {customEmojis.length > 0 && (
              <TabButton
                label="Stickers"
                active={overlay === 'sticker'}
                onClick={() => setOverlay(overlay === 'sticker' ? 'none' : 'sticker')}
              >
                <Sticker className="h-5 w-5" strokeWidth={2.5} />
              </TabButton>
            )}
            <TabButton
              label="Draw"
              active={overlay === 'draw'}
              onClick={() => setOverlay(overlay === 'draw' ? 'none' : 'draw')}
            >
              <Pencil className="h-5 w-5" strokeWidth={2.5} />
            </TabButton>
          </>
        }
        extraDrawerContent={
          <>
            {overlay === 'sticker' && <StickerPicker onSelect={handleAddSticker} />}
            {overlay === 'draw' && <DrawingCanvas onConfirm={handleAddDrawing} onCancel={() => setOverlay('none')} />}
          </>
        }
        beforeCard={
          <div className="max-w-xl mx-auto w-full px-5 pb-2 pt-4 max-sidebar:pt-[calc(20px+2.5rem)]">
            <div className="flex items-center">
              <span className="text-sm font-medium text-muted-foreground shrink-0 w-14">To</span>
              {!initialRecipient && !resolvedRecipient ? (
                <div className="flex-1">
                  <ProfileSearchDropdown
                    placeholder="search for a person..."
                    onSelect={(profile) => setResolvedRecipient(profile.pubkey)}
                    hideCountry
                    className="w-full"
                    inputClassName="rounded-2xl bg-muted/60 border-0 focus-visible:ring-2 focus-visible:ring-primary/20 text-base h-auto py-2"
                  />
                </div>
              ) : (
                <SelectedRecipient
                  pubkey={resolvedRecipient ?? initialRecipient!}
                  onClear={initialRecipient ? undefined : () => setResolvedRecipient(undefined)}
                />
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

      {/* Send FAB — fixed bottom right, matches app FAB style */}
      <div className="fixed bottom-fab right-6 z-30 sidebar:hidden">
        <FabButton
          onClick={handleSend}
          disabled={!canSend || sealing}
          title="Send letter"
          icon={sealing
            ? <Loader2 size={18} className="animate-spin" />
            : <Send strokeWidth={3} size={18} />
          }
        />
      </div>
      {/* Desktop FAB — sticky within column */}
      <div className="hidden sidebar:block sticky bottom-6 z-30 pointer-events-none">
        <div className="flex justify-end pr-4">
          <div className="pointer-events-auto">
            <FabButton
              onClick={handleSend}
              disabled={!canSend || sealing}
              title="Send letter"
              icon={sealing
                ? <Loader2 size={18} className="animate-spin" />
                : <Send strokeWidth={3} size={18} />
              }
            />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
