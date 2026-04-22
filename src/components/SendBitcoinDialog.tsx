import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  AlertTriangle,
  Check,
  ChevronLeft,
  Loader2,
  Send,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useToast } from '@/hooks/useToast';
import {
  nostrPubkeyToBitcoinAddress,
  npubToBitcoinAddress,
  validateBitcoinAddress,
  fetchUTXOs,
  getFeeRates,
  buildUnsignedPsbt,
  finalizePsbt,
  broadcastTransaction,
  estimateFee,
  maxSendable,
  satsToBTC,
  btcToSats,
  satsToUSD,
  formatSats,
} from '@/lib/bitcoin';
import type { FeeRates, UTXO } from '@/lib/bitcoin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeeSpeed = 'fastest' | 'halfHour' | 'hour' | 'economy';

type Step = 'form' | 'confirm' | 'success';

interface SendBitcoinDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** BTC/USD price — passed from the parent to avoid a duplicate fetch. */
  btcPrice?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FEE_SPEED_LABELS: Record<FeeSpeed, string> = {
  fastest: 'Fastest (~10 min)',
  halfHour: 'Half hour',
  hour: 'One hour',
  economy: 'Economy (~1 day)',
};

function feeRateForSpeed(rates: FeeRates, speed: FeeSpeed): number {
  const map: Record<FeeSpeed, number> = {
    fastest: rates.fastestFee,
    halfHour: rates.halfHourFee,
    hour: rates.hourFee,
    economy: rates.economyFee,
  };
  return map[speed];
}

