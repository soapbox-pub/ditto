import { useState, useMemo, useCallback } from 'react';
import { AlertTriangle, Zap, Gauge, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useOnchainZap, type OnchainFeeSpeed } from '@/hooks/useOnchainZap';
import { useNostrLogin } from '@nostrify/react/login';
import {
  nostrPubkeyToBitcoinAddress,
  fetchUTXOs,
  fetchBtcPrice,
  getFeeRates,
  estimateFee,
  satsToUSD,
  formatSats,
} from '@/lib/bitcoin';
import type { NostrEvent } from '@nostrify/nostrify';

const USD_PRESETS = [1, 5, 10, 25, 100];

const FEE_SPEED_LABELS: Record<OnchainFeeSpeed, string> = {
  fastest: '~10 min',
  halfHour: '~30 min',
  hour: '~1 hour',
  economy: '~1 day',
};

interface OnchainZapContentProps {
  target: NostrEvent;
  onSuccess?: () => void;
}

/**
 * Bitcoin zap flow. Publishes a BTC transaction paying the target author's
 * derived Taproot address, then publishes a kind 8333 event linking the tx
 * to the target event.
 *
 * UX mirrors the Lightning zap flow: one screen, one button, no review step.
 * Balance, fee breakdown, and confirmation are all hidden unless needed.
 */
