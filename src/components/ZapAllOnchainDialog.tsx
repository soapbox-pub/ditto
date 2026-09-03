import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bitcoin, Loader2, X, Check, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AmountField } from '@/components/AmountField';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useOnchainZapMany } from '@/hooks/useOnchainZapMany';
import { type OnchainFeeSpeed } from '@/hooks/useOnchainZap';
import { useAppContext } from '@/hooks/useAppContext';
import { impactMedium } from '@/lib/haptics';
import {
  nostrPubkeyToBitcoinAddress,
  fetchUTXOs,
  fetchBtcPrice,
  getFeeRates,
  estimateFee,
  isLargeAmount,
  amountInputToSats,
  formatMoneyAmount,
  formatAmountInput,
  type AmountPresetSet,
  type FeeRates,
} from '@/lib/bitcoin';
import type { CurrencyDisplay } from '@/contexts/AppContext';

/**
 * Total presets, one row per display currency — the user picks how much they
 * want to spend in total across all recipients, and we divide by recipient
 * count to get the per-person amount. The sats row is hand-picked round numbers
 * rather than a live conversion of the USD row.
 */
const TOTAL_PRESETS: AmountPresetSet = {
  usd: [5, 10, 20, 50, 100],
  sats: [5_000, 10_000, 20_000, 50_000, 100_000],
};

/** Opening total for a fresh dialog, in the user's display currency. */
function defaultAmount(currency: CurrencyDisplay): number {
  return currency === 'sats' ? 10_000 : 10;
}

const FEE_SPEED_LABELS: Record<OnchainFeeSpeed, string> = {
  fastest: '~10 min',
  halfHour: '~30 min',
  hour: '~1 hour',
  economy: '~1 day',
};

const FEE_SPEED_ORDER: OnchainFeeSpeed[] = ['fastest', 'halfHour', 'hour', 'economy'];

/** Dust limit — every recipient output must be at or above this. */
const DUST_LIMIT_SATS = 546;

