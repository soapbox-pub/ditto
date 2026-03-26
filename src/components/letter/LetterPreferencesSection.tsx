import { useState, useEffect } from 'react';

import { useLetterPreferences } from '@/hooks/useLetterPreferences';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Switch } from '@/components/ui/switch';
import {
  FONT_OPTIONS,
  type Stationery,
  type FrameStyle,
  type SerializableStationery,
  presetToStationery,
} from '@/lib/letterTypes';
import { LetterEditor, type BaseOverlay } from './LetterEditor';

/** Strip the non-serializable `event` field */
function toSerializable(s: Stationery): SerializableStationery {
  const { event: _, ...rest } = s;
  return rest;
}

export function LetterPreferencesSection() {
  const { user } = useCurrentUser();
  const { prefs, updatePrefs } = useLetterPreferences();

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
  const [friendsOnlyInbox, setFriendsOnlyInbox] = useState(() => prefs.friendsOnlyInbox ?? false);
  const [friendsOnlySearch, setFriendsOnlySearch] = useState(() => prefs.friendsOnlySearch ?? false);
  const [overlay, setOverlay] = useState<BaseOverlay>('none');

  // Persist on every change
  useEffect(() => {
    if (!user) return;
    updatePrefs({
      font: selectedFont.value,
      stationery: toSerializable(stationery),
      frame,
      frameTint,
      closing,
      signature,
      friendsOnlyInbox,
      friendsOnlySearch,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFont, stationery, frame, frameTint, closing, signature, friendsOnlyInbox, friendsOnlySearch]);

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
        beforeCard={<div className="pt-4" />}
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
              <p className="text-sm font-medium">friends only</p>
              <p className="text-xs text-muted-foreground">only show letters from people you follow</p>
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
              <p className="text-sm font-medium">friends only</p>
              <p className="text-xs text-muted-foreground">only suggest friends when choosing a recipient</p>
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
