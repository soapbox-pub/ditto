import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  Check,
  Loader2,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useOnchainZap, type OnchainFeeSpeed } from '@/hooks/useOnchainZap';
import {
  nostrPubkeyToBitcoinAddress,
  fetchUTXOs,
  fetchBtcPrice,
  getFeeRates,
  estimateFee,
  satsToBTC,
  satsToUSD,
  formatSats,
} from '@/lib/bitcoin';
import type { NostrEvent } from '@nostrify/nostrify';

const USD_PRESETS = [1, 5, 10, 25, 100];

const FEE_SPEED_LABELS: Record<OnchainFeeSpeed, string> = {
  fastest: 'Fastest (~10 min)',
  halfHour: 'Half hour',
  hour: 'One hour',
  economy: 'Economy (~1 day)',
};

type Step = 'form' | 'confirm' | 'success';

interface OnchainZapContentProps {
  target: NostrEvent;
  onSuccess?: () => void;
}

/**
 * On-chain Bitcoin zap flow. Publishes a BTC transaction paying the target
 * author's derived Taproot address, then publishes a kind 3043 event
 * linking the tx to the target event.
 */
export function OnchainZapContent({ target, onSuccess }: OnchainZapContentProps) {
  const { user } = useCurrentUser();
  const { canSignPsbt } = useBitcoinSigner();

  const [step, setStep] = useState<Step>('form');
  const [usdAmount, setUsdAmount] = useState<number | string>(5);
  const [comment, setComment] = useState('');
  const [feeSpeed, setFeeSpeed] = useState<OnchainFeeSpeed>('halfHour');
  const [error, setError] = useState('');
  const [successTxid, setSuccessTxid] = useState('');
  const [successFee, setSuccessFee] = useState(0);

  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price'],
    queryFn: fetchBtcPrice,
    staleTime: 30_000,
  });

  const { data: utxos, isLoading: isLoadingUtxos } = useQuery({
    queryKey: ['bitcoin-utxos', senderAddress],
    queryFn: () => fetchUTXOs(senderAddress),
    enabled: !!senderAddress,
    staleTime: 30_000,
  });

  const { data: feeRates, isLoading: isLoadingFees } = useQuery({
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

  const { zapAsync, isZapping, progress } = useOnchainZap(target, onSuccess);

  const goToConfirm = useCallback(() => {
    setError('');
    if (!user) { setError('You must be logged in.'); return; }
    if (user.pubkey === target.pubkey) { setError("You can't zap yourself."); return; }
    if (!canSignPsbt) {
      setError("Your signer doesn't support Bitcoin signing. Log in with your nsec, or an extension/bunker that supports signPsbt.");
      return;
    }
    if (!btcPrice) { setError('Waiting for BTC price…'); return; }
    if (amountSats <= 0) { setError('Enter an amount.'); return; }
    if (!utxos?.length) { setError('Your on-chain wallet has no spendable funds. Receive some Bitcoin first.'); return; }
    if (amountSats + estimatedFeeSats > totalBalance) { setError('Insufficient funds for this amount + fee.'); return; }
    setStep('confirm');
  }, [user, target.pubkey, canSignPsbt, btcPrice, amountSats, utxos, estimatedFeeSats, totalBalance]);

  const handleConfirm = useCallback(async () => {
    try {
      const result = await zapAsync({ amountSats, comment, feeSpeed });
      setSuccessTxid(result.txid);
      setSuccessFee(result.fee);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zap failed');
      setStep('form');
    }
  }, [zapAsync, amountSats, comment, feeSpeed]);

  // ── Signer not supported ──────────────────────────────────────

  if (user && !canSignPsbt) {
    return (
      <div className="px-4 py-4 space-y-3">
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs">
            Your signer doesn't support Bitcoin transaction signing. Log in with your nsec, a
            NIP-07 extension that supports <code>signPsbt</code>, or a NIP-46 remote signer
            that supports <code>sign_psbt</code> to send on-chain zaps.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ── Success view ──────────────────────────────────────────────

  if (step === 'success') {
    return (
      <div className="px-4 py-4 space-y-4">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="size-12 rounded-full bg-green-500/15 flex items-center justify-center">
            <Check className="size-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="font-semibold">Zap broadcast!</p>
            <p className="text-xs text-muted-foreground">
              {btcPrice && amountSats > 0
                ? `${satsToUSD(amountSats, btcPrice)} sent on-chain`
                : `${formatSats(amountSats)} sats sent on-chain`}
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-3 space-y-1">
          <Label className="text-xs text-muted-foreground">Transaction ID</Label>
          <p className="text-[10px] font-mono break-all">{successTxid}</p>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Fee: {formatSats(successFee)} sats
          {btcPrice ? ` (${satsToUSD(successFee, btcPrice)})` : ''}
        </p>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" asChild>
            <Link to={`/i/bitcoin:tx:${successTxid}`}>
              <ExternalLink className="size-4 mr-1.5" />
              View Transaction
            </Link>
          </Button>
          <Button className="flex-1" onClick={onSuccess}>Done</Button>
        </div>
      </div>
    );
  }

  // ── Confirm view ──────────────────────────────────────────────

  if (step === 'confirm') {
    const totalSats = amountSats + estimatedFeeSats;
    const recipientAddress = nostrPubkeyToBitcoinAddress(target.pubkey);

    return (
      <div className="px-4 py-4 space-y-4">
        <div className="rounded-lg bg-muted/50 p-4 space-y-1">
          <Label className="text-xs text-muted-foreground">Paying to</Label>
          <p className="text-[11px] font-mono break-all">{recipientAddress}</p>
        </div>

        <div className="space-y-1.5">
          <Row label="Zap" sats={amountSats} btcPrice={btcPrice} primary />
          <Row label={`Network fee (${FEE_SPEED_LABELS[feeSpeed].toLowerCase()})`} sats={estimatedFeeSats} btcPrice={btcPrice} />
          <Separator className="my-1" />
          <Row label="Total" sats={totalSats} btcPrice={btcPrice} bold />
        </div>

        {comment && (
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <Label className="text-xs text-muted-foreground">Comment</Label>
            <p className="text-sm break-words">{comment}</p>
          </div>
        )}

        <Alert className="py-2">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs">
            On-chain transactions are final. Funds settle after ~10 minutes.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep('form')} disabled={isZapping} className="flex-1">
            <ChevronLeft className="size-4 mr-1" /> Back
          </Button>
          <Button onClick={handleConfirm} disabled={isZapping} className="flex-1">
            {isZapping ? (
              <><Loader2 className="size-4 mr-1.5 animate-spin" />{progressLabel(progress)}</>
            ) : (
              <><Zap className="size-4 mr-1.5" />Confirm & Zap</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Form view ─────────────────────────────────────────────────

  const currentUsd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Balance */}
      <div className="rounded-lg bg-muted/50 p-3">
        <Label className="text-xs text-muted-foreground">Your on-chain balance</Label>
        {isLoadingUtxos ? (
          <Skeleton className="mt-1 h-6 w-32" />
        ) : (
          <p className="text-base font-semibold">
            {btcPrice
              ? satsToUSD(totalBalance, btcPrice)
              : `${satsToBTC(totalBalance).replace(/\.?0+$/, '')} BTC`}
          </p>
        )}
      </div>

      {/* Amount presets (USD) */}
      <div className="space-y-2">
        <Label>Amount</Label>
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

        {currentUsd > 0 && amountSats > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            ≈ {formatSats(amountSats)} sats
          </p>
        )}
      </div>

      {/* Comment */}
      <div className="space-y-1.5">
        <Label htmlFor="onchain-zap-comment">Comment (optional)</Label>
        <Textarea
          id="onchain-zap-comment"
          placeholder="Add a note…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="resize-none"
        />
      </div>

      {/* Fee speed */}
      <div className="space-y-1.5">
        <Label>Transaction speed</Label>
        <Select value={feeSpeed} onValueChange={(v) => setFeeSpeed(v as OnchainFeeSpeed)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FEE_SPEED_LABELS) as OnchainFeeSpeed[]).map((speed) => (
              <SelectItem key={speed} value={speed}>
                {FEE_SPEED_LABELS[speed]}
                {' — '}
                {isLoadingFees
                  ? '...'
                  : feeRates
                    ? `${speed === 'fastest' ? feeRates.fastestFee
                      : speed === 'halfHour' ? feeRates.halfHourFee
                      : speed === 'hour' ? feeRates.hourFee
                      : feeRates.economyFee} sat/vB`
                    : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {estimatedFeeSats > 0 && btcPrice && (
          <p className="text-xs text-muted-foreground">
            Estimated fee: ~{satsToUSD(estimatedFeeSats, btcPrice)} ({formatSats(estimatedFeeSats)} sats)
          </p>
        )}
      </div>

      {/* Fee warning */}
      {feeWarning && amountSats > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs">
            Network fees are ~{feePct.toFixed(0)}% of your zap. Consider a larger amount or using Lightning for small zaps.
          </AlertDescription>
        </Alert>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={goToConfirm}
        disabled={!btcPrice || amountSats <= 0 || isLoadingUtxos || isLoadingFees}
        className="w-full"
      >
        <Zap className="size-4 mr-1.5" />
        Review
      </Button>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────

function Row({
  label,
  sats,
  btcPrice,
  primary,
  bold,
}: {
  label: string;
  sats: number;
  btcPrice?: number;
  primary?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`text-sm ${primary ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
      <div className="text-right">
        <span className={`text-sm ${bold ? 'font-semibold' : ''}`}>
          {btcPrice ? satsToUSD(sats, btcPrice) : `${formatSats(sats)} sats`}
        </span>
        <span className="block text-[10px] text-muted-foreground">
          {formatSats(sats)} sats
        </span>
      </div>
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
