import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, ArrowLeft, Check, Loader2, QrCode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QrScannerDialog } from '@/components/QrScannerDialog';
import { useToast } from '@/hooks/useToast';
import { useMoneroWallet } from '@/hooks/useMoneroWallet';
import {
  atomicToUSD,
  formatXMR,
  isMoneroAddress,
  parseMoneroUri,
  parseXMR,
  truncateAddress,
} from '@/lib/monero/units';
import { prepareSweepTx, prepareTx, relayTx, type PreparedTx } from '@/lib/monero/wallet';

interface SendMoneroDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional `monero:` URI or bare address to prefill the form with. */
  initialUri?: string;
  /** Called after a successful relay, with the transaction hash. */
  onSuccess?: (result: { txHash: string; amount: bigint }) => void;
}

type Step =
  | { name: 'form' }
  | { name: 'preparing' }
  | { name: 'confirm'; prepared: PreparedTx; isSweep: boolean }
  // Carries `prepared` so the confirmation summary stays on screen while the
  // transaction is being relayed, rather than blanking out mid-send.
  | { name: 'sending'; prepared: PreparedTx }
  | { name: 'success'; txHash: string; amount: bigint };

/**
 * Send Monero from the in-app wallet.
 *
 * Three steps — form, confirm, success — mirroring `SendBitcoinDialog`, but
 * the middle one works differently. The Bitcoin flow estimates a fee from a
 * vbyte formula before building anything. Monero's fee depends on the ring
 * members and output count wallet2 actually selects, so it can't be estimated
 * up front: we *build* the transaction (without relaying), show the real fee
 * wallet2 computed, and only relay after the user confirms. Nothing touches
 * the network until the confirm button is pressed.
 */
