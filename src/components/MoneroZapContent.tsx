import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GenericPaymentContent } from '@/components/GenericPaymentContent';
import { useToast } from '@/hooks/useToast';
import { useMoneroWallet } from '@/hooks/useMoneroWallet';
import { atomicToUSD, formatXMR, parseXMR } from '@/lib/monero/units';
import { prepareTx, relayTx, type PreparedTx } from '@/lib/monero/wallet';
import type { PaymentMethodDef, PaymentTarget } from '@/lib/paymentTargets';

interface MoneroZapContentProps {
  method: PaymentMethodDef;
  target: PaymentTarget;
  /** Called after a successful send, so the dialog can show its success screen. */
  onSuccess?: (result: { txHash: string; amount: bigint }) => void;
}

type Step =
  | { name: 'form' }
  | { name: 'preparing' }
  | { name: 'confirm'; prepared: PreparedTx }
  // Carries `prepared` so the confirmation summary stays on screen while the
  // transaction is being relayed.
  | { name: 'sending'; prepared: PreparedTx };

/**
 * The Monero pane of the zap dialog.
 *
 * Two modes, chosen by whether the sender has a Ditto Monero wallet:
 *
 *  - **With a wallet** — a real in-app send: enter an amount, review the fee
 *    wallet2 actually computed, broadcast. Same build-then-confirm shape as
 *    `SendMoneroDialog`, because Monero fees can't be estimated before the
 *    transaction is constructed.
 *  - **Without one** — falls back to `GenericPaymentContent`: a QR code, a
 *    copyable address and a `monero:` handoff button, which is what every
 *    non-native payment target gets. A user without a wallet can still pay
 *    from Cake, Feather or Monerujo.
 *
 * Unlike the Bitcoin rail there is no attribution event here. On-chain zaps
 * publish a kind 8333 referencing `bitcoin:tx:<txid>` (see `NIP.md`), which
 * works because a Bitcoin transaction is publicly verifiable. A Monero
 * transaction is not: no third party can confirm the amount, the sender, or
 * the recipient, so an equivalent receipt would be an unverifiable claim.
 * Publishing one would invite exactly the spoofing NIP.md's kind-8333
 * verification rules exist to prevent.
 */
