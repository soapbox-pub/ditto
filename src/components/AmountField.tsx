import { useEffect, useRef } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatSats, presetsFor, type AmountPresetSet } from '@/lib/bitcoinMoney';
import { formatNumber } from '@/lib/formatNumber';
import type { CurrencyDisplay } from '@/contexts/AppContext';

interface AmountFieldProps {
  /**
   * The raw input value, denominated in `currency`. A string while the user is
   * typing (so a half-typed "0." survives a re-render), a number once a preset
   * is picked or the edit is committed.
   */
  value: number | string;
  /** Called with the new raw value. Callers typically also clear their error. */
  onValueChange: (value: number | string) => void;
  /** The user's display-currency preference. Drives units, step, and presets. */
  currency: CurrencyDisplay;
  /** Whether the big number is in text-entry mode. */
  editing: boolean;
  setEditing: (editing: boolean) => void;
  /** Preset chips for both currencies; the matching set is rendered. */
  presets: AmountPresetSet;
  /**
   * Renders the amount in the destructive colour — insufficient balance, an
   * output below the dust limit, etc.
   */
  invalid?: boolean;
  /** Accessible name for the amount, e.g. "Amount" or "Total amount". */
  label?: string;
}

/**
 * The big, tappable amount at the top of every Bitcoin payment surface, plus
 * its row of preset chips.
 *
 * The unit follows the user's `currencyDisplay` preference: USD renders a `$`
 * prefix and cent-precision steps, sats renders a `sats` suffix and whole-sat
 * steps. Presets are supplied per-currency rather than converted, so sats users
 * see round numbers (`1k`) instead of conversions of the dollar chips (`947`).
 *
 * Callers own the value and convert it to satoshis with `amountInputToSats`.
 */
export function AmountField({
  value,
  onValueChange,
  currency,
  editing,
  setEditing,
  presets,
  invalid = false,
  label = 'Amount',
}: AmountFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isSats = currency === 'sats';
  const unitLabel = isSats ? 'sats' : 'USD';

  const numeric = typeof value === 'string' ? parseFloat(value) : value;
  const hasValidAmount = Number.isFinite(numeric) && numeric > 0;

  // Focus + select-all when the amount is clicked into edit mode, so typing
  // replaces the current value rather than appending to it.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    // Normalize a cleared field to 0 so the display never shows a bare "$".
    if (typeof value === 'string' && value.trim() === '') {
      onValueChange(0);
    }
  };

  // Committed display: sats get thousand separators, USD keeps cents only for
  // sub-dollar amounts ("$0.50" but "$5", not "$5.00").
  const display = !hasValidAmount
    ? '0'
    : isSats
      ? formatSats(Math.round(numeric))
      : numeric < 1
        ? numeric.toFixed(2)
        : String(numeric);

  const accentClass = invalid ? 'text-destructive' : 'text-muted-foreground';
  const amountClass = invalid ? 'text-destructive' : '';

  const activePresets = presetsFor(presets, currency);

  return (
    <>
      <div className="flex flex-col items-center">
        {editing ? (
          <div className="flex items-baseline justify-center">
            {!isSats && <span className={`text-4xl font-semibold ${accentClass}`}>$</span>}
            <input
              ref={inputRef}
              type="number"
              inputMode="decimal"
              min={0}
              step={isSats ? '1' : '0.01'}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
              }}
              aria-label={`${label} in ${unitLabel}`}
              className={`bg-transparent border-0 outline-none text-4xl font-semibold text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${amountClass}`}
              style={{ width: `${Math.max(2, String(value).length + 1)}ch` }}
            />
            {isSats && <span className={`text-2xl font-semibold ml-1.5 ${accentClass}`}>sats</span>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${label.toLowerCase()}`}
            className="flex items-baseline justify-center rounded-md px-2 -mx-2 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            {!isSats && <span className={`text-4xl font-semibold ${accentClass}`}>$</span>}
            <span className={`text-4xl font-semibold tabular-nums ${amountClass}`}>{display}</span>
            {isSats && <span className={`text-2xl font-semibold ml-1.5 ${accentClass}`}>sats</span>}
          </button>
        )}
      </div>

      <ToggleGroup
        type="single"
        value={activePresets.includes(Number(value)) ? String(value) : ''}
        onValueChange={(v) => {
          if (v) {
            onValueChange(Number(v));
            setEditing(false);
          }
        }}
        className="grid grid-cols-5 gap-1 w-full"
      >
        {activePresets.map((v) => (
          <ToggleGroupItem
            key={v}
            value={String(v)}
            className="h-8 min-w-0 rounded-full text-xs font-semibold px-1"
          >
            {formatPresetLabel(v, currency)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </>
  );
}

/**
 * Preset chip label. Five chips share one row, so sats presets abbreviate
 * ("1k" rather than "1,000") while USD drops the trailing zeros on whole
 * dollars ("$1", but "$0.10").
 */
export function formatPresetLabel(amount: number, currency: CurrencyDisplay): string {
  if (currency === 'sats') return formatNumber(amount);
  return amount < 1 ? `$${amount.toFixed(2)}` : `$${amount}`;
}
