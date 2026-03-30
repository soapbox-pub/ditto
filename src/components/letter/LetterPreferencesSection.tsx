import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, RotateCcw } from 'lucide-react';
import { SubHeaderBar } from '@/components/SubHeaderBar';

import { useLetterPreferences } from '@/hooks/useLetterPreferences';
import { useThemeStationery } from '@/hooks/useThemeStationery';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  FONT_OPTIONS,
  type Stationery,
  type FrameStyle,
} from '@/lib/letterTypes';
import { LetterEditor, type BaseOverlay } from './LetterEditor';

/** Convert to serializable form for persisting. NostrEvent is plain JSON, so no stripping needed. */
function toSerializable(s: Stationery): Stationery {
  return s;
}

export function LetterPreferencesSection() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const { prefs, updatePrefs, resetStationery, isThemeDefault } = useLetterPreferences();
  const themeStationery = useThemeStationery();

  // Track whether any user-driven change has happened so we don't persist on mount
  const mountedRef = useRef(false);

  const [closing, setClosing] = useState(() => prefs.closing ?? 'Warmly,');
  const [signature, setSignature] = useState(() => prefs.signature ?? '');
  const [selectedFont, setSelectedFont] = useState(
    () => FONT_OPTIONS.find((f) => f.value === prefs.font) ?? FONT_OPTIONS[0],
  );
  // When isThemeDefault, use the live theme stationery directly (not from prefs).
  // When a custom stationery is saved, use that.
  const [stationery, setStationery] = useState<Stationery>(
    () => isThemeDefault ? themeStationery : (prefs.stationery as Stationery ?? themeStationery),
  );
  const [frame, setFrame] = useState<FrameStyle>(() => prefs.frame ?? 'none');
  const [frameTint, setFrameTint] = useState(() => prefs.frameTint ?? false);
  const [friendsOnlyInbox, setFriendsOnlyInbox] = useState(() => prefs.friendsOnlyInbox ?? false);
  const [friendsOnlySearch, setFriendsOnlySearch] = useState(() => prefs.friendsOnlySearch ?? false);
  const [overlay, setOverlay] = useState<BaseOverlay>('none');

  // Keep preview in sync with the live theme when no custom stationery is saved
  useEffect(() => {
    if (isThemeDefault) {
      setStationery(themeStationery);
    }
  }, [isThemeDefault, themeStationery]);

  // Persist non-stationery prefs on change (skip mount).
  // `updatePrefs` is intentionally omitted — its identity changes on every settings
  // update (because it closes over `settings`), which would cause an infinite loop:
  // effect → updatePrefs → settings change → new updatePrefs → effect.
  // `user` is omitted because the guard (`!user`) short-circuits if absent and
  // the component already renders a login prompt when user is null.
  const updatePrefsRef = useRef(updatePrefs);
  updatePrefsRef.current = updatePrefs;
  useEffect(() => {
    if (!mountedRef.current || !user) return;
    updatePrefsRef.current({ font: selectedFont.value, frame, frameTint, closing, signature, friendsOnlyInbox, friendsOnlySearch });
  }, [selectedFont, frame, frameTint, closing, signature, friendsOnlyInbox, friendsOnlySearch, user]);

  // Mark as mounted
  useEffect(() => { mountedRef.current = true; }, []);

  // When the user picks stationery, persist it (not called on theme-sync updates
  // because those go through setStationery directly, not this handler)
  const handleSetStationery = (s: Stationery) => {
    setStationery(s);
    if (!user) return;
    updatePrefs({ stationery: toSerializable(s) });
  };

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
          stationery, setStationery: handleSetStationery,
          frame, setFrame,
          frameTint, setFrameTint,
          closing, setClosing,
          signature, setSignature,
        }}
        overlay={overlay}
        setOverlay={(o) => setOverlay(o as BaseOverlay)}
        renderToolbarButtons={(buttons: ReactNode, drawer: ReactNode) => (
          <div className="sticky top-0 z-50">
            <div className="flex items-center gap-4 px-4 mt-4 mb-1">
              <button
                onClick={() => navigate('/letters')}
                className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors"
              >
                <ArrowLeft className="size-5" />
              </button>
              <h1 className="text-xl font-bold flex-1 truncate">Letter Preferences</h1>
            </div>
            {drawer}
            <SubHeaderBar className="relative">
              {buttons}
            </SubHeaderBar>
          </div>
        )}
        beforeCard={
          <div className="pt-4 max-w-xl mx-auto w-full px-5">
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
                  onClick={resetStationery}
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

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">inbox</h3>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Friends only</p>
              <p className="text-xs text-muted-foreground">Only show letters from people you follow</p>
            </div>
            <Switch checked={friendsOnlyInbox} onCheckedChange={setFriendsOnlyInbox} />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">compose</h3>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Friends only</p>
              <p className="text-xs text-muted-foreground">Only suggest friends when choosing a recipient</p>
            </div>
            <Switch checked={friendsOnlySearch} onCheckedChange={setFriendsOnlySearch} />
          </div>
        </div>
      </div>
    </div>
  );
}
