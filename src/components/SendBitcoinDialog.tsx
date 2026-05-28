import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  AlertTriangle,
  Bitcoin,
  Check,
  ExternalLink,
  EyeOff,
  Loader2,
  QrCode,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ZapSuccessScreen } from '@/components/ZapSuccessScreen';
import { EmojifiedText } from '@/components/CustomEmoji';
import { QrScannerDialog } from '@/components/QrScannerDialog';
import { getAvatarShape } from '@/lib/avatarShape';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useAppContext } from '@/hooks/useAppContext';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { useAuthor } from '@/hooks/useAuthor';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';
import { PortalContainerProvider } from '@/hooks/usePortalContainer';
import { detectIdentifier, type IdentifierMatch } from '@/lib/nostrIdentifier';
import { isNostrId } from '@/lib/nostrId';
import { notificationSuccess } from '@/lib/haptics';
import {
  nostrPubkeyToBitcoinAddress,
  validateBitcoinAddress,
  fetchUTXOs,
  getFeeRates,
  buildUnsignedPsbt,
  buildUnsignedSilentPaymentPsbt,
  finalizePsbt,
  broadcastTransaction,
  estimateFee,
  satsToUSD,
  isLargeAmount,
  looksLikeSilentPaymentAddress,
  parseBitcoinUri,
  validateSilentPaymentAddress,
  type FeeRates,
} from '@/lib/bitcoin';
import { extractTxFromSignedPsbtV2 } from '@/lib/psbtV2';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USD_PRESETS = [1, 5, 10, 25, 100];

type FeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

const FEE_SPEED_LABELS: Record<FeeSpeed, string> = {
  fastest: '~10 min',
  halfHour: '~30 min',
  hour: '~1 hour',
  economy: '~1 day',
};

const FEE_SPEED_ORDER: FeeSpeed[] = ['fastest', 'halfHour', 'hour', 'economy'];

function getRateForSpeed(rates: FeeRates, speed: FeeSpeed): number {
  switch (speed) {
    case 'fastest': return rates.fastestFee;
    case 'halfHour': return rates.halfHourFee;
    case 'hour': return rates.hourFee;
    case 'economy': return rates.economyFee;
  }
}

