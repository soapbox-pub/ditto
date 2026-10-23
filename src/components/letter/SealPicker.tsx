import { useState } from 'react';
import { Lock, Plus, RotateCcw } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { WaxSeal } from './WaxSeal';
import { EmojiPicker } from '@/components/EmojiPicker';
import { InfoTip } from '@/components/InfoTip';
import { useUnlockedSeals } from '@/hooks/useUnlockedSeals';
import { openUrl } from '@/lib/downloadFile';
import { cn } from '@/lib/utils';
import {
  SEAL_ICONS,
  SEAL_INITIALS_MAX,
  WAX_COLORS,
  sealsEqual,
  type SealUnlock,
  type WaxSeal as WaxSealData,
} from '@/lib/letterTypes';

type Tab = 'icon' | 'emoji' | 'initials';

interface SealPickerProps {
  seal: WaxSealData;
  onChange: (seal: WaxSealData) => void;
  /** What "reset" goes back to */
  defaultSeal: WaxSealData;
}

const pill = 'inline-flex items-center justify-center gap-1.5 h-7 px-3 shrink-0 whitespace-nowrap rounded-full text-xs font-medium transition-all';

/** A toggle pill: solid when selected, muted otherwise. */
const togglePill = (active: boolean) =>
  cn(pill, active ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground');

export function SealPicker({ seal, onChange, defaultSeal }: SealPickerProps) {
  const intl = useIntl();
  const [tab, setTab] = useState<Tab>(seal.emblem.type);
  const [initials, setInitials] = useState(seal.emblem.type === 'initials' ? seal.emblem.value : '');
  const [lockedHint, setLockedHint] = useState<SealUnlock>();
  const { data: unlocked } = useUnlockedSeals();

  const isPresetColor = WAX_COLORS.some((c) => c.color.toLowerCase() === seal.color.toLowerCase());
  const isDefault = sealsEqual(seal, defaultSeal);

  const reset = () => {
    onChange(defaultSeal);
    setTab(defaultSeal.emblem.type);
    setInitials(defaultSeal.emblem.type === 'initials' ? defaultSeal.emblem.value : '');
  };

  const tabLabels: Record<Tab, string> = {
    icon: intl.formatMessage({ id: 'sealPicker.tab.stamps', defaultMessage: 'stamps' }),
    emoji: intl.formatMessage({ id: 'sealPicker.tab.emoji', defaultMessage: 'emoji' }),
    initials: intl.formatMessage({ id: 'sealPicker.tab.initials', defaultMessage: 'initials' }),
  };

  return (
    <div className="space-y-4">
      {/* Preview + wax colors */}
      <div className="flex items-start gap-4">
        <div className="shrink-0 flex flex-col items-center gap-2 pt-3 px-3">
          <WaxSeal seal={seal} size={96} splat={1} />
          <button
            type="button"
            onClick={reset}
            disabled={isDefault}
            className={cn(pill, 'mt-1 bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-0 disabled:pointer-events-none')}
          >
            <RotateCcw className="w-3 h-3" />
            <FormattedMessage id="sealPicker.reset" defaultMessage="reset" />
          </button>
        </div>

        <div className="flex-1 min-w-0 flex flex-wrap gap-2.5 pt-1">
          {WAX_COLORS.map((c) => {
            const selected = c.color.toLowerCase() === seal.color.toLowerCase();
            const name = intl.formatMessage(c.name);
            return (
              <button
                key={c.color}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={selected}
                onClick={() => onChange({ ...seal, color: c.color })}
                className={cn(
                  'w-10 h-10 rounded-full transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/70' : 'hover:scale-110',
                )}
                style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.3), transparent 60%), ${c.color}` }}
              />
            );
          })}
          {/* Any color */}
          <label
            title={intl.formatMessage({ id: 'sealPicker.customColor', defaultMessage: 'Custom color' })}
            className={cn(
              'relative w-10 h-10 rounded-full cursor-pointer transition-all flex items-center justify-center',
              !isPresetColor ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/70' : 'hover:scale-110',
            )}
            style={{ background: isPresetColor ? 'conic-gradient(#e05252, #e0b252, #7ac25a, #52b5e0, #8a5ae0, #e052a8, #e05252)' : seal.color }}
          >
            {isPresetColor && <Plus className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />}
            <input
              type="color"
              value={seal.color}
              onChange={(e) => onChange({ ...seal, color: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label={intl.formatMessage({ id: 'sealPicker.customWaxColor', defaultMessage: 'Custom wax color' })}
            />
          </label>
        </div>
      </div>

      {/* Emblem */}
      <div className="flex items-center gap-1">
        {(['icon', 'emoji', 'initials'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={togglePill(tab === t)} aria-pressed={tab === t}>
            {tabLabels[t]}
          </button>
        ))}
        <InfoTip
          name={intl.formatMessage({ id: 'sealPicker.aboutName', defaultMessage: 'wax seals' })}
          iconSize="size-5"
          className="ml-auto"
        >
          <p>
            <FormattedMessage
              id="sealPicker.about.pressed"
              defaultMessage="Your seal is pressed onto the envelope when you send, and it's what your friend sees on the letter in their inbox."
            />
          </p>
          <p className="mt-2">
            <FormattedMessage
              id="sealPicker.about.unlock"
              defaultMessage="Some stamps are earned by using other Nostr apps, like Treasures, Espy, Surveil and Nostrdamus."
            />
          </p>
        </InfoTip>
      </div>

      {tab === 'icon' && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {SEAL_ICONS.map((icon) => {
              const locked = !!icon.unlock && !unlocked?.has(icon.id);
              const selected = seal.emblem.type === 'icon' && seal.emblem.value === icon.id;
              const name = intl.formatMessage(icon.name);
              return (
                <button
                  key={icon.id}
                  type="button"
                  title={name}
                  aria-label={locked
                    ? intl.formatMessage({ id: 'sealPicker.locked', defaultMessage: '{name} (locked)' }, { name })
                    : name}
                  aria-pressed={selected}
                  onClick={() => {
                    if (locked) {
                      setLockedHint(icon.unlock);
                      return;
                    }
                    setLockedHint(undefined);
                    onChange({ ...seal, emblem: { type: 'icon', value: icon.id } });
                  }}
                  className={cn(
                    'relative aspect-square rounded-2xl flex items-center justify-center transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected ? 'bg-muted' : 'hover:bg-muted/60',
                  )}
                >
                  <WaxSeal
                    seal={{ color: seal.color, emblem: { type: 'icon', value: icon.id } }}
                    size={56}
                    style={locked ? { filter: 'grayscale(1)', opacity: 0.35 } : undefined}
                  />
                  {locked && (
                    <span className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-background shadow-sm flex items-center justify-center">
                      <Lock className="w-3 h-3 text-muted-foreground" strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {lockedHint && (
            <p key={lockedHint.app} className="text-xs text-muted-foreground text-center animate-in fade-in duration-300">
              <FormattedMessage
                id="sealPicker.unlockHint"
                defaultMessage="{hint} on <link>{app}</link> to unlock this stamp"
                values={{
                  hint: intl.formatMessage(lockedHint.hint),
                  app: lockedHint.app,
                  link: (chunks) => (
                    <button
                      type="button"
                      onClick={() => void openUrl(lockedHint.url)}
                      className="font-semibold text-foreground underline underline-offset-2"
                    >
                      {chunks}
                    </button>
                  ),
                }}
              />
            </p>
          )}
        </div>
      )}

      {tab === 'emoji' && (
        <EmojiPicker
          height={260}
          recordUsage={false}
          onSelect={(selection) => {
            if (selection.type !== 'native') return;
            onChange({ ...seal, emblem: { type: 'emoji', value: selection.emoji } });
          }}
        />
      )}

      {tab === 'initials' && (
        <input
          type="text"
          value={initials}
          onChange={(e) => {
            const value = [...e.target.value].slice(0, SEAL_INITIALS_MAX).join('');
            setInitials(value);
            if (value.trim()) onChange({ ...seal, emblem: { type: 'initials', value: value.trim() } });
          }}
          placeholder={intl.formatMessage({ id: 'sealPicker.initialsPlaceholder', defaultMessage: 'your initials' })}
          aria-label={intl.formatMessage({ id: 'sealPicker.initials', defaultMessage: 'Initials' })}
          autoComplete="off"
          className="w-full h-12 rounded-2xl bg-muted/60 px-4 text-xl font-semibold tracking-widest outline-none border-2 border-transparent focus:border-primary focus:bg-background transition-colors placeholder:text-muted-foreground placeholder:font-normal placeholder:tracking-normal placeholder:text-base"
          style={{ fontFamily: 'Playfair Display Variable, Playfair Display, serif' }}
        />
      )}
    </div>
  );
}