function feeRateForSpeed(rates: FeeRates, speed: OnchainFeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

function getUniqueFeeSpeeds(rates: FeeRates | undefined): OnchainFeeSpeed[] {
  if (!rates) return FEE_SPEED_ORDER;
  const seen = new Set<number>();
  const result: OnchainFeeSpeed[] = [];
  for (const speed of FEE_SPEED_ORDER) {
    const rate = feeRateForSpeed(rates, speed);
    if (!seen.has(rate)) {
      seen.add(rate);
      result.push(speed);
    }
  }
  return result;
}

interface ZapAllOnchainDialogProps {
  /** Pubkeys to zap. The sender is filtered out automatically. */
  recipientPubkeys: string[];
  /** Target event (the list itself) for kind 8333 `e`/`a` tags. */
  target: NostrEvent;
  /** Dialog open state. */
  open: boolean;
  /** Open-state setter. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Dialog for batch-zapping every member of a NIP-51 follow list / pack with
 * one Bitcoin transaction. Onchain only — no Lightning variant.
 *
 * UX mirrors {@link OnchainZapContent}: USD-denominated amount with preset
 * chips, fee-speed picker, two-tap confirmation for large amounts. The
 * amount is the **total** the sender wants to spend across all recipients;
 * we divide by recipient count to get the per-person sats. Each per-person
 * output must still clear the 546-sat dust limit, so picking a total below
 * `recipients × dust` is blocked with a clear error.
 */
export function ZapAllOnchainDialog({
  recipientPubkeys,
  target,
  open,
  onOpenChange,
}: ZapAllOnchainDialogProps) {
  const { user } = useCurrentUser();
  const { capability } = useBitcoinSigner();
  const { config } = useAppContext();
  const { esploraApis } = config;

  // The total is denominated in the user's display-currency preference. In USD
  // mode it's converted to sats via the BTC price; in sats mode it *is* sats.
  const currency: CurrencyDisplay = config.currencyDisplay ?? 'usd';
  const [amountTotal, setAmountTotal] = useState<number | string>(() => defaultAmount(currency));
  const [feeSpeed, setFeeSpeed] = useState<OnchainFeeSpeed>('halfHour');
  const [error, setError] = useState('');
  const [feePopoverOpen, setFeePopoverOpen] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const [confirmArmed, setConfirmArmed] = useState(false);
  const [success, setSuccess] = useState<{
    txid: string;
    recipientCount: number;
    totalAmountSats: number;
    amountPerRecipientSats: number;
  } | null>(null);
  const feeSpeedUserChanged = useRef(false);

  // De-duplicate and remove self, preserving order. Memoize so the recipient
  // count is stable across renders.
  const recipients = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const pk of recipientPubkeys) {
      if (pk === user?.pubkey) continue;
      if (seen.has(pk)) continue;
      seen.add(pk);
      out.push(pk);
    }
    return out;
  }, [recipientPubkeys, user?.pubkey]);

  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price', esploraApis],
    queryFn: ({ signal }) => fetchBtcPrice(esploraApis, signal),
    staleTime: 30_000,
  });

  const { data: utxos } = useQuery({
    queryKey: ['bitcoin-utxos', esploraApis, senderAddress],
    queryFn: ({ signal }) => fetchUTXOs(senderAddress, esploraApis, signal),
    enabled: !!senderAddress && capability !== 'unsupported' && open,
    staleTime: 30_000,
  });

  const { data: feeRates } = useQuery({
    queryKey: ['bitcoin-fee-rates', esploraApis],
    queryFn: ({ signal }) => getFeeRates(esploraApis, signal),
    enabled: capability !== 'unsupported' && open,
    staleTime: 30_000,
  });

  const totalBalance = useMemo(() => utxos?.reduce((s, u) => s + u.value, 0) ?? 0, [utxos]);

  const currentFeeRate = useMemo(() => {
    if (!feeRates) return 0;
    return feeRateForSpeed(feeRates, feeSpeed);
  }, [feeRates, feeSpeed]);

  const recipientCount = recipients.length;

  // Convert the requested total to sats. The per-recipient amount is
  // floor(totalSats / N) so we never overshoot the sender's budget. Any
  // residual (≤ N-1 sats) is absorbed as extra change.
  const requestedTotalSats = useMemo(
    () => amountInputToSats(amountTotal, currency, btcPrice),
    [amountTotal, currency, btcPrice],
  );

  const amountPerRecipientSats = useMemo(() => {
    if (recipientCount === 0 || requestedTotalSats <= 0) return 0;
    return Math.floor(requestedTotalSats / recipientCount);
  }, [requestedTotalSats, recipientCount]);

  const totalRecipientSats = amountPerRecipientSats * recipientCount;

  const estimatedFeeSats = useMemo(() => {
    if (!utxos?.length || !currentFeeRate || !amountPerRecipientSats || recipientCount === 0) return 0;
    // N recipients + change output.
    const feeWithChange = estimateFee(utxos.length, recipientCount + 1, currentFeeRate);
    const change = totalBalance - totalRecipientSats - feeWithChange;
    const numOutputs = change > DUST_LIMIT_SATS ? recipientCount + 1 : recipientCount;
    return estimateFee(utxos.length, numOutputs, currentFeeRate);
  }, [utxos, currentFeeRate, amountPerRecipientSats, recipientCount, totalBalance, totalRecipientSats]);

  const totalSats = totalRecipientSats + estimatedFeeSats;
  const insufficient = totalBalance > 0 && totalSats > totalBalance;
  const showBalance = insufficient || (amountPerRecipientSats > 0 && totalBalance === 0);

  // Per-recipient dust check — every output MUST be at or above the 546 sat
  // dust limit, otherwise the tx won't relay. When the user picks a total
  // that doesn't divide cleanly above dust, surface a "too small" error
  // rather than silently truncating recipients out.
  const belowDust = requestedTotalSats > 0
    && recipientCount > 0
    && amountPerRecipientSats < DUST_LIMIT_SATS;

  // Auto-adjust fee speed for cost/benefit, mirroring OnchainZapContent.
  useEffect(() => {
    if (feeSpeedUserChanged.current) return;
    if (!utxos?.length || !feeRates || totalRecipientSats <= 0) return;

    const uniqueSpeeds = getUniqueFeeSpeeds(feeRates);
    // Aim for fee < 40% of total payout.
    const threshold = totalRecipientSats * 0.4;

    let nextSpeed: OnchainFeeSpeed = uniqueSpeeds[uniqueSpeeds.length - 1];
    for (const speed of uniqueSpeeds) {
      const rate = feeRateForSpeed(feeRates, speed);
      const feeWithChange = estimateFee(utxos.length, recipientCount + 1, rate);
      const change = totalBalance - totalRecipientSats - feeWithChange;
      const outputs = change > DUST_LIMIT_SATS ? recipientCount + 1 : recipientCount;
      const fee = estimateFee(utxos.length, outputs, rate);
      if (fee <= threshold) {
        nextSpeed = speed;
        break;
      }
    }
    setFeeSpeed((prev) => (prev === nextSpeed ? prev : nextSpeed));
  }, [totalRecipientSats, feeRates, utxos, totalBalance, recipientCount]);

  const handleFeeSpeedChange = useCallback((speed: OnchainFeeSpeed) => {
    feeSpeedUserChanged.current = true;
    setFeeSpeed(speed);
    setFeePopoverOpen(false);
  }, []);

  const isLarge = isLargeAmount(totalSats, btcPrice);

  // Re-arm when the amount, fee, or price moves so editing forces another tap.
  useEffect(() => {
    setConfirmArmed(false);
  }, [amountPerRecipientSats, currentFeeRate, btcPrice]);

  const { zapAsync, isZapping, progress } = useOnchainZapMany((result) => {
    setSuccess({
      txid: result.txid,
      recipientCount: result.recipientCount,
      totalAmountSats: result.totalAmountSats,
      amountPerRecipientSats: result.amountPerRecipientSats,
    });
  });

  const handleZap = useCallback(async () => {
    setError('');
    if (!user) { setError('You must be logged in.'); return; }
    if (capability === 'unsupported') {
      setError("Your signer can't sign Bitcoin transactions.");
      return;
    }
    // Only USD input needs a price to become sats; a sats total is payable as-is.
    if (currency === 'usd' && !btcPrice) { setError('Waiting for BTC price…'); return; }
    if (recipientCount === 0) { setError('No recipients to zap.'); return; }
    if (requestedTotalSats <= 0) { setError('Enter an amount.'); return; }
    if (belowDust) {
      const minTotalSats = DUST_LIMIT_SATS * recipientCount;
      const minTotal = formatMoneyAmount(minTotalSats, currency, btcPrice);
      setError(`Total too small to divide across ${recipientCount} ${recipientCount === 1 ? 'recipient' : 'recipients'}. Minimum is ${minTotal}.`);
      return;
    }
    if (!utxos?.length) { setError("You don't have any Bitcoin yet. Receive some first."); return; }
    if (insufficient) { setError('Not enough Bitcoin for this amount + network fee.'); return; }

    if (isLarge && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }

    impactMedium();
    try {
      await zapAsync({
        recipientPubkeys: recipients,
        amountPerRecipientSats,
        target,
        feeSpeed,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Zap failed';
      const isCapability = /does not support|doesn't support|signpsbt|sign_psbt/i.test(msg);
      if (!isCapability) setError(msg);
    }
  }, [
    user,
    capability,
    btcPrice,
    recipientCount,
    requestedTotalSats,
    amountPerRecipientSats,
    belowDust,
    utxos,
    insufficient,
    isLarge,
    confirmArmed,
    zapAsync,
    recipients,
    target,
    feeSpeed,
    currency,
  ]);

  // Reset state when dialog opens/closes.
  useEffect(() => {
    if (open) {
      setError('');
      setConfirmArmed(false);
      setSuccess(null);
    } else {
      setAmountTotal(defaultAmount(currency));
      setError('');
      setConfirmArmed(false);
      setSuccess(null);
      setEditingAmount(false);
      feeSpeedUserChanged.current = false;
    }
  }, [open, currency]);

  const numericTotal = typeof amountTotal === 'string' ? parseFloat(amountTotal) : amountTotal;
  const hasValidAmount = Number.isFinite(numericTotal) && numericTotal > 0;
  // Display the actual sats-paid total (after floor-rounding per recipient),
  // not the requested amount — these can differ by a few sats and showing the
  // rounded value avoids "Total: $10 (12 × $0.83 = $9.96)" surprises. Falls
  // back to the raw input while a USD price is still loading.
  const totalDisplay = totalRecipientSats > 0
    ? formatMoneyAmount(totalRecipientSats, currency, btcPrice)
    : formatAmountInput(amountTotal, currency);
  const perRecipientDisplay = amountPerRecipientSats > 0
    ? formatMoneyAmount(amountPerRecipientSats, currency, btcPrice)
    : '';
  const uniqueFeeSpeeds = useMemo(() => getUniqueFeeSpeeds(feeRates), [feeRates]);

  const isUnsupported = capability === 'unsupported';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[425px] rounded-2xl p-0 gap-0 border-border overflow-hidden max-h-[95vh] [&>button]:hidden"
        data-testid="zap-all-modal"
      >
        <div className="flex items-center justify-between px-4 h-12">
          <DialogTitle className="text-base font-semibold">
            {success ? 'Zapped all!' : 'Send Bitcoin'}
          </DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-3rem)]">
          {success ? (
            <ZapAllSuccessView
              txid={success.txid}
              recipientCount={success.recipientCount}
              totalAmountSats={success.totalAmountSats}
              amountPerRecipientSats={success.amountPerRecipientSats}
              currency={currency}
              btcPrice={btcPrice}
              onClose={() => onOpenChange(false)}
            />
          ) : isUnsupported ? (
            <div className="grid gap-3 px-4 py-6 text-center">
              <Bitcoin className="size-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Your login doesn't support sending Bitcoin transactions. Log in with your secret key to use Zap all.
              </p>
              <Button onClick={() => onOpenChange(false)} variant="secondary">
                Close
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 px-4 py-4 w-full overflow-hidden">
              {/* Big amount (total) + preset chips, in the display currency. */}
              <AmountField
                value={amountTotal}
                onValueChange={(v) => { setAmountTotal(v); setError(''); }}
                currency={currency}
                editing={editingAmount}
                setEditing={setEditingAmount}
                presets={TOTAL_PRESETS}
                invalid={insufficient || belowDust}
                label="Total amount"
              />

              {/* Per-recipient breakdown */}
              {hasValidAmount && recipientCount > 0 && amountPerRecipientSats > 0 && !belowDust && perRecipientDisplay && (
                <div className="text-center text-xs text-muted-foreground">
                  {perRecipientDisplay} per person
                  {totalDisplay && (
                    <> · {recipientCount} × {perRecipientDisplay} = {totalDisplay}</>
                  )}
                </div>
              )}

              {/* Dust warning — shown inline before the user clicks send, so
                  they can adjust before the error appears. */}
              {hasValidAmount && belowDust && (currency === 'sats' || btcPrice) && (
                <div className="text-center text-xs text-destructive">
                  Total too small — needs at least {formatMoneyAmount(DUST_LIMIT_SATS * recipientCount, currency, btcPrice)} to give every recipient a non-dust output.
                </div>
              )}

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <Button
                onClick={handleZap}
                disabled={
                  requestedTotalSats <= 0
                  || isZapping
                  || insufficient
                  || belowDust
                  || recipientCount === 0
                }
                variant={(insufficient || belowDust || isLarge) && !isZapping ? 'destructive' : 'default'}
                className="w-full"
              >
                {isZapping ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                    {progressLabel(progress)}
                  </>
                ) : insufficient ? (
                  <>Not enough Bitcoin</>
                ) : belowDust ? (
                  <>Total too small</>
                ) : recipientCount === 0 ? (
                  <>No recipients</>
                ) : isLarge && confirmArmed ? (
                  <>Tap again to send {totalDisplay}</>
                ) : (
                  <>
                    Zap {recipientCount} {recipientCount === 1 ? 'person' : 'people'}
                    {totalDisplay ? ` · ${totalDisplay}` : ''}
                  </>
                )}
              </Button>

              {/* Fee line */}
              {amountPerRecipientSats > 0 && (
                <div className="flex items-center justify-center gap-3 -mt-1 text-xs">
                  <Popover open={feePopoverOpen} onOpenChange={setFeePopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span>
                          Fee{' '}
                          {estimatedFeeSats > 0 && (currency === 'sats' || btcPrice)
                            ? `≈ ${formatMoneyAmount(estimatedFeeSats, currency, btcPrice)}`
                            : '…'}
                          <span className="opacity-60"> · {FEE_SPEED_LABELS[feeSpeed]}</span>
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="center" sideOffset={6} className="w-56 p-1">
                      <div className="flex flex-col">
                        {uniqueFeeSpeeds.map((speed) => {
                          const rate = feeRates ? feeRateForSpeed(feeRates, speed) : 0;
                          const selected = speed === feeSpeed;
                          return (
                            <button
                              key={speed}
                              type="button"
                              onClick={() => handleFeeSpeedChange(speed)}
                              className={`flex items-center justify-between px-2 py-1.5 rounded-sm text-xs text-left hover:bg-muted transition-colors ${selected ? 'bg-muted font-medium' : ''}`}
                            >
                              <span>{FEE_SPEED_LABELS[speed]}</span>
                              <span className="text-muted-foreground">{rate} sat/vB</span>
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {showBalance && !insufficient && (currency === 'sats' || btcPrice) && (
                    <span className="text-muted-foreground">
                      Balance: {formatMoneyAmount(totalBalance, currency, btcPrice)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function progressLabel(progress: 'idle' | 'building' | 'signing' | 'broadcasting' | 'publishing'): string {
  switch (progress) {
    case 'building': return 'Building…';
    case 'signing': return 'Signing…';
    case 'broadcasting': return 'Broadcasting…';
    case 'publishing': return 'Publishing zaps…';
    default: return 'Processing…';
  }
}

interface ZapAllSuccessViewProps {
  txid: string;
  recipientCount: number;
  totalAmountSats: number;
  amountPerRecipientSats: number;
  /** The user's display-currency preference. */
  currency: CurrencyDisplay;
  btcPrice: number | undefined;
  onClose: () => void;
}

function ZapAllSuccessView({
  txid,
  recipientCount,
  totalAmountSats,
  amountPerRecipientSats,
  currency,
  btcPrice,
  onClose,
}: ZapAllSuccessViewProps) {
  const totalDisplay = formatMoneyAmount(totalAmountSats, currency, btcPrice);
  const perRecipientDisplay = formatMoneyAmount(amountPerRecipientSats, currency, btcPrice);

  return (
    <div className="grid gap-4 px-4 py-6 text-center">
      <div className="mx-auto rounded-full bg-green-500/10 p-4">
        <Check className="size-8 text-green-500" />
      </div>

      <div className="space-y-1">
        <p className="text-2xl font-semibold tabular-nums">
          {totalDisplay}
        </p>
        <p className="text-sm text-muted-foreground">
          Sent {perRecipientDisplay} to {recipientCount} {recipientCount === 1 ? 'account' : 'accounts'}
        </p>
      </div>

      <Link
        to={`/i/bitcoin:tx:${txid}`}
        className="inline-flex items-center justify-center gap-1.5 text-sm text-primary hover:underline"
        onClick={onClose}
      >
        <ExternalLink className="size-3.5" />
        View transaction
      </Link>

      <Button onClick={onClose} className="w-full mt-2">
        Done
      </Button>
    </div>
  );
}