/** Deduplicate fee tiers that share the same sat/vB rate. */
function getUniqueFeeSpeeds(rates: FeeRates | undefined): FeeSpeed[] {
  if (!rates) return FEE_SPEED_ORDER;
  const seen = new Set<number>();
  const result: FeeSpeed[] = [];
  for (const speed of FEE_SPEED_ORDER) {
    const rate = getRateForSpeed(rates, speed);
    if (!seen.has(rate)) {
      seen.add(rate);
      result.push(speed);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A recipient resolved to send Bitcoin to. Always carries a destination
 * address — either a regular on-chain Bitcoin address (`bc1…` / `1…` / `3…`)
 * or a BIP-352 silent payment address (`sp1…`).
 *
 * When `pubkey` is set, the recipient is also a Nostr identity — meaning we
 * can publish a kind 8333 profile-zap attesting the send.
 */
interface ResolvedRecipient {
  /** Bitcoin address or silent payment address (`sp1…`) to send to. */
  address: string;
  /**
   * Address kind. `'onchain'` covers all standard scriptPubKey types; `'sp'`
   * is BIP-352 silent payment and goes through {@link buildUnsignedSilentPaymentPsbt}.
   */
  kind: 'onchain' | 'sp';
  /** Hex Nostr pubkey, when the recipient is a Nostr user. */
  pubkey?: string;
  /** Optional profile metadata for display. */
  profile?: SearchProfile;
  /** Raw text the user originally typed (for re-display on backspace). */
  raw: string;
}

interface SendBitcoinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** BTC/USD price — passed from the parent to avoid a duplicate fetch. */
  btcPrice?: number;
  /**
   * Optional BIP-21 `bitcoin:` URI to prefill the form with. When the dialog
   * opens with this set, the recipient (and amount, if present and resolvable
   * to USD) is seeded as if the user had pasted it. The user can still edit
   * the amount before sending.
   */
  initialUri?: string;
}

interface SendResult {
  txid: string;
  amountSats: number;
  /** Set when the recipient was a Nostr user (kind 8333 published). */
  recipientPubkey?: string;
  /** Bitcoin network fee in satoshis. */
  fee: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Wallet "Send Bitcoin" dialog. Mirrors the `OnchainZapContent` UX for the
 * standalone wallet flow:
 *
 *  - Single screen, no review step. Big editable USD amount on top, USD preset
 *    chips below.
 *  - Recipient picker with profile autocomplete (same lookups as the global
 *    search bar — profiles only, plus pasted npub/nprofile/nip05/hex), and
 *    fallback acceptance of a raw Bitcoin address (bc1…).
 *  - Fee speed shown as a small line below the send button; popover for picking.
 *  - When the recipient is a Nostr identity, publishes a kind 8333 onchain-zap
 *    event after broadcast (no `e`/`a` tag → profile-level zap, per NIP.md).
 */
export function SendBitcoinDialog({ isOpen, onClose, btcPrice, initialUri }: SendBitcoinDialogProps) {
  const { user } = useCurrentUser();
  const { canSignPsbt, signPsbt } = useBitcoinSigner();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const { config } = useAppContext();
  const { esploraApis } = config;
  const queryClient = useQueryClient();

  // ── Form state ───────────────────────────────────────────────
  const [recipient, setRecipient] = useState<ResolvedRecipient | null>(null);
  const [usdAmount, setUsdAmount] = useState<number | string>(5);
  const [feeSpeed, setFeeSpeed] = useState<FeeSpeed>('halfHour');
  const [error, setError] = useState('');
  const [editingAmount, setEditingAmount] = useState(false);
  const [feePopoverOpen, setFeePopoverOpen] = useState(false);
  const [success, setSuccess] = useState<SendResult | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);
  const feeSpeedUserChanged = useRef(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>(undefined);
  const dialogContentRef = useCallback((node: HTMLElement | null) => {
    setPortalContainer(node ?? undefined);
  }, []);

  // ── BIP-21 prefill ───────────────────────────────────────────
  //
  // When the dialog opens with an `initialUri` (e.g. from a `bitcoin:` deep
  // link), seed the recipient and amount from it. The recipient is seeded
  // immediately. The amount seed waits for `btcPrice` to load so we can
  // convert sats → USD (the form's native unit). The user can edit either
  // field before sending.
  //
  // `initialUriHandled` prevents the URI from re-applying after the user
  // edits or clears the prefill within the same open cycle. It resets when
  // the dialog closes (see `handleClose`).
  const initialUriHandled = useRef(false);
  const pendingAmountSats = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialUriHandled.current) return;
    if (!initialUri) return;

    const parsed = parseBitcoinUri(initialUri);
    if (!parsed) {
      initialUriHandled.current = true;
      return;
    }

    // Resolve a recipient from the URI. Prefer the silent-payment address
    // when present and valid (better privacy), else the on-chain fallback.
    // If neither validates, leave the recipient slot empty and surface an
    // error — the URI was malformed.
    const spCandidate = parsed.sp;
    if (spCandidate && looksLikeSilentPaymentAddress(spCandidate) && validateSilentPaymentAddress(spCandidate)) {
      setRecipient({ address: spCandidate, kind: 'sp', raw: spCandidate });
    } else if (parsed.address && validateBitcoinAddress(parsed.address)) {
      setRecipient({ address: parsed.address, kind: 'onchain', raw: parsed.address });
    } else {
      setError("Couldn't read the payment address from that link.");
    }

    pendingAmountSats.current = parsed.amountSats ?? null;
    initialUriHandled.current = true;
  }, [isOpen, initialUri]);

  // Apply the pending amount once `btcPrice` is available. The form stores
  // a USD value; we round to cents for a clean display, but the actual send
  // amount comes from `amountSats` recomputed from the USD value, so tiny
  // rounding differences (< $0.005) get smoothed out at send time.
  useEffect(() => {
    if (!isOpen) return;
    const sats = pendingAmountSats.current;
    if (sats == null || !btcPrice) return;

    const usd = (sats / 100_000_000) * btcPrice;
    if (Number.isFinite(usd) && usd > 0) {
      setUsdAmount(Math.round(usd * 100) / 100);
    }
    pendingAmountSats.current = null;
  }, [isOpen, btcPrice]);

  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';

  // ── Data fetching ────────────────────────────────────────────

  const { data: utxos } = useQuery({
    queryKey: ['bitcoin-utxos', esploraApis, senderAddress],
    queryFn: ({ signal }) => fetchUTXOs(senderAddress, esploraApis, signal),
    enabled: !!senderAddress && isOpen && canSignPsbt,
    staleTime: 30_000,
  });

  const { data: feeRates } = useQuery({
    queryKey: ['bitcoin-fee-rates', esploraApis],
    queryFn: ({ signal }) => getFeeRates(esploraApis, signal),
    enabled: isOpen && canSignPsbt,
    staleTime: 30_000,
  });

  const totalBalance = useMemo(() => utxos?.reduce((s, u) => s + u.value, 0) ?? 0, [utxos]);

  const currentFeeRate = useMemo(() => {
    if (!feeRates) return 0;
    return getRateForSpeed(feeRates, feeSpeed);
  }, [feeRates, feeSpeed]);

  // ── USD → sats conversion ────────────────────────────────────

  const amountSats = useMemo(() => {
    if (!btcPrice) return 0;
    const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
    if (!Number.isFinite(usd) || usd <= 0) return 0;
    const btc = usd / btcPrice;
    return Math.round(btc * 100_000_000);
  }, [usdAmount, btcPrice]);

  const estimatedFeeSats = useMemo(() => {
    if (!utxos?.length || !currentFeeRate || !amountSats) return 0;
    // Estimate with 2 outputs first, then check whether change would be dust
    const fee2 = estimateFee(utxos.length, 2, currentFeeRate);
    const change = totalBalance - amountSats - fee2;
    const numOutputs = change > 546 ? 2 : 1;
    return estimateFee(utxos.length, numOutputs, currentFeeRate);
  }, [utxos, currentFeeRate, amountSats, totalBalance]);

  const totalSats = amountSats + estimatedFeeSats;
  const insufficient = totalBalance > 0 && totalSats > totalBalance;
  const showBalance = insufficient || (amountSats > 0 && totalBalance === 0);

  // Auto-tune the fee speed so the network fee stays under 40% of the send
  // amount, unless the user has manually picked a speed. Mirrors OnchainZapContent.
  useEffect(() => {
    if (feeSpeedUserChanged.current) return;
    if (!utxos?.length || !feeRates || amountSats <= 0) return;

    const uniqueSpeeds = getUniqueFeeSpeeds(feeRates);
    const threshold = amountSats * 0.4;

    let target: FeeSpeed = uniqueSpeeds[uniqueSpeeds.length - 1];
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

  const handleFeeSpeedChange = useCallback((speed: FeeSpeed) => {
    feeSpeedUserChanged.current = true;
    setFeeSpeed(speed);
    setFeePopoverOpen(false);
  }, []);

  // ── Two-tap "arm" for large amounts ──────────────────────────

  const isLarge = isLargeAmount(totalSats, btcPrice);
  const [confirmArmed, setConfirmArmed] = useState(false);

  // ── Raw Bitcoin address privacy notice ──────────────────────
  //
  // When the recipient is a raw on-chain address (no Nostr pubkey attached),
  // Bitcoin's public ledger means the send can be linked back to the sender's
  // wallet forever. We show a soft amber notice so the user understands the
  // trade-off, but don't gate the send on it — the warning is informational.
  //
  // Silent payment recipients (BIP-352) do not have this problem — the
  // on-chain output is derived per-transaction and is indistinguishable
  // from any other P2TR output, so the recipient's identity isn't exposed
  // on chain. We skip the notice for SP sends.

  const isRawAddress = !!recipient && !recipient.pubkey && recipient.kind !== 'sp';

  useEffect(() => {
    setConfirmArmed(false);
  }, [amountSats, currentFeeRate, btcPrice, recipient?.address]);

  // The two-tap arm is reserved for large amounts; raw on-chain sends no
  // longer trigger it on their own.
  const requiresArm = isLarge;

  // ── Big amount focus management ──────────────────────────────

  useEffect(() => {
    if (editingAmount) {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }
  }, [editingAmount]);

  const commitAmountEdit = useCallback(() => {
    setEditingAmount(false);
    if (typeof usdAmount === 'string' && usdAmount.trim() === '') {
      setUsdAmount(0);
    }
  }, [usdAmount]);

  // ── Send mutation ────────────────────────────────────────────

  const [progress, setProgress] = useState<'idle' | 'building' | 'signing' | 'broadcasting' | 'publishing'>('idle');

  const sendMutation = useMutation<SendResult, Error, void>({
    mutationFn: async () => {
      if (!user) throw new Error('You must be logged in.');
      if (!recipient) throw new Error('Choose a recipient.');
      if (!canSignPsbt || !signPsbt) throw new Error("Your login doesn't support sending Bitcoin.");
      if (!utxos?.length) throw new Error('No spendable Bitcoin available.');
      if (!feeRates) throw new Error('Fee rates not loaded.');
      if (recipient.pubkey === user.pubkey) throw new Error("You can't send to yourself.");
      if (amountSats <= 0) throw new Error('Enter an amount.');
      if (insufficient) throw new Error('Not enough Bitcoin for this amount + network fee.');

      setProgress('building');
      const rate = getRateForSpeed(feeRates, feeSpeed);

      let psbtHex: string;
      let fee: number;
      if (recipient.kind === 'sp') {
        // BIP-375 silent payment: build a PSBT v2 with PSBT_OUT_SP_V0_INFO,
        // hand it to the signer (NIP-07 / NIP-46 / local nsec — all assumed
        // to understand BIP-375 PSBTs, per the wallet's signer contract),
        // and extract a finalized raw transaction from the response.
        ({ psbtHex, fee } = buildUnsignedSilentPaymentPsbt(
          user.pubkey,
          recipient.address,
          amountSats,
          utxos,
          rate,
        ));
      } else {
        ({ psbtHex, fee } = buildUnsignedPsbt(
          user.pubkey,
          recipient.address,
          amountSats,
          utxos,
          rate,
        ));
      }

      setProgress('signing');
      const signedHex = await signPsbt(psbtHex);
      // BIP-375 signers return a finalized PSBT v2; the legacy signer path
      // returns a PSBT v0 we hand to `finalizePsbt`. We pick by the input
      // PSBT shape we sent.
      const txHex = recipient.kind === 'sp'
        ? extractTxFromSignedPsbtV2(signedHex)
        : finalizePsbt(signedHex);

      setProgress('broadcasting');
      const txid = await broadcastTransaction(txHex, esploraApis);

      // When the recipient is a Nostr identity, publish a kind 8333 profile zap
      // attesting the send. Per NIP.md, omitting `e`/`a` targets the recipient's
      // profile (a tip to the pubkey, not a specific event).
      if (recipient.pubkey) {
        setProgress('publishing');
        try {
          await publishEvent({
            kind: 8333,
            content: '',
            tags: [
              ['i', `bitcoin:tx:${txid}`],
              ['p', recipient.pubkey],
              ['amount', String(amountSats)],
              ['alt', `On-chain zap: ${amountSats.toLocaleString()} sats`],
            ],
          });
        } catch (err) {
          // The Bitcoin transaction already broadcast — the kind 8333 is a
          // best-effort attestation. Surface the failure but don't blow up
          // the success screen.
          console.warn('Failed to publish kind 8333 zap event:', err);
        }
      }

      return {
        txid,
        amountSats,
        recipientPubkey: recipient.pubkey,
        fee,
      };    },
    onSuccess: (result) => {
      notificationSuccess();
      setSuccess(result);
      // Invalidate caches that track balances / zaps
      queryClient.invalidateQueries({ queryKey: ['bitcoin-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-utxos'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-balance'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-txs'] });
      if (result.recipientPubkey) {
        queryClient.invalidateQueries({ queryKey: ['onchain-zaps'] });
      }
    },
    onError: (err) => {
      toast({ title: 'Transaction failed', description: err.message, variant: 'destructive' });
    },
    onSettled: () => {
      setProgress('idle');
    },
  });

  // ── Send handler ─────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    setError('');
    if (!user) { setError('You must be logged in.'); return; }
    if (!recipient) { setError('Choose a recipient.'); return; }
    if (recipient.pubkey === user.pubkey) { setError("You can't send to yourself."); return; }
    if (!btcPrice) { setError('Waiting for BTC price…'); return; }
    if (amountSats <= 0) { setError('Enter an amount.'); return; }
    if (!utxos?.length) { setError("You don't have any Bitcoin yet."); return; }
    if (insufficient) { setError('Not enough Bitcoin for this amount + network fee.'); return; }

    if (requiresArm && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }

    try {
      await sendMutation.mutateAsync();
    } catch {
      // Toast handled in onError; nothing further to do here.
    }
  }, [user, recipient, btcPrice, amountSats, utxos, insufficient, requiresArm, confirmArmed, sendMutation]);

  // ── Reset on close ───────────────────────────────────────────

  const handleClose = useCallback(() => {
    setRecipient(null);
    setUsdAmount(5);
    setError('');
    setFeeSpeed('halfHour');
    setSuccess(null);
    setConfirmArmed(false);
    setEditingAmount(false);
    feeSpeedUserChanged.current = false;
    initialUriHandled.current = false;
    pendingAmountSats.current = null;
    onClose();
  }, [onClose]);

  // ── Render ───────────────────────────────────────────────────

  const currentUsd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
  const hasValidAmount = Number.isFinite(currentUsd) && currentUsd > 0;
  const totalUsdString = btcPrice ? satsToUSD(totalSats, btcPrice) : '';
  const uniqueFeeSpeeds = useMemo(() => getUniqueFeeSpeeds(feeRates), [feeRates]);
  const isPending = sendMutation.isPending;

  // ── Unsupported signer ───────────────────────────────────────

  if (isOpen && !canSignPsbt) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-orange-500" />
            Sending Not Available
          </DialogTitle>
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Your login doesn't support sending Bitcoin. Log in with your secret key to send.
            </AlertDescription>
          </Alert>
          <Button onClick={handleClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        ref={dialogContentRef}
        className="max-w-[425px] rounded-2xl p-0 gap-0 border-border overflow-visible max-h-[95vh] [&>button]:hidden"
      >
        <PortalContainerProvider value={portalContainer}>
        <div className="flex items-center justify-between px-4 h-12">
          <DialogTitle className="text-base font-semibold flex items-center gap-1.5">
            {success ? 'Success' : 'Send Bitcoin'}
          </DialogTitle>
          <button
            onClick={handleClose}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-3rem)]">
          {success ? (
            success.recipientPubkey ? (
              <ZapSuccessScreen
                recipientPubkey={success.recipientPubkey}
                amountSats={success.amountSats}
                btcPrice={btcPrice}
                txid={success.txid}
                onClose={handleClose}
              />
            ) : (
              <RawAddressSuccess
                txid={success.txid}
                amountSats={success.amountSats}
                btcPrice={btcPrice}
                onClose={handleClose}
              />
            )
          ) : (
            <div className="grid gap-4 px-4 py-4 w-full overflow-hidden">
              {/* Big editable USD amount */}
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
                        if (e.key === 'Enter') { e.preventDefault(); commitAmountEdit(); }
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

              {/* Preset chips */}
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
                    className="h-8 min-w-0 text-xs font-semibold px-1"
                  >
                    ${v}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              {/* Recipient picker */}
              <RecipientPicker
                value={recipient}
                onChange={(v) => { setRecipient(v); setError(''); }}
              />

              {/* Error */}
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}

              {/* Privacy notice for raw Bitcoin addresses. Informational
                  only — we no longer gate the send on an acknowledgement. */}
              {isRawAddress && (
                <Alert className="border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
                  <AlertTriangle className="size-4" />
                  <AlertDescription className="text-xs">
                    Money you send is public and can be traced back to you.{' '}
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="underline underline-offset-2 font-medium hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          Learn more
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="start" className="w-72 text-xs leading-relaxed">
                        Bitcoin is a public ledger. Transactions you send can
                        be traced back to you forever, even after being
                        exchanged by multiple people. Send it only to those
                        you wish to support publicly, or cash out at an
                        exchange.
                      </PopoverContent>
                    </Popover>
                  </AlertDescription>
                </Alert>
              )}

              {/* Send button */}
              <Button
                onClick={handleSend}
                disabled={
                  !btcPrice
                  || amountSats <= 0
                  || isPending
                  || insufficient
                  || !recipient
                }
                variant={(insufficient || requiresArm) && !isPending ? 'destructive' : 'default'}
                className="w-full"
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                    {progressLabel(progress)}
                  </>
                ) : insufficient ? (
                  <>Not enough Bitcoin</>
                ) : requiresArm && confirmArmed ? (
                  <>Tap again to send {totalUsdString}</>
                ) : (
                  <>Send {totalUsdString || (hasValidAmount ? `$${currentUsd}` : '')}</>
                )}
              </Button>

              {/* Fee line / picker */}
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
                              className={cn(
                                'flex items-center justify-between px-2 py-1.5 rounded-sm text-xs text-left hover:bg-muted transition-colors',
                                selected && 'bg-muted font-medium',
                              )}
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
        </PortalContainerProvider>
      </DialogContent>
    </Dialog>
  );
}

