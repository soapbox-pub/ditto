import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Sparkles, RotateCcw } from 'lucide-react';

import { useLetterPreferences } from '@/hooks/useLetterPreferences';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  FONT_OPTIONS,
  type Stationery,
  type FrameStyle,
  type SerializableStationery,
} from '@/lib/letterTypes';
import { LetterEditor, type BaseOverlay } from './LetterEditor';

/** Strip the non-serializable `event` field before persisting */
function toSerializable(s: Stationery): SerializableStationery {
  const { event: _, ...rest } = s;
  return rest;
}

export function LetterPreferencesSection() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const { prefs, updatePrefs, resetStationery, isThemeDefault } = useLetterPreferences();

  // Track first render so we don't fire the persist effect on mount
  const mountedRef = useRef(false);

  const [closing, setClosing] = useState(() => prefs.closing ?? 'Warmly,');
  const [signature, setSignature] = useState(() => prefs.signature ?? '');
  const [selectedFont, setSelectedFont] = useState(
    () => FONT_OPTIONS.find((f) => f.value === prefs.font) ?? FONT_OPTIONS[0],
  );
  // Initial stationery is either the saved preference or the theme default (already baked in)
  const [stationery, setStationery] = useState<Stationery>(
    () => prefs.stationery as Stationery ?? { color: '#F5E6D3' },
  );
  const [frame, setFrame] = useState<FrameStyle>(() => prefs.frame ?? 'none');
  const [frameTint, setFrameTint] = useState(() => prefs.frameTint ?? false);
  const [friendsOnlyInbox, setFriendsOnlyInbox] = useState(() => prefs.friendsOnlyInbox ?? false);
  const [friendsOnlySearch, setFriendsOnlySearch] = useState(() => prefs.friendsOnlySearch ?? false);
  const [overlay, setOverlay] = useState<BaseOverlay>('none');

  // Persist non-stationery prefs on every change (skip mount)
  useEffect(() => {
    if (!mountedRef.current || !user) return;
    updatePrefs({
      font: selectedFont.value,
      frame,
      frameTint,
      closing,
      signature,
      friendsOnlyInbox,
      friendsOnlySearch,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFont, frame, frameTint, closing, signature, friendsOnlyInbox, friendsOnlySearch]);

  // Persist stationery only when the user explicitly picks one (skip mount)
  useEffect(() => {
    if (!mountedRef.current || !user) return;
    updatePrefs({ stationery: toSerializable(stationery) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationery]);

  // When the user resets to theme (isThemeDefault flips to true), sync local state
  // so the preview card reflects the theme immediately without a page reload.
  useEffect(() => {
    if (isThemeDefault) {
      setStationery(prefs.stationery as Stationery ?? { color: '#F5E6D3' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isThemeDefault]);

  // Mark as mounted after all initial effects have run
  useEffect(() => {
    mountedRef.current = true;
  }, []);

  if (!user) {
    return (
      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
        Log in to set letter preferences.
      </div>
    );
  }

  return (
    <div className="pb-8">
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
        setOverlay={(o) => setOverlay(o as BaseOverlay)}
        headerLeft={
          <>
            <button
              onClick={() => navigate('/letters')}
              className="p-2.5 rounded-2xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <div className="flex items-center gap-2 ml-1">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <span className="text-base font-semibold">Letter Preferences</span>
            </div>
          </>
        }
        beforeCard={
          <div className="pt-4 max-w-xl mx-auto w-full px-5">
            {/* Theme default / reset banner */}
            {isThemeDefault ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-primary/8 border border-primary/20 text-sm mb-3">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                <span className="text-muted-foreground flex-1">
                  Using your{' '}
                  <Link to="/settings" className="text-primary font-medium hover:underline">
                    Ditto theme
                  </Link>
                  {' '}as stationery
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-muted/60 border border-border text-sm mb-3">
                <span className="text-muted-foreground">Custom stationery saved</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetStationery();
                    // Update the local state to reflect the theme immediately
                    // (the prefs hook will re-derive from theme after reset)
                  }}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to theme
                </Button>
              </div>
            )}
          </div>
        }
        bodyContent={({ lineHeightPx, stationeryTextColor, stationeryLineColor, resolvedFontFamily }) => (
          <div
            className="flex-1 min-h-0"
            style={{
              ...(lineHeightPx > 0 ? {
                backgroundImage: `linear-gradient(to bottom, transparent ${lineHeightPx - 3}px, ${stationeryLineColor} ${lineHeightPx - 3}px)`,
                backgroundSize: `100% ${lineHeightPx}px`,
                backgroundRepeat: 'repeat-y',
              } : {}),
            }}
          >
            <p
              className="font-semibold tracking-wide opacity-40 pointer-events-none select-none"
              style={{
                fontSize: '3.6cqw',
                lineHeight: lineHeightPx > 0 ? `${lineHeightPx}px` : '8.4cqw',
                letterSpacing: '0.04em',
                fontFamily: resolvedFontFamily,
                color: stationeryTextColor,
              }}
            >
              Pick a font, stationery, and frame above. Choose a closing and sign your name below.
            </p>
          </div>
        )}
      />

      <div className="max-w-xl mx-auto w-full px-5 pt-4 space-y-8">
        <p className="text-sm text-muted-foreground text-center">
          These defaults apply when you start a new letter. You can always change them while composing.
        </p>

        {/* Inbox section */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">inbox</h3>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Friends only</p>
              <p className="text-xs text-muted-foreground">Only show letters from people you follow</p>
            </div>
            <Switch
              checked={friendsOnlyInbox}
              onCheckedChange={setFriendsOnlyInbox}
            />
          </div>
        </div>

        {/* Compose section */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">compose</h3>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Friends only</p>
              <p className="text-xs text-muted-foreground">Only suggest friends when choosing a recipient</p>
            </div>
            <Switch
              checked={friendsOnlySearch}
              onCheckedChange={setFriendsOnlySearch}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