/** Resolve a recipient string to a Bitcoin address, or throw. */
function resolveRecipient(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('npub1')) {
    return npubToBitcoinAddress(trimmed);
  }
  if (validateBitcoinAddress(trimmed)) {
    return trimmed;
  }
  throw new Error('Invalid recipient. Enter an npub or a Bitcoin address (bc1...).');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SendBitcoinDialog({ isOpen, onClose, btcPrice }: SendBitcoinDialogProps) {
  const { user } = useCurrentUser();
  const { canSignPsbt, signPsbt } = useBitcoinSigner();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [feeSpeed, setFeeSpeed] = useState<FeeSpeed>('halfHour');
  const [error, setError] = useState('');

  // Multi-step state
  const [step, setStep] = useState<Step>('form');
  const [txId, setTxId] = useState('');
  const [confirmedFee, setConfirmedFee] = useState(0);

  const senderAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';

  // ── Data fetching ──────────────────────────────────────────────

  const { data: utxos, isLoading: isLoadingUtxos } = useQuery({
    queryKey: ['bitcoin-utxos', senderAddress],
    queryFn: () => fetchUTXOs(senderAddress),
    enabled: !!senderAddress && isOpen,
    staleTime: 30_000,
  });

  const { data: feeRates, isLoading: isLoadingFees } = useQuery({
    queryKey: ['bitcoin-fee-rates'],
    queryFn: getFeeRates,
    enabled: isOpen,
    staleTime: 30_000,
  });

  const totalBalance = useMemo(() => utxos?.reduce((s, u) => s + u.value, 0) ?? 0, [utxos]);

  const currentFeeRate = feeRates ? feeRateForSpeed(feeRates, feeSpeed) : 0;

  // ── Derived values for the confirm screen ──────────────────────

  const parsedAmountSats = useMemo(() => {
    const n = parseFloat(amount);
    return isNaN(n) || n <= 0 ? 0 : btcToSats(n);
  }, [amount]);

  const resolvedRecipient = useMemo(() => {
    try { return resolveRecipient(recipient); } catch { return ''; }
  }, [recipient]);

  const previewFee = useMemo(() => {
    if (!utxos?.length || !currentFeeRate || !parsedAmountSats) return 0;
    // Estimate with 2 outputs first, then check if change would be below dust
    const fee2 = estimateFee(utxos.length, 2, currentFeeRate);
    const change = totalBalance - parsedAmountSats - fee2;
    const numOutputs = change > 546 ? 2 : 1;
    return estimateFee(utxos.length, numOutputs, currentFeeRate);
  }, [utxos, currentFeeRate, parsedAmountSats, totalBalance]);

  // ── Send Max ───────────────────────────────────────────────────

  const handleSendMax = useCallback(() => {
    if (!utxos?.length || !currentFeeRate) return;
    const max = maxSendable(totalBalance, utxos.length, currentFeeRate);
    if (max <= 0) return;
    setAmount(satsToBTC(max).replace(/\.?0+$/, ''));
    setError('');
  }, [utxos, currentFeeRate, totalBalance]);

  // ── Send mutation ──────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user || !canSignPsbt || !signPsbt) throw new Error("Your login doesn't support sending Bitcoin.");
      if (!utxos?.length) throw new Error('No spendable Bitcoin available.');
      if (!feeRates) throw new Error('Fee rates not loaded.');

      const recipientAddress = resolveRecipient(recipient);
      const amountSats = btcToSats(parseFloat(amount));
      if (isNaN(amountSats) || amountSats <= 0) throw new Error('Invalid amount.');

      const feeRate = feeRateForSpeed(feeRates, feeSpeed);

      // 1. Build unsigned PSBT
      const { psbtHex, fee } = buildUnsignedPsbt(
        user.pubkey,
        recipientAddress,
        amountSats,
        utxos,
        feeRate,
      );

      // 2. Sign via the signer (local nsec, NIP-07 extension, or NIP-46 bunker)
      const signedHex = await signPsbt(psbtHex);

      // 3. Finalize and extract raw tx
      const txHex = finalizePsbt(signedHex);

      const id = await broadcastTransaction(txHex);
      return { txId: id, fee };
    },
    onSuccess: ({ txId: id, fee }) => {
      setTxId(id);
      setConfirmedFee(fee);
      setStep('success');
      toast({ title: 'Transaction sent', description: `Fee: ${formatSats(fee)} sats` });

      // Invalidate wallet data so balance updates
      queryClient.invalidateQueries({ queryKey: ['bitcoin-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['bitcoin-utxos'] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setStep('form');
      toast({ title: 'Transaction failed', description: err.message, variant: 'destructive' });
    },
  });

  // ── Navigation ─────────────────────────────────────────────────

  const goToConfirm = () => {
    setError('');
    try {
      resolveRecipient(recipient);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid recipient');
      return;
    }
    const sats = btcToSats(parseFloat(amount));
    if (isNaN(sats) || sats <= 0) { setError('Enter a valid amount.'); return; }
    if (sats + previewFee > totalBalance) { setError('Insufficient funds.'); return; }
    setStep('confirm');
  };

  const handleClose = () => {
    setRecipient('');
    setAmount('');
    setError('');
    setTxId('');
    setConfirmedFee(0);
    setStep('form');
    setFeeSpeed('halfHour');
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────

  // Signer doesn't support Bitcoin signing
  if (isOpen && !canSignPsbt) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-orange-500" />
              Sending Not Available
            </DialogTitle>
            <DialogDescription>
              Your login doesn't support sending Bitcoin.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Log in with your secret key to send Bitcoin.
            </AlertDescription>
          </Alert>
          <Button onClick={handleClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === 'success' ? (
          <SuccessView txId={txId} fee={confirmedFee} btcPrice={btcPrice} onClose={handleClose} />
        ) : step === 'confirm' ? (
          <ConfirmView
            recipient={resolvedRecipient}
            amountSats={parsedAmountSats}
            fee={previewFee}
            feeSpeed={feeSpeed}
            btcPrice={btcPrice}
            isPending={sendMutation.isPending}
            onBack={() => setStep('form')}
            onConfirm={() => sendMutation.mutate()}
          />
        ) : (
          <FormView
            recipient={recipient}
            amount={amount}
            feeSpeed={feeSpeed}
            error={error}
            totalBalance={totalBalance}
            btcPrice={btcPrice}
            utxos={utxos}
            feeRates={feeRates}
            isLoadingUtxos={isLoadingUtxos}
            isLoadingFees={isLoadingFees}
            currentFeeRate={currentFeeRate}
            onRecipientChange={(v) => { setRecipient(v); setError(''); }}
            onAmountChange={(v) => { setAmount(v); setError(''); }}
            onFeeSpeedChange={setFeeSpeed}
            onSendMax={handleSendMax}
            onNext={goToConfirm}
            onCancel={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-views
// ═══════════════════════════════════════════════════════════════════

// ── Form ─────────────────────────────────────────────────────────

interface FormViewProps {
  recipient: string;
  amount: string;
  feeSpeed: FeeSpeed;
  error: string;
  totalBalance: number;
  btcPrice?: number;
  utxos?: UTXO[];
  feeRates?: FeeRates;
  isLoadingUtxos: boolean;
  isLoadingFees: boolean;
  currentFeeRate: number;
  onRecipientChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onFeeSpeedChange: (v: FeeSpeed) => void;
  onSendMax: () => void;
  onNext: () => void;
  onCancel: () => void;
}

function FormView({
  recipient, amount, feeSpeed, error, totalBalance, btcPrice,
  feeRates, isLoadingUtxos, isLoadingFees, currentFeeRate,
  onRecipientChange, onAmountChange, onFeeSpeedChange, onSendMax, onNext, onCancel,
}: FormViewProps) {
  const parsedBtc = parseFloat(amount) || 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Send className="size-5 text-orange-500" />
          Send Bitcoin
        </DialogTitle>
        <DialogDescription>
          Send Bitcoin to a Nostr user or Bitcoin address
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Balance */}
        <div className="rounded-lg bg-muted/50 p-4">
          <Label className="text-xs text-muted-foreground">Available Balance</Label>
          {isLoadingUtxos ? (
            <Skeleton className="mt-1 h-7 w-36" />
          ) : (
            <p className="text-xl font-bold">
              {btcPrice
                ? satsToUSD(totalBalance, btcPrice)
                : `${satsToBTC(totalBalance).replace(/\.?0+$/, '')} BTC`}
            </p>
          )}
        </div>

        {/* Recipient */}
        <div className="space-y-2">
          <Label htmlFor="send-recipient">Recipient</Label>
          <Input
            id="send-recipient"
            placeholder="npub1... or bc1..."
            value={recipient}
            onChange={(e) => onRecipientChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Nostr npub or Bitcoin address</p>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label htmlFor="send-amount">Amount (BTC)</Label>
          <Input
            id="send-amount"
            type="number"
            step="0.00000001"
            min="0"
            placeholder="0.00000000"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {parsedBtc > 0
                ? btcPrice
                  ? satsToUSD(btcToSats(parsedBtc), btcPrice)
                  : `${formatSats(btcToSats(parsedBtc))} sats`
                : ''}
            </span>
            <button
              type="button"
              onClick={onSendMax}
              className="text-primary hover:underline cursor-pointer"
            >
              Send Max
            </button>
          </div>
        </div>

        {/* Fee speed */}
        <div className="space-y-2">
          <Label>Transaction Speed</Label>
          <Select value={feeSpeed} onValueChange={(v) => onFeeSpeedChange(v as FeeSpeed)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FEE_SPEED_LABELS) as FeeSpeed[]).map((speed) => (
                <SelectItem key={speed} value={speed}>
                  {FEE_SPEED_LABELS[speed]}
                  {' — '}
                  {isLoadingFees ? '...' : feeRates ? `${feeRateForSpeed(feeRates, speed)} sat/vB` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentFeeRate > 0 && parsedBtc > 0 && (
            <p className="text-xs text-muted-foreground">
              Estimated fee: ~{formatSats(estimateFee(1, 2, currentFeeRate))} sats
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Warning */}
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs">
            <strong>Warning:</strong> This is an experimental feature. Test with small amounts first.
            Transactions cannot be reversed.
          </AlertDescription>
        </Alert>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button
            onClick={onNext}
            disabled={!recipient || !amount || parsedBtc <= 0 || isLoadingUtxos || isLoadingFees}
            className="flex-1"
          >
            <ArrowUpRight className="size-4 mr-1.5" />
            Review
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Confirm ──────────────────────────────────────────────────────

interface ConfirmViewProps {
  recipient: string;
  amountSats: number;
  fee: number;
  feeSpeed: FeeSpeed;
  btcPrice?: number;
  isPending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

function ConfirmView({ recipient, amountSats, fee, feeSpeed, btcPrice, isPending, onBack, onConfirm }: ConfirmViewProps) {
  const totalSats = amountSats + fee;

  const row = (label: string, sats: number) => (
    <div className="flex justify-between items-baseline">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium">
          {satsToBTC(sats).replace(/\.?0+$/, '')} BTC
        </span>
        {btcPrice && (
          <span className="text-xs text-muted-foreground ml-2">
            ({satsToUSD(sats, btcPrice)})
          </span>
        )}
      </div>
    </div>
  );

  const truncatedRecipient = recipient.length > 24
    ? `${recipient.slice(0, 12)}...${recipient.slice(-8)}`
    : recipient;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Send className="size-5 text-orange-500" />
          Confirm Transaction
        </DialogTitle>
        <DialogDescription>
          Review the details before sending
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Recipient */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-1">
          <Label className="text-xs text-muted-foreground">Sending to</Label>
          <p className="text-sm font-mono break-all">{truncatedRecipient}</p>
        </div>

        {/* Breakdown */}
        <div className="space-y-2">
          {row('Amount', amountSats)}
          {row(`Fee (${FEE_SPEED_LABELS[feeSpeed].toLowerCase()})`, fee)}
          <div className="border-t pt-2">
            {row('Total', totalSats)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isPending} className="flex-1">
            <ChevronLeft className="size-4 mr-1" />
            Back
          </Button>
          <Button onClick={onConfirm} disabled={isPending} className="flex-1">
            {isPending ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="size-4 mr-1.5" />
                Confirm &amp; Send
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

// ── Success ──────────────────────────────────────────────────────

interface SuccessViewProps {
  txId: string;
  fee: number;
  btcPrice?: number;
  onClose: () => void;
}

function SuccessView({ txId, fee, btcPrice, onClose }: SuccessViewProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <Check className="size-5" />
          Transaction Sent
        </DialogTitle>
        <DialogDescription>
          Your transaction has been broadcast to the Bitcoin network.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4 space-y-1">
          <Label className="text-xs text-green-700 dark:text-green-300">Transaction ID</Label>
          <p className="text-xs font-mono break-all text-green-900 dark:text-green-100">{txId}</p>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Fee: {formatSats(fee)} sats
          {btcPrice ? ` (${satsToUSD(fee, btcPrice)})` : ''}
        </p>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" asChild>
            <Link to={`/i/bitcoin:tx:${txId}`} onClick={onClose}>
              View Details
            </Link>
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </>
  );
}