export function SendMoneroDialog({ isOpen, onClose, initialUri, onSuccess }: SendMoneroDialogProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const { session, unlockedBalance, xmrPrice, phase, refreshState } = useMoneroWallet();

  const [step, setStep] = useState<Step>({ name: 'form' });
  const [recipient, setRecipient] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  /** Apply a `monero:` URI (or bare address) to the form. */
  const applyUri = useCallback((value: string) => {
    const parsed = parseMoneroUri(value);
    if (parsed) {
      setRecipient(parsed.address);
      if (parsed.amount) {
        setAmountInput(formatXMR(parsed.amount, { maxDecimals: 12, minDecimals: 0 }));
      }
      return;
    }
    setRecipient(value.trim());
  }, []);

  // Seed from the incoming URI each time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    setStep({ name: 'form' });
    setError(null);
    if (initialUri) applyUri(initialUri);
  }, [isOpen, initialUri, applyUri]);

  const handleClose = useCallback(() => {
    setStep({ name: 'form' });
    setRecipient('');
    setAmountInput('');
    setError(null);
    onClose();
  }, [onClose]);

  const amount = useMemo(() => parseXMR(amountInput), [amountInput]);
  const recipientValid = isMoneroAddress(recipient);
  const amountValid = amount !== null && amount > 0n;
  const sufficient = amount !== null && amount <= unlockedBalance;

  /** Build the transaction so we can show a real fee. */
  const handlePrepare = useCallback(
    async (sweep: boolean) => {
      setError(null);

      if (!session) {
        setError(
          intl.formatMessage({
            id: 'monero.send.error.notReady',
            defaultMessage: 'Your wallet is still syncing. Wait for it to finish before sending.',
          }),
        );
        return;
      }
      if (!recipientValid) {
        setError(
          intl.formatMessage({
            id: 'monero.send.error.address',
            defaultMessage: "That doesn't look like a Monero address.",
          }),
        );
        return;
      }
      if (!sweep && (!amountValid || !sufficient)) {
        setError(
          !amountValid
            ? intl.formatMessage({
                id: 'monero.send.error.amount',
                defaultMessage: 'Enter an amount greater than zero.',
              })
            : intl.formatMessage({
                id: 'monero.send.error.insufficient',
                defaultMessage: 'Not enough spendable balance.',
              }),
        );
        return;
      }

      setStep({ name: 'preparing' });
      try {
        const prepared = sweep
          ? await prepareSweepTx(session, { address: recipient.trim() })
          : await prepareTx(session, { address: recipient.trim(), amount: amount ?? 0n });
        setStep({ name: 'confirm', prepared, isSweep: sweep });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not build the transaction');
        setStep({ name: 'form' });
      }
    },
    [session, recipient, recipientValid, amount, amountValid, sufficient, intl],
  );

  /** Relay the prepared transaction. */
  const handleSend = useCallback(async () => {
    if (step.name !== 'confirm' || !session) return;
    setError(null);
    const { prepared } = step;
    setStep({ name: 'sending', prepared });

    try {
      const txHash = await relayTx(session, prepared);
      setStep({ name: 'success', txHash, amount: prepared.amount });
      onSuccess?.({ txHash, amount: prepared.amount });
      void refreshState();
      toast({
        title: intl.formatMessage({
          id: 'monero.send.sent.title',
          defaultMessage: 'Monero sent',
        }),
        description: formatXMR(prepared.amount) + ' XMR',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to broadcast the transaction');
      setStep({ name: 'confirm', prepared, isSweep: step.isSweep });
    }
  }, [step, session, onSuccess, refreshState, toast, intl]);

  const busy = step.name === 'preparing' || step.name === 'sending';

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && !busy && handleClose()}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step.name === 'success' ? (
                <FormattedMessage id="monero.send.success.title" defaultMessage="Sent" />
              ) : (
                <FormattedMessage id="monero.send.title" defaultMessage="Send Monero" />
              )}
            </DialogTitle>
            {step.name === 'form' && (
              <DialogDescription>
                <FormattedMessage
                  id="monero.send.description"
                  defaultMessage="Spendable: {amount} XMR"
                  values={{ amount: formatXMR(unlockedBalance) }}
                />
              </DialogDescription>
            )}
          </DialogHeader>

          {error && (
            <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <AlertTriangle className="size-5 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {step.name === 'form' && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="monero-recipient">
                  <FormattedMessage id="monero.send.recipient" defaultMessage="Recipient" />
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="monero-recipient"
                    value={recipient}
                    onChange={(e) => applyUri(e.target.value)}
                    placeholder={intl.formatMessage({
                      id: 'monero.send.recipientPlaceholder',
                      defaultMessage: 'Monero address (4… or 8…)',
                    })}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-sm"
                    aria-invalid={recipient.length > 0 && !recipientValid}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setScannerOpen(true)}
                    aria-label={intl.formatMessage({
                      id: 'monero.send.scan',
                      defaultMessage: 'Scan QR code',
                    })}
                  >
                    <QrCode className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="monero-amount">
                  <FormattedMessage id="monero.send.amount" defaultMessage="Amount (XMR)" />
                </Label>
                <Input
                  id="monero-amount"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  aria-invalid={amountInput.length > 0 && (!amountValid || !sufficient)}
                />
                {amount !== null && xmrPrice ? (
                  <p className="text-xs text-muted-foreground">{atomicToUSD(amount, xmrPrice)}</p>
                ) : null}
              </div>

              {phase !== 'ready' && (
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    id="monero.send.syncing"
                    defaultMessage="Your wallet needs to finish syncing before you can send."
                  />
                </p>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handlePrepare(true)}
                  disabled={!session || !recipientValid}
                  className="flex-1"
                >
                  <FormattedMessage id="monero.send.sendMax" defaultMessage="Send max" />
                </Button>
                <Button
                  onClick={() => handlePrepare(false)}
                  disabled={!session || !recipientValid || !amountValid || !sufficient}
                  className="flex-1"
                >
                  <FormattedMessage id="monero.send.review" defaultMessage="Review" />
                </Button>
              </div>
            </div>
          )}

          {step.name === 'preparing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                <FormattedMessage
                  id="monero.send.preparing"
                  defaultMessage="Building the transaction…"
                />
              </p>
            </div>
          )}

          {(step.name === 'confirm' || step.name === 'sending') && (
            <div className="grid gap-4">
              <dl className="grid gap-3 rounded-lg border p-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    <FormattedMessage id="monero.send.confirm.to" defaultMessage="To" />
                  </dt>
                  <dd className="font-mono text-xs text-right break-all">
                    {truncateAddress(step.prepared.address, 10, 10)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    <FormattedMessage id="monero.send.confirm.amount" defaultMessage="Amount" />
                  </dt>
                  <dd className="text-right">
                    <span className="block font-medium">
                      {formatXMR(step.prepared.amount)} XMR
                    </span>
                    {xmrPrice && (
                      <span className="block text-xs text-muted-foreground">
                        {atomicToUSD(step.prepared.amount, xmrPrice)}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    <FormattedMessage id="monero.send.confirm.fee" defaultMessage="Network fee" />
                  </dt>
                  <dd className="text-right">{formatXMR(step.prepared.fee)} XMR</dd>
                </div>
                <div className="flex justify-between gap-4 border-t pt-3">
                  <dt className="font-medium">
                    <FormattedMessage id="monero.send.confirm.total" defaultMessage="Total" />
                  </dt>
                  <dd className="text-right font-medium">
                    {formatXMR(step.prepared.amount + step.prepared.fee)} XMR
                  </dd>
                </div>

                {/* wallet2 splits a transfer whose inputs don't fit in one
                    transaction. The fee above is already the total, but the
                    recipient will see several payments, so say so. */}
                {step.prepared.txCount > 1 && (
                  <p className="text-xs text-muted-foreground">
                    <FormattedMessage
                      id="monero.send.confirm.split"
                      defaultMessage="Sent as {count} transactions, because of how your funds are split up."
                      values={{ count: step.prepared.txCount }}
                    />
                  </p>
                )}
              </dl>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep({ name: 'form' })}
                  disabled={step.name === 'sending'}
                  className="flex-1"
                  type="button"
                >
                  <ArrowLeft className="size-4 mr-1.5" />
                  <FormattedMessage id="monero.send.back" defaultMessage="Back" />
                </Button>
                <Button onClick={handleSend} disabled={step.name === 'sending'} className="flex-1">
                  {step.name === 'sending' && <Loader2 className="size-4 mr-2 animate-spin" />}
                  <FormattedMessage id="monero.send.confirmAction" defaultMessage="Send" />
                </Button>
              </div>
            </div>
          )}

          {step.name === 'success' && (
            <div className="grid gap-4">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-green-500/10">
                  <Check className="size-6 text-green-500" />
                </div>
                <p className="text-xl font-semibold">{formatXMR(step.amount)} XMR</p>
              </div>

              <div className="grid gap-1">
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage id="monero.send.txid" defaultMessage="Transaction ID" />
                </p>
                <p className="font-mono text-xs break-all select-all">{step.txHash}</p>
              </div>

              <Button onClick={handleClose} className="w-full">
                <FormattedMessage id="monero.send.done" defaultMessage="Done" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <QrScannerDialog
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(value) => {
          applyUri(value);
          setScannerOpen(false);
        }}
        title={intl.formatMessage({
          id: 'monero.send.scanTitle',
          defaultMessage: 'Scan a Monero address',
        })}
      />
    </>
  );
}