export function MoneroZapContent({ method, target, onSuccess }: MoneroZapContentProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const { hasWallet, session, unlockedBalance, xmrPrice, phase, connect, refreshState } =
    useMoneroWallet();

  const [step, setStep] = useState<Step>({ name: 'form' });
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Bring the wallet online as soon as the Monero pane is shown, so the user
  // isn't waiting on a sync only after they've typed an amount.
  useEffect(() => {
    if (hasWallet) void connect();
  }, [hasWallet, connect]);

  const amount = useMemo(() => parseXMR(amountInput), [amountInput]);
  const amountValid = amount !== null && amount > 0n;
  const sufficient = amount !== null && amount <= unlockedBalance;

  const handlePrepare = useCallback(async () => {
    setError(null);
    if (!session) {
      setError(
        intl.formatMessage({
          id: 'monero.zap.error.notReady',
          defaultMessage: 'Your Monero wallet is still syncing.',
        }),
      );
      return;
    }
    if (!amountValid) {
      setError(
        intl.formatMessage({
          id: 'monero.zap.error.amount',
          defaultMessage: 'Enter an amount greater than zero.',
        }),
      );
      return;
    }
    if (!sufficient) {
      setError(
        intl.formatMessage({
          id: 'monero.zap.error.insufficient',
          defaultMessage: 'Not enough spendable balance.',
        }),
      );
      return;
    }

    setStep({ name: 'preparing' });
    try {
      const prepared = await prepareTx(session, {
        address: target.authority,
        amount: amount ?? 0n,
      });
      setStep({ name: 'confirm', prepared });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the transaction');
      setStep({ name: 'form' });
    }
  }, [session, amount, amountValid, sufficient, target.authority, intl]);

  const handleSend = useCallback(async () => {
    if (step.name !== 'confirm' || !session) return;
    setError(null);
    const { prepared } = step;
    setStep({ name: 'sending', prepared });

    try {
      const txHash = await relayTx(session, prepared);
      onSuccess?.({ txHash, amount: prepared.amount });
      void refreshState();
      toast({
        title: intl.formatMessage({
          id: 'monero.zap.sent.title',
          defaultMessage: 'Monero sent',
        }),
        description: `${formatXMR(prepared.amount)} XMR`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to broadcast the transaction');
      setStep({ name: 'confirm', prepared });
    }
  }, [step, session, onSuccess, refreshState, toast, intl]);

  // No wallet — hand off to an external one, exactly as before this feature.
  if (!hasWallet) {
    return (
      <div className="grid gap-2">
        <GenericPaymentContent method={method} target={target} />
        <p className="px-4 pb-2 text-center text-xs text-muted-foreground">
          <FormattedMessage
            id="monero.zap.noWallet"
            defaultMessage="Set up a Monero wallet in Ditto to send directly from here."
          />
        </p>
      </div>
    );
  }

  const syncing = phase === 'loading' || phase === 'opening' || phase === 'syncing';

  return (
    <div className="grid gap-4 px-4 py-4">
      {error && (
        <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {(step.name === 'form' || step.name === 'preparing') && (
        <>
          <div className="grid gap-2">
            <Input
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              aria-label={intl.formatMessage({
                id: 'monero.zap.amountLabel',
                defaultMessage: 'Amount in XMR',
              })}
              className="text-center text-2xl h-14 font-semibold"
              disabled={step.name === 'preparing'}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {amount !== null && xmrPrice ? atomicToUSD(amount, xmrPrice) : 'XMR'}
              </span>
              <span>
                <FormattedMessage
                  id="monero.zap.spendable"
                  defaultMessage="Spendable: {amount}"
                  values={{ amount: `${formatXMR(unlockedBalance)} XMR` }}
                />
              </span>
            </div>
          </div>

          {syncing && (
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              <FormattedMessage
                id="monero.zap.syncing"
                defaultMessage="Syncing your wallet — this can take a while."
              />
            </p>
          )}

          <Button
            onClick={handlePrepare}
            disabled={!session || !amountValid || !sufficient || step.name === 'preparing'}
            className="w-full"
          >
            {step.name === 'preparing' && <Loader2 className="size-4 mr-2 animate-spin" />}
            <FormattedMessage id="monero.zap.review" defaultMessage="Review" />
          </Button>
        </>
      )}

      {(step.name === 'confirm' || step.name === 'sending') && (
        <>
          <dl className="grid gap-3 rounded-lg border p-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                <FormattedMessage id="monero.zap.confirm.amount" defaultMessage="Amount" />
              </dt>
              <dd className="text-right font-medium">
                {formatXMR(step.prepared.amount)} XMR
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                <FormattedMessage id="monero.zap.confirm.fee" defaultMessage="Network fee" />
              </dt>
              <dd className="text-right">{formatXMR(step.prepared.fee)} XMR</dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-3">
              <dt className="font-medium">
                <FormattedMessage id="monero.zap.confirm.total" defaultMessage="Total" />
              </dt>
              <dd className="text-right font-medium">
                {formatXMR(step.prepared.amount + step.prepared.fee)} XMR
              </dd>
            </div>
          </dl>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setStep({ name: 'form' })}
              disabled={step.name === 'sending'}
              className="flex-1"
            >
              <ArrowLeft className="size-4 mr-1.5" />
              <FormattedMessage id="monero.zap.back" defaultMessage="Back" />
            </Button>
            <Button onClick={handleSend} disabled={step.name === 'sending'} className="flex-1">
              {step.name === 'sending' && <Loader2 className="size-4 mr-2 animate-spin" />}
              <FormattedMessage id="monero.zap.send" defaultMessage="Send" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
