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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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
  satsToUSD,
  type FeeRates,
} from '@/lib/bitcoin';

/**
 * Total USD presets — the user picks how much they want to spend in total
 * across all recipients, and we divide by recipient count to get the
 * per-person amount.
 */
const USD_TOTAL_PRESETS = [5, 10, 25, 50, 100];

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
  const { esploraBaseUrl } = config;

  const [usdTotal, setUsdTotal] = useState<number | string>(10);
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
  const amountInputRef = useRef<HTMLInputElement>(null);
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
    queryKey: ['btc-price', esploraBaseUrl],
    queryFn: () => fetchBtcPrice(esploraBaseUrl),
    staleTime: 30_000,
  });

  const { data: utxos } = useQuery({
    queryKey: ['bitcoin-utxos', esploraBaseUrl, senderAddress],
    queryFn: () => fetchUTXOs(senderAddress, esploraBaseUrl),
    enabled: !!senderAddress && capability !== 'unsupported' && open,
    staleTime: 30_000,
  });

  const { data: feeRates } = useQuery({
    queryKey: ['bitcoin-fee-rates', esploraBaseUrl],
    queryFn: () => getFeeRates(esploraBaseUrl),
    enabled: capability !== 'unsupported' && open,
    staleTime: 30_000,
  });

  const totalBalance = useMemo(() => utxos?.reduce((s, u) => s + u.value, 0) ?? 0, [utxos]);

  const currentFeeRate = useMemo(() => {
    if (!feeRates) return 0;
    return feeRateForSpeed(feeRates, feeSpeed);
  }, [feeRates, feeSpeed]);

  const recipientCount = recipients.length;

  // Convert the requested USD total to sats. The per-recipient amount is
  // floor(totalSats / N) so we never overshoot the sender's budget. Any
  // residual (≤ N-1 sats) is absorbed as extra change.
  const requestedTotalSats = useMemo(() => {
    if (!btcPrice) return 0;
    const usd = typeof usdTotal === 'string' ? parseFloat(usdTotal) : usdTotal;
    if (!Number.isFinite(usd) || usd <= 0) return 0;
    const btc = usd / btcPrice;
    return Math.round(btc * 100_000_000);
  }, [usdTotal, btcPrice]);

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
    if (!btcPrice) { setError('Waiting for BTC price…'); return; }
    if (recipientCount === 0) { setError('No recipients to zap.'); return; }
    if (requestedTotalSats <= 0) { setError('Enter an amount.'); return; }
    if (belowDust) {
      const minTotalSats = DUST_LIMIT_SATS * recipientCount;
      const minTotalUsd = btcPrice ? satsToUSD(minTotalSats, btcPrice) : `${minTotalSats.toLocaleString()} sats`;
      setError(`Total too small to divide across ${recipientCount} ${recipientCount === 1 ? 'recipient' : 'recipients'}. Minimum is ${minTotalUsd}.`);
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
  ]);

  // Reset state when dialog opens/closes.
  useEffect(() => {
    if (open) {
      setError('');
      setConfirmArmed(false);
      setSuccess(null);
    } else {
      setUsdTotal(10);
      setError('');
      setConfirmArmed(false);
      setSuccess(null);
      setEditingAmount(false);
      feeSpeedUserChanged.current = false;
    }
  }, [open]);

  // Auto-focus the amount input when entering edit mode.
  useEffect(() => {
    if (editingAmount) {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }
  }, [editingAmount]);

  const commitAmountEdit = useCallback(() => {
    setEditingAmount(false);
    if (typeof usdTotal === 'string' && usdTotal.trim() === '') {
      setUsdTotal(0);
    }
  }, [usdTotal]);

  const currentUsd = typeof usdTotal === 'string' ? parseFloat(usdTotal) : usdTotal;
  const hasValidAmount = Number.isFinite(currentUsd) && currentUsd > 0;
  // Display the actual sats-paid total (after floor-rounding per recipient),
  // not the requested USD — these can differ by a few cents and showing the
  // rounded value avoids "Total: $10 (12 × $0.83 = $9.96)" surprises.
  const totalUsdString = btcPrice && totalRecipientSats > 0
    ? satsToUSD(totalRecipientSats, btcPrice)
    : '';
  const perRecipientUsdString = btcPrice && amountPerRecipientSats > 0
    ? satsToUSD(amountPerRecipientSats, btcPrice)
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

        <div className="overflow-y-auto">
          {success ? (
            <ZapAllSuccessView
              txid={success.txid}
              recipientCount={success.recipientCount}
              totalAmountSats={success.totalAmountSats}
              amountPerRecipientSats={success.amountPerRecipientSats}
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
              {/* Big amount (total) */}
              <div className="flex flex-col items-center">
                {editingAmount ? (
                  <div className="flex items-baseline justify-center">
                    <span className={`text-4xl font-semibold ${insufficient || belowDust ? 'text-destructive' : 'text-muted-foreground'}`}>$</span>
                    <input
                      ref={amountInputRef}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={usdTotal}
                      onChange={(e) => { setUsdTotal(e.target.value); setError(''); }}
                      onBlur={commitAmountEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitAmountEdit();
                        }
                      }}
                      aria-label="Total amount in USD"
                      className={`bg-transparent border-0 outline-none text-4xl font-semibold text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${insufficient || belowDust ? 'text-destructive' : ''}`}
                      style={{ width: `${Math.max(2, String(usdTotal).length + 1)}ch` }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingAmount(true)}
                    aria-label="Edit total amount"
                    className="flex items-baseline justify-center rounded-md px-2 -mx-2 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                  >
                    <span className={`text-4xl font-semibold ${insufficient || belowDust ? 'text-destructive' : 'text-muted-foreground'}`}>$</span>
                    <span className={`text-4xl font-semibold tabular-nums ${insufficient || belowDust ? 'text-destructive' : ''}`}>
                      {hasValidAmount ? (currentUsd < 1 ? currentUsd.toFixed(2) : currentUsd) : 0}
                    </span>
                  </button>
                )}
              </div>

              {/* Total USD presets */}
              <ToggleGroup
                type="single"
                value={USD_TOTAL_PRESETS.includes(Number(usdTotal)) ? String(usdTotal) : ''}
                onValueChange={(v) => { if (v) { setUsdTotal(Number(v)); setError(''); setEditingAmount(false); } }}
                className="grid grid-cols-5 gap-1 w-full"
              >
                {USD_TOTAL_PRESETS.map((v) => (
                  <ToggleGroupItem
                    key={v}
                    value={String(v)}
                    className="h-8 min-w-0 text-xs font-semibold px-1"
                  >
                    ${v}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {/* Per-recipient breakdown */}
              {hasValidAmount && recipientCount > 0 && amountPerRecipientSats > 0 && !belowDust && (
                <div className="text-center text-xs text-muted-foreground">
                  {perRecipientUsdString || `~$${(currentUsd / recipientCount).toFixed(2)}`}
                  {' '}per person
                  {totalUsdString && totalUsdString !== `$${currentUsd}` && (
                    <> · {recipientCount} × {perRecipientUsdString} = {totalUsdString}</>
                  )}
                </div>
              )}

              {/* Dust warning — shown inline before the user clicks send, so
                  they can adjust before the error appears. */}
              {hasValidAmount && belowDust && btcPrice && (
                <div className="text-center text-xs text-destructive">
                  Total too small — needs at least {satsToUSD(DUST_LIMIT_SATS * recipientCount, btcPrice)} to give every recipient a non-dust output.
                </div>
              )}

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              <Button
                onClick={handleZap}
                disabled={
                  !btcPrice
                  || requestedTotalSats <= 0
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
                  <>Tap again to send {totalUsdString}</>
                ) : (
                  <>
                    Zap {recipientCount} {recipientCount === 1 ? 'person' : 'people'}
                    {totalUsdString ? ` · ${totalUsdString}` : ''}
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
                          {estimatedFeeSats > 0 && btcPrice
                            ? `≈ ${satsToUSD(estimatedFeeSats, btcPrice)}`
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

                  {showBalance && !insufficient && btcPrice && (
                    <span className="text-muted-foreground">
                      Balance: {satsToUSD(totalBalance, btcPrice)}
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
  btcPrice: number | undefined;
  onClose: () => void;
}

function ZapAllSuccessView({
  txid,
  recipientCount,
  totalAmountSats,
  amountPerRecipientSats,
  btcPrice,
  onClose,
}: ZapAllSuccessViewProps) {
  const totalUsd = btcPrice ? satsToUSD(totalAmountSats, btcPrice) : '';
  const perRecipientUsd = btcPrice ? satsToUSD(amountPerRecipientSats, btcPrice) : '';

  return (
    <div className="grid gap-4 px-4 py-6 text-center">
      <div className="mx-auto rounded-full bg-green-500/10 p-4">
        <Check className="size-8 text-green-500" />
      </div>

      <div className="space-y-1">
        <p className="text-2xl font-semibold tabular-nums">
          {totalUsd || `${totalAmountSats.toLocaleString()} sats`}
        </p>
        <p className="text-sm text-muted-foreground">
          Sent {perRecipientUsd || `${amountPerRecipientSats.toLocaleString()} sats`} to {recipientCount} {recipientCount === 1 ? 'account' : 'accounts'}
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
