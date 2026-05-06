import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, Bitcoin, Copy, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useOnchainZap, type OnchainFeeSpeed } from '@/hooks/useOnchainZap';
import { useToast } from '@/hooks/useToast';
import { useNostrLogin } from '@nostrify/react/login';
import {
  nostrPubkeyToBitcoinAddress,
  fetchUTXOs,
  fetchBtcPrice,
  getFeeRates,
  estimateFee,
  isLargeAmount,
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

const FEE_SPEED_ORDER: OnchainFeeSpeed[] = ['fastest', 'halfHour', 'hour', 'economy'];

/**
 * Given the raw mempool fee rates (sat/vB), return a deduplicated list of
 * speed tiers. When multiple tiers share the same rate (common when the
 * mempool is empty and everything collapses to 1 sat/vB), we keep only the
 * fastest-labeled tier for that rate. This prevents rows like "~10 min 2
 * sat/vB / ~30 min 2 sat/vB / ~1 hour 2 sat/vB" in the UI.
 */
function getRateForSpeed(rates: { fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number }, speed: OnchainFeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

function getUniqueFeeSpeeds(
  rates: { fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number } | undefined,
): OnchainFeeSpeed[] {
  if (!rates) return FEE_SPEED_ORDER;
  const seen = new Set<number>();
  const result: OnchainFeeSpeed[] = [];
  for (const speed of FEE_SPEED_ORDER) {
    const rate = getRateForSpeed(rates, speed);
    if (!seen.has(rate)) {
      seen.add(rate);
      result.push(speed);
    }
  }
  return result;
}

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
  const [feeSpeed, setFeeSpeed] = useState<OnchainFeeSpeed>('halfHour');
  const [error, setError] = useState('');
  const [feePopoverOpen, setFeePopoverOpen] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Tracks whether the user has manually picked a fee speed. Once true, we
  // stop auto-adjusting the fee in response to amount changes.
  const feeSpeedUserChanged = useRef(false);

  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';
  const recipientAddress = useMemo(() => nostrPubkeyToBitcoinAddress(target.pubkey), [target.pubkey]);
  const truncatedRecipient = recipientAddress
    ? `${recipientAddress.slice(0, 10)}…${recipientAddress.slice(-8)}`
    : '';

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price'],
    queryFn: fetchBtcPrice,
    staleTime: 30_000,
  });

  const { data: utxos } = useQuery({
    queryKey: ['bitcoin-utxos', senderAddress],
    queryFn: () => fetchUTXOs(senderAddress),
    enabled: !!senderAddress && capability !== 'unsupported',
    staleTime: 30_000,
  });

  const { data: feeRates } = useQuery({
    queryKey: ['bitcoin-fee-rates'],
    queryFn: getFeeRates,
    enabled: capability !== 'unsupported',
    staleTime: 30_000,
  });

  const totalBalance = useMemo(() => utxos?.reduce((s, u) => s + u.value, 0) ?? 0, [utxos]);

  const currentFeeRate = useMemo(() => {
    if (!feeRates) return 0;
    return getRateForSpeed(feeRates, feeSpeed);
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

  const totalSats = amountSats + estimatedFeeSats;
  const insufficient = totalBalance > 0 && totalSats > totalBalance;
  const showBalance = insufficient || (amountSats > 0 && totalBalance === 0);

  // Auto-adjust fee speed when the amount changes, unless the user has
  // already picked a speed manually. Aim for a fee below 40% of the amount
  // by stepping down through the unique speed tiers. If every tier still
  // blows past 40% (tiny amount), fall back to the cheapest tier so we at
  // least minimize the hit.
  useEffect(() => {
    if (feeSpeedUserChanged.current) return;
    if (!utxos?.length || !feeRates || amountSats <= 0) return;

    const uniqueSpeeds = getUniqueFeeSpeeds(feeRates);
    const threshold = amountSats * 0.4;

    let target: OnchainFeeSpeed = uniqueSpeeds[uniqueSpeeds.length - 1];
    for (const speed of uniqueSpeeds) {
      const rate = getRateForSpeed(feeRates, speed);
      const fee2 = estimateFee(utxos.length, 2, rate);
      const change = totalBalance - amountSats - fee2;
      const outputs = change > 546 ? 2 : 1;
      const fee = estimateFee(utxos.length, outputs, rate);
      if (fee <= threshold) {
        target = speed;
        break;
      }
    }

    setFeeSpeed((prev) => (prev === target ? prev : target));
  }, [amountSats, feeRates, utxos, totalBalance]);

  const handleFeeSpeedChange = useCallback((speed: OnchainFeeSpeed) => {
    feeSpeedUserChanged.current = true;
    setFeeSpeed(speed);
    setFeePopoverOpen(false);
  }, []);

  // For large amounts, require a two-tap confirmation on the primary button.
  // This catches fat-finger sends without nagging on normal amounts.
  const isLarge = isLargeAmount(totalSats, btcPrice);
  const [confirmArmed, setConfirmArmed] = useState(false);

  // Re-arm (i.e. clear confirmation) whenever the amount, fee rate, or price
  // moves — so editing after arming forces another deliberate click.
  useEffect(() => {
    setConfirmArmed(false);
  }, [amountSats, currentFeeRate, btcPrice]);

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

    // Two-tap safety for large amounts: first click arms, second click sends.
    if (isLarge && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }

    try {
      await zapAsync({ amountSats, comment: '', feeSpeed });
      // onSuccess (passed to useOnchainZap) closes the dialog; toast is shown by the hook.
    } catch (err) {
      // Capability errors flip the UI via `reportSignerUnsupported` in the
      // hook's `onError`; no need to surface a form-level error for those.
      const msg = err instanceof Error ? err.message : 'Zap failed';
      const isCapability = /does not support|doesn't support|signpsbt|sign_psbt/i.test(msg);
      if (!isCapability) setError(msg);
    }
  }, [user, target.pubkey, btcPrice, amountSats, utxos, insufficient, zapAsync, feeSpeed, isLarge, confirmArmed]);

  // ── Signer not supported ──────────────────────────────────────
  // The user's signer can't sign PSBTs locally (extension without signPsbt,
  // or a bunker that rejected sign_psbt). Instead of a dead-end, show a QR
  // they can scan with any external Bitcoin wallet. We can't observe the
  // resulting txid, so we don't publish a kind 8333 — the user is warned
  // that the zap won't be attributed to them on Nostr.

  const currentUsd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
  const hasValidAmount = Number.isFinite(currentUsd) && currentUsd > 0;
  const totalUsdString = btcPrice ? satsToUSD(totalSats, btcPrice) : '';
  const uniqueFeeSpeeds = useMemo(() => getUniqueFeeSpeeds(feeRates), [feeRates]);

  // Clicking the big amount flips it into edit mode. Auto-focus and
  // select-all so typing overwrites the current value.
  useEffect(() => {
    if (editingAmount) {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }
  }, [editingAmount]);

  const commitAmountEdit = useCallback(() => {
    setEditingAmount(false);
    // Normalize empty string to 0 so the display doesn't show "$" alone.
    if (typeof usdAmount === 'string' && usdAmount.trim() === '') {
      setUsdAmount(0);
    }
  }, [usdAmount]);

  if (user && capability === 'unsupported') {
    return (
      <UnsupportedSignerQR
        recipientAddress={recipientAddress}
        truncatedRecipient={truncatedRecipient}
        amountSats={amountSats}
        btcPrice={btcPrice}
        usdAmount={usdAmount}
        setUsdAmount={setUsdAmount}
        loginType={loginType}
        onClose={onSuccess}
      />
    );
  }

  return (
    <div className="grid gap-4 px-4 py-4 w-full overflow-hidden">
      {/* Amount — big number on top, editable by clicking. */}
      <div className="flex flex-col items-center pt-2">
        {editingAmount ? (
          <div className="flex items-baseline justify-center">
            <span className={`text-4xl font-semibold ${insufficient ? 'text-destructive' : 'text-muted-foreground'}`}>$</span>
            <input
              ref={amountInputRef}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={usdAmount}
              onChange={(e) => { setUsdAmount(e.target.value); setError(''); }}
              onBlur={commitAmountEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitAmountEdit();
                }
              }}
              aria-label="Amount in USD"
              className={`bg-transparent border-0 outline-none text-4xl font-semibold text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${insufficient ? 'text-destructive' : ''}`}
              style={{ width: `${Math.max(2, String(usdAmount).length + 1)}ch` }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingAmount(true)}
            aria-label="Edit amount"
            className="flex items-baseline justify-center rounded-md px-2 -mx-2 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <span className={`text-4xl font-semibold ${insufficient ? 'text-destructive' : 'text-muted-foreground'}`}>$</span>
            <span className={`text-4xl font-semibold tabular-nums ${insufficient ? 'text-destructive' : ''}`}>
              {hasValidAmount ? currentUsd : 0}
            </span>
          </button>
        )}
      </div>

      {/* Preset buttons sit under the big number. */}
      <ToggleGroup
        type="single"
        value={USD_PRESETS.includes(Number(usdAmount)) ? String(usdAmount) : ''}
        onValueChange={(v) => { if (v) { setUsdAmount(Number(v)); setError(''); setEditingAmount(false); } }}
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

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <Button
        onClick={handleZap}
        disabled={!btcPrice || amountSats <= 0 || isZapping || insufficient}
        variant={(insufficient || isLarge) && !isZapping ? 'destructive' : 'default'}
        className="w-full"
      >
        {isZapping ? (
          <>
            <Loader2 className="size-4 mr-1.5 animate-spin" />
            {progressLabel(progress)}
          </>
        ) : insufficient ? (
          <>Not enough Bitcoin</>
        ) : isLarge && confirmArmed ? (
          <>Tap again to send {totalUsdString}</>
        ) : (
          <>Send {totalUsdString || (hasValidAmount ? `$${currentUsd}` : '')}</>
        )}
      </Button>

      {/* Fee line — click to open speed picker */}
      {amountSats > 0 && (
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
                  const rate = feeRates ? getRateForSpeed(feeRates, speed) : 0;
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

// ──────────────────────────────────────────────────────────────
// Unsupported-signer QR fallback
// ──────────────────────────────────────────────────────────────

interface UnsupportedSignerQRProps {
  recipientAddress: string;
  truncatedRecipient: string;
  amountSats: number;
  btcPrice: number | undefined;
  usdAmount: number | string;
  setUsdAmount: (v: number | string) => void;
  loginType: string | undefined;
  onClose?: () => void;
}

/**
 * Fallback shown when the user's signer can't sign PSBTs locally. Renders a
 * BIP-21 QR the user can scan with any external Bitcoin wallet. Because we
 * never see the resulting tx, we skip publishing the kind 8333 zap event and
 * explicitly warn the user about that.
 */
function UnsupportedSignerQR({
  recipientAddress,
  truncatedRecipient,
  amountSats,
  btcPrice,
  usdAmount,
  setUsdAmount,
  loginType,
  onClose,
}: UnsupportedSignerQRProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<'address' | 'uri' | null>(null);

  // BIP-21 URI. Include `amount` (in BTC, 8 decimals) only when > 0 so an
  // empty-amount placeholder QR doesn't include `?amount=0`.
  const bip21 = useMemo(() => {
    if (!recipientAddress) return '';
    if (amountSats <= 0) return `bitcoin:${recipientAddress}`;
    const btc = (amountSats / 100_000_000).toFixed(8);
    return `bitcoin:${recipientAddress}?amount=${btc}`;
  }, [recipientAddress, amountSats]);

  const explanation =
    loginType === 'extension'
      ? "Your browser extension can't sign Bitcoin transactions."
      : loginType === 'bunker'
        ? "Your remote signer can't sign Bitcoin transactions."
        : "Your signer can't sign Bitcoin transactions.";

  const copy = useCallback(
    async (value: string, which: 'address' | 'uri', label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(which);
        toast({ title: 'Copied', description: `${label} copied to clipboard` });
        setTimeout(() => setCopied(null), 2000);
      } catch {
        toast({ title: 'Copy failed', description: 'Please copy manually.', variant: 'destructive' });
      }
    },
    [toast],
  );

  const currentUsd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
  const hasAmount = amountSats > 0;

  return (
    <div className="grid gap-3 px-4 py-4 w-full overflow-hidden">
      <p className="text-xs text-muted-foreground">
        {explanation} You can still zap by scanning this QR from any Bitcoin wallet.
      </p>

      {/* Amount presets (USD) */}
      <ToggleGroup
        type="single"
        value={USD_PRESETS.includes(Number(usdAmount)) ? String(usdAmount) : ''}
        onValueChange={(v) => { if (v) setUsdAmount(Number(v)); }}
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
          onChange={(e) => setUsdAmount(e.target.value)}
          className="pl-6"
        />
      </div>

      {/* QR / placeholder */}
      <div className="flex justify-center">
        {hasAmount && bip21 ? (
          <div className="bg-white p-3 rounded-xl" aria-label="Bitcoin payment QR code">
            <QRCodeCanvas value={bip21} size={220} level="M" className="block" />
          </div>
        ) : (
          <div className="size-[220px] rounded-xl border border-dashed flex items-center justify-center text-xs text-muted-foreground text-center px-4">
            {btcPrice
              ? 'Choose an amount above to generate a payment QR.'
              : 'Loading BTC price…'}
          </div>
        )}
      </div>

      {/* Amount summary */}
      {hasAmount && btcPrice && (
        <div className="text-center text-sm">
          <span className="font-medium">
            {currentUsd > 0 ? `$${currentUsd}` : ''}
          </span>
          <span className="text-muted-foreground">
            {' · '}{formatSats(amountSats)} sats
          </span>
        </div>
      )}

      {/* Recipient */}
      {recipientAddress && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 min-w-0">
            <Bitcoin className="size-3.5 text-orange-500 shrink-0" />
            <span className="shrink-0">To:</span>
            <span className="font-mono truncate" title={recipientAddress}>{truncatedRecipient}</span>
          </div>
        </div>
      )}

      {/* Copy buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => copy(recipientAddress, 'address', 'Address')}
          disabled={!recipientAddress}
          className="text-xs"
        >
          {copied === 'address' ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
          Copy address
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => copy(bip21, 'uri', 'Payment link')}
          disabled={!hasAmount || !bip21}
          className="text-xs"
        >
          {copied === 'uri' ? <Check className="size-3.5 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
          Copy link
        </Button>
      </div>

      {/* Warning: no kind 8333 will be published */}
      <Alert>
        <AlertTriangle className="size-4" />
        <AlertDescription className="text-xs">
          Because we can't see your transaction, this zap won't show up as yours on Nostr. The recipient will still get the Bitcoin.
        </AlertDescription>
      </Alert>

      {onClose && (
        <Button type="button" variant="secondary" onClick={onClose} className="w-full">
          Done
        </Button>
      )}
    </div>
  );
}