function progressLabel(progress: 'idle' | 'building' | 'signing' | 'broadcasting' | 'publishing'): string {
  switch (progress) {
    case 'building': return 'Building…';
    case 'signing': return 'Signing…';
    case 'broadcasting': return 'Broadcasting…';
    case 'publishing': return 'Publishing…';
    default: return 'Sending…';
  }
}

// ═══════════════════════════════════════════════════════════════════
// Recipient picker
// ═══════════════════════════════════════════════════════════════════

interface RecipientPickerProps {
  value: ResolvedRecipient | null;
  onChange: (value: ResolvedRecipient | null) => void;
}

/**
 * Combobox that lets the user pick a Nostr profile from autocomplete, paste a
 * Nostr identifier (npub/nprofile/nip05/hex), or type a raw Bitcoin address.
 *
 * The dropdown intentionally only surfaces profile-shaped suggestions — no
 * Wikipedia / Internet Archive / country / nav-item rows. That keeps the
 * picker focused: every selection is something the user can actually be paid.
 */
function RecipientPicker({ value, onChange }: RecipientPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);

  // BIP-21 `bitcoin:` URI handling. If the user pastes one, we route the
  // same way the QR scanner does (sp first, on-chain fallback), but when the
  // URI carries *both* a valid on-chain address and a valid `sp=` parameter
  // we surface both rows so the user can pick the privacy/compatibility
  // trade-off. A raw bc1…/sp1… input falls through here unchanged: `bip21`
  // is null and the candidate is just the trimmed query.
  const trimmedRaw = query.trim();
  const bip21 = useMemo(() => parseBitcoinUri(trimmedRaw), [trimmedRaw]);

  const btcCandidate = useMemo(() => {
    const c = bip21 ? bip21.address : trimmedRaw;
    if (!c) return '';
    if (looksLikeSilentPaymentAddress(c)) return ''; // sp addresses live in spCandidate
    return validateBitcoinAddress(c) ? c : '';
  }, [bip21, trimmedRaw]);

  const spCandidate = useMemo(() => {
    // From the URI: prefer `sp=` if valid; otherwise the path may itself be
    // an sp1 address (rare but legal — `bitcoin:sp1…` is just a URI without
    // an on-chain fallback).
    const c = bip21 ? (bip21.sp ?? bip21.address) : trimmedRaw;
    if (!c) return '';
    if (!looksLikeSilentPaymentAddress(c)) return '';
    return validateSilentPaymentAddress(c) ? c : '';
  }, [bip21, trimmedRaw]);

  // Suppress profile search when the input already resolves to a Bitcoin
  // address, silent payment address, or `bitcoin:` URI. Without this, the
  // NIP-50 relay search runs against the URI / address string and the
  // (usually empty, but sometimes substring-matching) results race against
  // the local address-recognition path — flashing a "Send to silent payment
  // address" row that gets flooded out by stragglers a moment later. It also
  // avoids leaking the recipient address to the search relay.
  const isAddressLike = !!btcCandidate || !!spCandidate;
  const searchQuery = isAddressLike ? '' : query;

  const { data: rawProfiles, isFetching: rawIsFetching, followedPubkeys } = useSearchProfiles(searchQuery);
  // Drop any stale profile data once the input becomes address-like, so the
  // dropdown doesn't briefly show a "Silent payment" row alongside leftover
  // search results from a previous query.
  const profiles = isAddressLike ? undefined : rawProfiles;
  const isFetching = isAddressLike ? false : rawIsFetching;

  const identifierMatch = useMemo(() => {
    const m = detectIdentifier(query);
    if (!m) return null;
    // Only pubkey-resolvable identifiers belong in this picker.
    switch (m.type) {
      case 'npub':
      case 'nprofile':
      case 'nip05':
      case 'hex':
        return m;
      default:
        return null;
    }
  }, [query]);

  // Raw on-chain bitcoin address fallback — only when nothing else matches.
  const hasBtcAddress = !identifierMatch
    && !!btcCandidate
    && !profiles?.length;

  // BIP-352 silent payment address fallback — recognised independently of
  // on-chain addresses so the dropdown can show a distinct "Silent payment"
  // row with the right privacy framing. When the input is a BIP-21 URI
  // carrying both, this and `hasBtcAddress` are both true and the user
  // picks which payment path to use.
  const hasSpAddress = !identifierMatch
    && !!spCandidate
    && !profiles?.length;

  // Deduplicate: if the identifier resolves to a pubkey that's also in the
  // profile results, drop it from the profile list.
  const identifierPubkey = useMemo(() => {
    if (!identifierMatch) return undefined;
    if (identifierMatch.type === 'npub' || identifierMatch.type === 'nprofile') return identifierMatch.pubkey;
    if (identifierMatch.type === 'hex') return identifierMatch.hex;
    return undefined; // nip05 resolves async; handled by IdentifierRow
  }, [identifierMatch]);

  const filteredProfiles = useMemo(() => {
    if (!profiles || !identifierPubkey) return profiles ?? [];
    return profiles.filter((p) => p.pubkey !== identifierPubkey);
  }, [profiles, identifierPubkey]);

  const hasIdentifier = !!identifierMatch;
  const profileCount = filteredProfiles.length;
  const totalItems = (hasIdentifier ? 1 : 0) + profileCount + (hasSpAddress ? 1 : 0) + (hasBtcAddress ? 1 : 0);

  // Open the dropdown whenever we have any suggestion or a non-empty query.
  useEffect(() => {
    if (trimmedRaw.length === 0) {
      setOpen(false);
      return;
    }
    if (hasIdentifier || hasBtcAddress || hasSpAddress || profileCount > 0 || isFetching) {
      setOpen(true);
    }
  }, [trimmedRaw, hasIdentifier, hasBtcAddress, hasSpAddress, profileCount, isFetching]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [profiles, identifierMatch, hasBtcAddress, hasSpAddress]);

  const selectProfile = useCallback((profile: SearchProfile) => {
    const address = nostrPubkeyToBitcoinAddress(profile.pubkey);
    if (!address) return;
    onChange({
      address,
      kind: 'onchain',
      pubkey: profile.pubkey,
      profile,
      raw: query,
    });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange, query]);

  const selectPubkey = useCallback((pubkey: string, raw: string) => {
    if (!isNostrId(pubkey)) return;
    const address = nostrPubkeyToBitcoinAddress(pubkey);
    if (!address) return;
    onChange({ address, kind: 'onchain', pubkey, raw });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  const selectBtcAddress = useCallback((address: string) => {
    onChange({ address, kind: 'onchain', raw: address });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  const selectSpAddress = useCallback((address: string) => {
    onChange({ address, kind: 'sp', raw: address });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [onChange]);

  const handleScan = useCallback((scanned: string) => {
    setScannerOpen(false);

    // Strip optional `nostr:` / `bitcoin:` URI prefixes. For `bitcoin:` the
    // BIP-21 payload is `bitcoin:<address>[?params]`. We honor the BIP-352
    // `sp=` parameter (silent payment recipient) when present and valid,
    // preferring it over the on-chain fallback address. Other params
    // (`amount`, `label`, `message`, `lightning`, …) are ignored; the user
    // picks the amount in the dialog.
    const scannedTrimmed = scanned.trim();
    const bip21 = parseBitcoinUri(scannedTrimmed);
    const candidate = bip21 ? bip21.address : scannedTrimmed;
    const spParam = bip21?.sp;

    // When a `bitcoin:` URI carries BOTH a valid on-chain address AND a valid
    // `sp=` silent payment address, surface both choices in the dropdown
    // instead of auto-routing — matches the paste/type behavior so the user
    // explicitly picks privacy (sp) vs. compatibility (on-chain). Pushing the
    // raw URI into the query input lets the existing `btcCandidate` and
    // `spCandidate` memos render both `BtcAddressRow` and `SpAddressRow`.
    if (bip21) {
      const hasValidBtc = !!candidate && validateBitcoinAddress(candidate);
      const hasValidSp = !!spParam
        && looksLikeSilentPaymentAddress(spParam)
        && validateSilentPaymentAddress(spParam);
      if (hasValidBtc && hasValidSp) {
        setQuery(scannedTrimmed);
        setOpen(true);
        inputRef.current?.focus();
        return;
      }
    }

    // BIP-352 silent payment via `bitcoin:…?sp=sp1…` takes priority over the
    // on-chain fallback. A scanned URI like `bitcoin:bc1q…?sp=sp1q…` means
    // "send via silent payment if you can; otherwise fall back to bc1q…".
    // We can, so we do.
    if (spParam && looksLikeSilentPaymentAddress(spParam) && validateSilentPaymentAddress(spParam)) {
      selectSpAddress(spParam);
      return;
    }

    // Direct on-chain address → resolve immediately.
    if (validateBitcoinAddress(candidate)) {
      selectBtcAddress(candidate);
      return;
    }

    // BIP-352 silent payment address → resolve immediately.
    if (looksLikeSilentPaymentAddress(candidate) && validateSilentPaymentAddress(candidate)) {
      selectSpAddress(candidate);
      return;
    }

    // Anything else (npub/nprofile/nip05/hex, with or without `nostr:` prefix)
    // gets fed into the query so the existing identifier-detection + dropdown
    // logic picks it up. The user taps the resulting row to confirm.
    if (detectIdentifier(candidate)) {
      setQuery(candidate);
      setOpen(true);
      inputRef.current?.focus();
      return;
    }

    toast({
      title: "Couldn't read that QR code",
      description: 'Expected a Bitcoin address, a silent payment address (sp1…), or a Nostr identifier (npub, nprofile, NIP-05).',
      variant: 'destructive',
    });
  }, [selectBtcAddress, selectSpAddress, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && selectedIndex >= 0 && selectedIndex < totalItems) {
        // Order: [identifier?, ...profiles, btcAddress?, spAddress?]
        let idx = selectedIndex;
        if (hasIdentifier) {
          if (idx === 0) {
            // IdentifierRow handles its own selection via DOM click — the
            // selectedPubkey may need NIP-05 resolution.
            const items = popoverContentRef.current?.querySelectorAll('[data-recipient-item]');
            (items?.[selectedIndex] as HTMLElement | undefined)?.click();
            return;
          }
          idx -= 1;
        }
        if (idx < profileCount) {
          selectProfile(filteredProfiles[idx]);
          return;
        }
        idx -= profileCount;
        if (hasSpAddress && idx === 0) {
          selectSpAddress(spCandidate);
          return;
        }
        if (hasSpAddress) idx -= 1;
        if (hasBtcAddress && idx === 0) {
          selectBtcAddress(btcCandidate);
          return;
        }
      }
      return;
    }

    if (!open || totalItems === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    }
  };

  // ── Selected-chip view ─────────────────────────────────────

  if (value) {
    return (
      <SelectedRecipientChip value={value} onClear={() => onChange(null)} />
    );
  }

  // ── Input + dropdown ───────────────────────────────────────

  // The dropdown is a Radix Popover anchored to the input. It portals into
  // the Send Bitcoin DialogContent (which is itself overflow-visible) via
  // PortalContainerProvider so it can extend past the dialog's body while
  // remaining inside the dialog's RemoveScroll boundary — touch-scroll
  // inside the results list still works on mobile.
  const showEmptyState = trimmedRaw.length > 0 && !isFetching && totalItems === 0;
  const popoverOpen = open && (totalItems > 0 || showEmptyState);

  return (
    <Popover open={popoverOpen} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (trimmedRaw.length > 0) setOpen(true); }}
            // Tapping the input reopens the dropdown after an outside-click
            // dismiss. `onFocus` only fires on the first tap; subsequent taps
            // while the input is still focused need their own opener so the
            // user can recover the choice list without un-focusing first.
            onClick={() => { if (trimmedRaw.length > 0) setOpen(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Search people, paste npub, or enter a Bitcoin or sp1… address"
            autoComplete="off"
            role="combobox"
            aria-expanded={popoverOpen}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            className="rounded-full pr-11"
          />

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            aria-label="Scan QR code"
            className="absolute right-1 top-1/2 -translate-y-1/2 size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <QrCode className="size-4" />
          </button>

          <QrScannerDialog
            isOpen={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onScan={handleScan}
            title="Scan recipient QR"
          />
        </div>
      </PopoverAnchor>

      <PopoverContent
        ref={popoverContentRef}
        align="start"
        sideOffset={6}
        // Keep typing focus in the input on open/close — Radix's default is
        // to focus the popover content, which would steal focus from the
        // input and dismiss the mobile keyboard mid-type.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        style={{ width: 'var(--radix-popover-trigger-width)' }}
        className="p-0 w-[--radix-popover-trigger-width] rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
      >
        {totalItems > 0 ? (
          <div role="listbox" className="max-h-[280px] overflow-y-auto py-1">
            {hasIdentifier && (
              <IdentifierRow
                match={identifierMatch!}
                isSelected={selectedIndex === 0}
                onSelectPubkey={selectPubkey}
              />
            )}
            {filteredProfiles.map((profile, i) => (
              <ProfileRow
                key={profile.pubkey}
                profile={profile}
                isFollowed={followedPubkeys.has(profile.pubkey)}
                isSelected={selectedIndex === (hasIdentifier ? i + 1 : i)}
                onClick={selectProfile}
              />
            ))}
            {hasSpAddress && (
              <SpAddressRow
                address={spCandidate}
                isSelected={selectedIndex === (hasIdentifier ? 1 : 0) + profileCount}
                onClick={selectSpAddress}
              />
            )}
            {hasBtcAddress && (
              <BtcAddressRow
                address={btcCandidate}
                isSelected={selectedIndex === totalItems - 1}
                onClick={selectBtcAddress}
              />
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No matches. Paste an npub, a Bitcoin address, or a silent payment address.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Selected recipient chip ───────────────────────────────────

function SelectedRecipientChip({
  value,
  onClear,
}: {
  value: ResolvedRecipient;
  onClear: () => void;
}) {
  const { pubkey, profile, address, kind } = value;
  // Author lookup only when we have a pubkey but no inline profile.
  const author = useAuthor(profile ? undefined : pubkey);
  const metadata = profile?.metadata ?? author.data?.metadata;
  const tags = profile?.event.tags ?? author.data?.event?.tags ?? [];

  const displayName = pubkey
    ? metadata?.name || metadata?.display_name || genUserName(pubkey)
    : kind === 'sp'
      ? 'Silent payment address'
      : 'Bitcoin address';

  const subtitle = pubkey
    ? metadata?.nip05 ?? nip19.npubEncode(pubkey)
    : `${address.slice(0, 12)}…${address.slice(-8)}`;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 pl-2 pr-2 py-1.5 w-full min-w-0 max-w-full">
      {pubkey ? (
        <Avatar shape={getAvatarShape(metadata)} className="size-9 shrink-0">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      ) : kind === 'sp' ? (
        <div className="size-9 shrink-0 rounded-full bg-violet-500/10 flex items-center justify-center">
          <EyeOff className="size-4 text-violet-500" />
        </div>
      ) : (
        <div className="size-9 shrink-0 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Bitcoin className="size-4 text-orange-500" />
        </div>
      )}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="text-[11px] text-muted-foreground leading-tight">To</div>
        <div className="text-sm font-medium truncate">
          {pubkey ? <EmojifiedText tags={tags}>{displayName}</EmojifiedText> : displayName}
        </div>
        <div className={cn('text-xs text-muted-foreground truncate', !pubkey && 'font-mono')}>
          {subtitle}
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear recipient"
        className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ── Profile dropdown row ──────────────────────────────────────

function ProfileRow({
  profile,
  isFollowed,
  isSelected,
  onClick,
}: {
  profile: SearchProfile;
  isFollowed: boolean;
  isSelected: boolean;
  onClick: (profile: SearchProfile) => void;
}) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.name || metadata.display_name || genUserName(pubkey);
  const subtitle = metadata.nip05 ?? nip19.npubEncode(pubkey);

  return (
    <button
      type="button"
      data-recipient-item
      role="option"
      aria-selected={isSelected}
      onClick={() => onClick(profile)}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
    >
      <div className="relative shrink-0">
        <Avatar shape={getAvatarShape(metadata)} className="size-9">
          <AvatarImage src={metadata.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isFollowed && (
          <span
            className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-primary flex items-center justify-center ring-2 ring-popover"
            title="Following"
          >
            <UserRoundCheck className="size-2 text-primary-foreground" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">
          <EmojifiedText tags={profile.event.tags}>{displayName}</EmojifiedText>
        </div>
        <div className={cn('text-xs text-muted-foreground truncate', !metadata.nip05 && 'font-mono')}>
          {subtitle}
        </div>
      </div>
    </button>
  );
}

// ── Identifier (npub / nprofile / nip05 / hex) dropdown row ───

function IdentifierRow({
  match,
  isSelected,
  onSelectPubkey,
}: {
  match: IdentifierMatch;
  isSelected: boolean;
  onSelectPubkey: (pubkey: string, raw: string) => void;
}) {
  // Resolve nip05 → pubkey asynchronously. For other types we already have
  // the pubkey inline.
  const nip05Id = match.type === 'nip05' ? match.identifier : undefined;
  const { data: nip05Pubkey, isLoading: isResolvingNip05 } = useNip05Resolve(nip05Id);

  const pubkey = match.type === 'npub' || match.type === 'nprofile'
    ? match.pubkey
    : match.type === 'hex'
      ? match.hex
      : nip05Pubkey ?? undefined;

  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = pubkey
    ? metadata?.name || metadata?.display_name || genUserName(pubkey)
    : match.type === 'nip05' ? match.identifier : '';

  const subtitle = match.type === 'nip05'
    ? match.identifier
    : pubkey
      ? metadata?.nip05 ?? `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`
      : '';

  const handleClick = useCallback(() => {
    if (!pubkey) return;
    const raw = match.type === 'nip05' ? match.identifier
      : match.type === 'hex' ? match.hex
        : match.raw;
    onSelectPubkey(pubkey, raw);
  }, [pubkey, match, onSelectPubkey]);

  if (isResolvingNip05) {
    return (
      <div
        data-recipient-item
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 text-left',
          isSelected && 'bg-accent text-accent-foreground',
        )}
      >
        <div className="size-9 shrink-0 rounded-full bg-secondary animate-pulse" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="h-3.5 w-24 bg-secondary animate-pulse rounded" />
          <div className="h-3 w-32 bg-secondary animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!pubkey) {
    // nip05 didn't resolve — drop the row entirely
    return null;
  }

  return (
    <button
      type="button"
      data-recipient-item
      role="option"
      aria-selected={isSelected}
      onClick={handleClick}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
    >
      <Avatar shape={getAvatarShape(metadata)} className="size-9 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">
          {author.isLoading ? (
            <span className="text-muted-foreground">Loading profile…</span>
          ) : (
            <EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText>
          )}
        </div>
        <div className={cn('text-xs text-muted-foreground truncate', match.type !== 'nip05' && !metadata?.nip05 && 'font-mono')}>
          {subtitle}
        </div>
      </div>
    </button>
  );
}

// ── Raw bitcoin address dropdown row ──────────────────────────

function BtcAddressRow({
  address,
  isSelected,
  onClick,
}: {
  address: string;
  isSelected: boolean;
  onClick: (address: string) => void;
}) {
  return (
    <button
      type="button"
      data-recipient-item
      role="option"
      aria-selected={isSelected}
      onClick={() => onClick(address)}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
    >
      <div className="size-9 shrink-0 rounded-full bg-orange-500/10 flex items-center justify-center">
        <Bitcoin className="size-4 text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">Send to Bitcoin address</div>
        <div className="text-xs text-muted-foreground truncate font-mono">
          {address.length > 28 ? `${address.slice(0, 14)}…${address.slice(-10)}` : address}
        </div>
      </div>
    </button>
  );
}

// ── Silent payment address (sp1…) dropdown row ────────────────

/**
 * Dropdown row for BIP-352 silent payment addresses. We give it a distinct
 * label and icon (privacy eye-off) so the user can tell at a glance that
 * this is a static, unlinkable address rather than a regular Bitcoin
 * scriptPubKey — the privacy story is materially different.
 */
function SpAddressRow({
  address,
  isSelected,
  onClick,
}: {
  address: string;
  isSelected: boolean;
  onClick: (address: string) => void;
}) {
  return (
    <button
      type="button"
      data-recipient-item
      role="option"
      aria-selected={isSelected}
      onClick={() => onClick(address)}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
    >
      <div className="size-9 shrink-0 rounded-full bg-violet-500/10 flex items-center justify-center">
        <EyeOff className="size-4 text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">Send to silent payment address</div>
        <div className="text-xs text-muted-foreground truncate font-mono">
          {address.length > 28 ? `${address.slice(0, 14)}…${address.slice(-10)}` : address}
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Success view for raw-address sends (no Nostr identity)
// ═══════════════════════════════════════════════════════════════════

interface RawAddressSuccessProps {
  txid: string;
  amountSats: number;
  btcPrice: number | undefined;
  onClose: () => void;
}

/**
 * Lighter-weight success screen for raw-address sends. No avatar / recipient
 * card because the user typed a bare Bitcoin address — we have no Nostr
 * identity to attribute the send to.
 */
function RawAddressSuccess({ txid, amountSats, btcPrice, onClose }: RawAddressSuccessProps) {
  const usdDisplay = btcPrice ? satsToUSD(amountSats, btcPrice) : '';

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative grid gap-5 px-6 py-8 w-full overflow-hidden text-center motion-safe:animate-success-fade-up"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_35%,hsl(var(--primary)/0.18),transparent_65%)]"
      />

      <div className="relative mx-auto flex size-28 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400/40 to-orange-500/30 motion-safe:animate-success-halo"
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/30 motion-safe:animate-success-pop"
        />
        <Check
          className="relative size-14 text-white drop-shadow-sm motion-safe:animate-success-pop"
          strokeWidth={3}
          aria-hidden
        />
      </div>

      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Bitcoin sent</h2>
        <div className="text-4xl font-bold tabular-nums bg-gradient-to-br from-amber-500 to-orange-600 bg-clip-text text-transparent">
          {usdDisplay || `${amountSats.toLocaleString()} sats`}
        </div>
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          asChild
          className="w-full"
        >
          <Link to={`/i/bitcoin:tx:${txid}`} onClick={onClose}>
            <ExternalLink className="size-4 mr-2" />
            View transaction
          </Link>
        </Button>
        <Button type="button" onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    </div>
  );
}