export function OnchainZapContent({ target, onSuccess }: OnchainZapContentProps) {
  const { user } = useCurrentUser();
  const { capability } = useBitcoinSigner();
  const { logins } = useNostrLogin();
  const loginType = logins[0]?.type;

  const [usdAmount, setUsdAmount] = useState<number | string>(5);
  const [comment, setComment] = useState('');
  const [feeSpeed, setFeeSpeed] = useState<OnchainFeeSpeed>('halfHour');
  const [error, setError] = useState('');
  const [feePopoverOpen, setFeePopoverOpen] = useState(false);

  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price'],
    queryFn: fetchBtcPrice,
    staleTime: 30_000,
  });

  const { data: utxos } = useQuery({
    queryKey: ['bitcoin-utxos', senderAddress],
    queryFn: () => fetchUTXOs(senderAddress),
    enabled: !!senderAddress,
    staleTime: 30_000,
  });

  const { data: feeRates } = useQuery({
    queryKey: ['bitcoin-fee-rates'],
    queryFn: getFeeRates,
    staleTime: 30_000,
  });

  const totalBalance = useMemo(() => utxos?.reduce((s, u) => s + u.value, 0) ?? 0, [utxos]);

  const currentFeeRate = useMemo(() => {
    if (!feeRates) return 0;
    switch (feeSpeed) {
      case 'fastest': return feeRates.fastestFee;
      case 'halfHour': return feeRates.halfHourFee;
      case 'hour': return feeRates.hourFee;
      case 'economy': return feeRates.economyFee;
    }
  }, [feeRates, feeSpeed]);

  // Convert the USD amount to sats
  const amountSats = useMemo(() => {
    if (!btcPrice) return 0;
    const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
    if (!Number.isFinite(usd) || usd <= 0) return 0;
    const btc = usd / btcPrice;
    return Math.round(btc * 100_000_000);
  }, [usdAmount, btcPrice]);

  const estimatedFeeSats = useMemo(() => {
    if (!utxos?.length || !currentFeeRate || !amountSats) return 0;
    const fee2 = estimateFee(utxos.length, 2, currentFeeRate);
    const change = totalBalance - amountSats - fee2;
    const numOutputs = change > 546 ? 2 : 1;
    return estimateFee(utxos.length, numOutputs, currentFeeRate);
  }, [utxos, currentFeeRate, amountSats, totalBalance]);

  const feePct = estimatedFeeSats && amountSats ? (estimatedFeeSats / amountSats) * 100 : 0;
  const feeWarning = feePct > 25; // warn if fee is over 25% of the zap

  const totalSats = amountSats + estimatedFeeSats;
  const insufficient = totalBalance > 0 && totalSats > totalBalance;
  const showBalance = insufficient || (amountSats > 0 && totalBalance === 0);

  const { zapAsync, isZapping, progress } = useOnchainZap(target, onSuccess);

  const handleZap = useCallback(async () => {
    setError('');
    if (!user) { setError('You must be logged in.'); return; }
    if (user.pubkey === target.pubkey) { setError("You can't zap yourself."); return; }
    // `capability === 'unsupported'` is already handled by the UI replacement
    // above; 'supported' and 'unknown' both proceed (the latter may fail at
    // sign time, which will then flip the UI to the unsupported state).
    if (!btcPrice) { setError('Waiting for BTC price…'); return; }
    if (amountSats <= 0) { setError('Enter an amount.'); return; }
    if (!utxos?.length) { setError("You don't have any Bitcoin yet. Receive some first."); return; }
    if (insufficient) { setError('Not enough Bitcoin for this amount + network fee.'); return; }

    try {
      await zapAsync({ amountSats, comment, feeSpeed });
      // onSuccess (passed to useOnchainZap) closes the dialog; toast is shown by the hook.
    } catch (err) {
      // Capability errors flip the UI via `reportSignerUnsupported` in the
      // hook's `onError`; no need to surface a form-level error for those.
      const msg = err instanceof Error ? err.message : 'Zap failed';
      const isCapability = /does not support|doesn't support|signpsbt|sign_psbt/i.test(msg);
      if (!isCapability) setError(msg);
    }
  }, [user, target.pubkey, btcPrice, amountSats, utxos, insufficient, zapAsync, comment, feeSpeed]);

  // ── Signer not supported ──────────────────────────────────────

  if (user && capability === 'unsupported') {
    // Tailor the hint to the login type so the user knows exactly what to
    // change to regain Bitcoin-zap capability.
    const hint =
      loginType === 'extension'
        ? "Your browser extension doesn't expose signPsbt. Try a different extension, or log in with your nsec."
        : loginType === 'bunker'
          ? "Your remote signer doesn't support sign_psbt. Update your signer, or log in with your nsec."
          : "Log in with your nsec, a NIP-07 extension that exposes signPsbt, or a NIP-46 remote signer that supports sign_psbt.";

    return (
      <div className="px-4 py-6 flex flex-col items-center text-center gap-3">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center">
          <AlertTriangle className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Bitcoin zaps aren't available</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Your signer can't sign Bitcoin transactions. {hint}
          </p>
        </div>
      </div>
    );
  }

  const currentUsd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;

  return (
    <div className="grid gap-3 px-4 py-4 w-full overflow-hidden">
      {/* Amount presets (USD) */}
      <ToggleGroup
        type="single"
        value={USD_PRESETS.includes(Number(usdAmount)) ? String(usdAmount) : ''}
        onValueChange={(v) => { if (v) { setUsdAmount(Number(v)); setError(''); } }}
        className="grid grid-cols-5 gap-1 w-full"
      >
        {USD_PRESETS.map((v) => (
          <ToggleGroupItem
            key={v}
            value={String(v)}
            className="flex flex-col h-auto min-w-0 text-xs px-1 py-2"
          >
            <span className="font-semibold">${v}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-muted" />
        <span className="text-xs text-muted-foreground">OR</span>
        <div className="h-px flex-1 bg-muted" />
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="Custom amount (USD)"
          value={usdAmount}
          onChange={(e) => { setUsdAmount(e.target.value); setError(''); }}
          className="pl-6"
        />
      </div>

      {/* Comment */}
      <Textarea
        placeholder="Add a comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        className="resize-none"
      />

      {/* Fee line — click to open speed picker */}
      {amountSats > 0 && (
        <div className="flex items-center justify-between text-xs">
          <Popover open={feePopoverOpen} onOpenChange={setFeePopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Gauge className="size-3.5" />
                <span>
                  Fee{' '}
                  {estimatedFeeSats > 0 && btcPrice
                    ? `≈ ${satsToUSD(estimatedFeeSats, btcPrice)}`
                    : '…'}
                  <span className="opacity-60"> · {FEE_SPEED_LABELS[feeSpeed]}</span>
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="w-56 p-1">
              <div className="flex flex-col">
                {(Object.keys(FEE_SPEED_LABELS) as OnchainFeeSpeed[]).map((speed) => {
                  const rate = feeRates
                    ? speed === 'fastest' ? feeRates.fastestFee
                    : speed === 'halfHour' ? feeRates.halfHourFee
                    : speed === 'hour' ? feeRates.hourFee
                    : feeRates.economyFee
                    : 0;
                  const selected = speed === feeSpeed;
                  return (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => { setFeeSpeed(speed); setFeePopoverOpen(false); }}
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

          {showBalance && btcPrice && (
            <span className="text-muted-foreground">
              Balance: {satsToUSD(totalBalance, btcPrice)}
            </span>
          )}
        </div>
      )}

      {/* Fee warning — only when fees dominate the zap */}
      {feeWarning && amountSats > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Network fee is ~{feePct.toFixed(0)}% of your zap. Consider a larger amount or switch to Lightning.
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <Button
        onClick={handleZap}
        disabled={!btcPrice || amountSats <= 0 || isZapping}
        className="w-full"
      >
        {isZapping ? (
          <>
            <Loader2 className="size-4 mr-1.5 animate-spin" />
            {progressLabel(progress)}
          </>
        ) : (
          <>
            <Zap className="size-4 mr-1.5" />
            Zap {currentUsd > 0 ? `$${currentUsd}` : ''}
            {amountSats > 0 && ` · ${formatSats(amountSats)} sats`}
          </>
        )}
      </Button>
    </div>
  );
}

function progressLabel(progress: 'idle' | 'building' | 'signing' | 'broadcasting' | 'publishing'): string {
  switch (progress) {
    case 'building': return 'Building…';
    case 'signing': return 'Signing…';
    case 'broadcasting': return 'Broadcasting…';
    case 'publishing': return 'Publishing…';
    default: return 'Processing…';
  }
}
