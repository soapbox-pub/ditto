import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AmountField, type AmountPresets } from '@/components/AmountField';
import { GenericPaymentContent } from '@/components/GenericPaymentContent';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useMoneroWallet } from '@/hooks/useMoneroWallet';
import {
  amountInputToAtomic,
  formatMoneroAmount,
  formatMoneroAmountInput,
  truncateAddress,
  type MoneroDisplayUnit,
} from '@/lib/monero/units';
import { prepareTx, relayTx, type PreparedTx } from '@/lib/monero/wallet';
import type { PaymentMethodDef, PaymentTarget } from '@/lib/paymentTargets';

interface MoneroZapContentProps {
  method: PaymentMethodDef;
  target: PaymentTarget;
  /** Called after a successful send, so the dialog can show its success screen. */
  onSuccess?: (result: { txHash: string; amount: bigint }) => void;
}

/**
 * Amount presets, one row per unit.
 *
 * The USD row matches the Bitcoin pane's exactly, so switching methods in the
 * dialog doesn't move the chips around. The XMR row is hand-picked to land near
 * the same dollar values at a mid-hundreds XMR price rather than being a
 * conversion of them, for the same reason the sats row isn't a conversion
 * either: round numbers beat precise ones on a chip.
 */
const PRESETS: AmountPresets = {
  usd: [1, 5, 20, 50, 100],
  xmr: [0.005, 0.02, 0.05, 0.2, 0.5],
};

/** Opening amount for a fresh form, in the active unit. */
function defaultAmount(unit: MoneroDisplayUnit): number {
  return unit === 'xmr' ? 0.02 : 5;
}

/**
 * The Monero pane of the zap dialog.
 *
 * Two modes, chosen by whether the sender has a Ditto Monero wallet:
 *
 *  - **With a wallet** — a real in-app send, laid out exactly like the Bitcoin
 *    pane: the shared `<AmountField>` big number with preset chips, one pill
 *    button, and a small fee/balance line underneath.
 *  - **Without one** — falls back to `GenericPaymentContent`: a QR code, a
 *    copyable address and a `monero:` handoff button, which is what every
 *    non-native payment target gets. A user without a wallet can still pay
 *    from Cake, Feather or Monerujo.
 *
 * ## Why the send is two taps
 *
 * The Bitcoin pane arms a second tap only for large amounts. Here it is always
 * two: a Monero fee depends on how many ring members and outputs wallet2 ends
 * up choosing, so it cannot be estimated before the transaction is built. The
 * first tap builds (nothing is broadcast), which is what fills in the real fee;
 * the second spends. That reuses the confirmation affordance the dialog already
 * has instead of adding a second screen, which is what this pane used to do.
 *
 * ## No attribution event
 *
 * Unlike the Bitcoin rail there is no receipt here. On-chain zaps publish a
 * kind 8333 referencing `bitcoin:tx:<txid>` (see `NIP.md`), which works because
 * a Bitcoin transaction is publicly verifiable. A Monero transaction is not: no
 * third party can confirm the amount, the sender, or the recipient, so an
 * equivalent receipt would be an unverifiable claim. Publishing one would
 * invite exactly the spoofing NIP.md's kind-8333 verification rules exist to
 * prevent. That's also why there's no comment button — a comment has no event
 * to ride on.
 */
export function MoneroZapContent({ method, target, onSuccess }: MoneroZapContentProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const { config } = useAppContext();
  const { hasWallet, session, unlockedBalance, xmrPrice, phase, needsPassphrase, connect, refreshState } =
    useMoneroWallet();

  // Monero has no sats, so a sats-preferring user writes amounts in XMR. The
  // unit is fixed by the preference alone and never flips when the price
  // arrives — a number that silently changed denomination mid-edit would be a
  // good way to send a hundred times too much.
  const unit: MoneroDisplayUnit = config.currencyDisplay === 'usd' ? 'usd' : 'xmr';

  const [amountInput, setAmountInput] = useState<number | string>(() => defaultAmount(unit));
  const [editingAmount, setEditingAmount] = useState(false);
  const [prepared, setPrepared] = useState<PreparedTx | null>(null);
  const [busy, setBusy] = useState<'preparing' | 'sending' | null>(null);
  const [error, setError] = useState('');

  // Bring the wallet online as soon as the Monero pane is shown, so the user
  // isn't waiting on a sync only after they've typed an amount. A passphrase
  // wallet with no local cache is left alone: the prompt for it belongs on the
  // wallet page, not in a zap dialog, and opening without it would derive the
  // wrong wallet rather than fail.
  useEffect(() => {
    if (hasWallet && !needsPassphrase) void connect();
  }, [hasWallet, needsPassphrase, connect]);

  const amount = useMemo(
    () => amountInputToAtomic(amountInput, unit, xmrPrice),
    [amountInput, unit, xmrPrice],
  );

  // Editing after building invalidates the built transaction — it was
  // constructed for the old amount, and its fee belongs to that output set.
  // Mirrors the Bitcoin pane re-arming its confirmation whenever the amount
  // moves.
  useEffect(() => {
    setPrepared(null);
  }, [amount]);

  const syncing = phase === 'loading' || phase === 'opening' || phase === 'syncing';
  const total = prepared ? prepared.amount + prepared.fee : amount;
  // Unlike the Bitcoin pane — which can't distinguish "no UTXOs" from "UTXOs
  // still loading" — the spendable balance is in the encrypted record and
  // resolves with it, so a zero here is a real zero.
  const insufficient = amount > 0n && total > unlockedBalance;

  // In USD mode the amount is 0 until the price lands, so fall back to echoing
  // the raw input ("$5") rather than putting a "0" on the send button.
  const totalDisplay =
    total > 0n
      ? formatMoneroAmount(total, unit, xmrPrice)
      : formatMoneroAmountInput(amountInput, unit);

  /**
   * The same total in XMR, always shown alongside a USD figure.
   *
   * A USD amount here is the output of a price fetched over the network, and
   * the thing being authorized is an irreversible, unverifiable transfer. If
   * that number is wrong the user has no way to notice from a dollar sign —
   * so the confirmation always states what actually leaves the wallet.
   */
  const totalXmrDisplay = unit === 'usd' && total > 0n ? formatMoneroAmount(total, 'xmr', xmrPrice) : null;

  /** USD mode with no price yet — nothing can be converted, let alone sent. */
  const awaitingPrice = unit === 'usd' && !xmrPrice;

  const handleSend = useCallback(async () => {
    setError('');
    if (!session) {
      setError(
        intl.formatMessage({
          id: 'monero.zap.error.notReady',
          defaultMessage: 'Your Monero wallet is still syncing.',
        }),
      );
      return;
    }
    if (unit === 'usd' && !xmrPrice) {
      setError(
        intl.formatMessage({
          id: 'monero.zap.error.price',
          defaultMessage: 'Waiting for the XMR price…',
        }),
      );
      return;
    }
    if (amount <= 0n) {
      setError(
        intl.formatMessage({
          id: 'monero.zap.error.amount',
          defaultMessage: 'Enter an amount.',
        }),
      );
      return;
    }
    if (amount > unlockedBalance) {
      setError(
        intl.formatMessage({
          id: 'monero.zap.error.insufficient',
          defaultMessage: 'Not enough spendable balance.',
        }),
      );
      return;
    }

    // First tap: build the transaction so the real fee is known. Nothing is
    // broadcast, and the button turns into the confirmation.
    if (!prepared) {
      setBusy('preparing');
      try {
        setPrepared(await prepareTx(session, { address: target.authority, amount }));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not build the transaction');
      } finally {
        setBusy(null);
      }
      return;
    }

    // Second tap: spend it.
    setBusy('sending');
    try {
      const txHash = await relayTx(session, prepared);
      onSuccess?.({ txHash, amount: prepared.amount });
      void refreshState();
      toast({
        title: intl.formatMessage({
          id: 'monero.zap.sent.title',
          defaultMessage: 'Monero sent',
        }),
        description: formatMoneroAmount(prepared.amount, unit, xmrPrice),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to broadcast the transaction');
    } finally {
      setBusy(null);
    }
  }, [
    session,
    unit,
    xmrPrice,
    amount,
    unlockedBalance,
    prepared,
    target.authority,
    onSuccess,
    refreshState,
    toast,
    intl,
  ]);

  // No wallet — hand off to an external one.
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

  // A wallet that can't open on this device without a passphrase. Prompting
  // for a seed offset inside a zap dialog is the wrong place for it, so this
  // falls back to the handoff pane the same way "no wallet" does.
  if (needsPassphrase) {
    return (
      <div className="grid gap-2">
        <GenericPaymentContent method={method} target={target} />
        <p className="px-4 pb-2 text-center text-xs text-muted-foreground">
          <FormattedMessage
            id="monero.zap.locked"
            defaultMessage="Unlock your Monero wallet on the wallet page to send from here."
          />
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 px-4 py-4 w-full overflow-hidden">
      {/* Amount — big number on top, editable by clicking, plus preset chips. */}
      <div className="grid gap-4 pt-2">
        <AmountField
          value={amountInput}
          onValueChange={(v) => {
            setAmountInput(v);
            setError('');
          }}
          currency={unit}
          editing={editingAmount}
          setEditing={setEditingAmount}
          presets={PRESETS}
          invalid={insufficient}
        />
      </div>

      {/*
        Once the transaction is built, the pane states exactly what the second
        tap will do: the real XMR total, the split if wallet2 made one, and the
        address it goes to. A zap dialog otherwise never shows the recipient
        address at all — the profile it was opened from is not the same
        assurance, and a Monero payment can't be checked afterwards.
      */}
      {prepared && (
        <dl className="grid gap-1.5 rounded-lg border p-3 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              <FormattedMessage id="monero.zap.confirm.sending" defaultMessage="Sending" />
            </dt>
            <dd className="font-medium text-right">
              {formatMoneroAmount(prepared.amount, 'xmr', xmrPrice)}
              {unit === 'usd' && xmrPrice ? ` · ${formatMoneroAmount(prepared.amount, 'usd', xmrPrice)}` : ''}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">
              <FormattedMessage id="monero.zap.confirm.to" defaultMessage="To" />
            </dt>
            <dd className="font-mono text-right break-all">{truncateAddress(target.authority)}</dd>
          </div>
          {prepared.txCount > 1 && (
            <p className="text-muted-foreground">
              <FormattedMessage
                id="monero.zap.confirm.split"
                defaultMessage="Sent as {count} transactions, because of how your funds are split up."
                values={{ count: prepared.txCount }}
              />
            </p>
          )}
        </dl>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        onClick={() => void handleSend()}
        disabled={amount <= 0n || !session || syncing || !!busy || insufficient}
        variant={(insufficient || !!prepared) && !busy ? 'destructive' : 'default'}
        className="w-full rounded-full"
      >
        {busy ? (
          <>
            <Loader2 className="size-4 mr-1.5 animate-spin" />
            {busy === 'preparing' ? (
              <FormattedMessage id="monero.zap.building" defaultMessage="Building…" />
            ) : (
              <FormattedMessage id="monero.zap.sending" defaultMessage="Sending…" />
            )}
          </>
        ) : syncing ? (
          // Mid-scan there is no output set to spend from, so the button is a
          // status line rather than a disabled control with a stale label.
          <>
            <Loader2 className="size-4 mr-1.5 animate-spin" />
            <FormattedMessage id="monero.zap.syncing" defaultMessage="Syncing your wallet…" />
          </>
        ) : awaitingPrice ? (
          <>
            <Loader2 className="size-4 mr-1.5 animate-spin" />
            <FormattedMessage
              id="monero.zap.awaitingPrice"
              defaultMessage="Waiting for the XMR price…"
            />
          </>
        ) : insufficient ? (
          <FormattedMessage id="monero.zap.insufficient" defaultMessage="Not enough Monero" />
        ) : prepared ? (
          <FormattedMessage
            id="monero.zap.confirm"
            defaultMessage="Tap again to send {amount}"
            values={{ amount: totalXmrDisplay ?? totalDisplay }}
          />
        ) : (
          <FormattedMessage
            id="monero.zap.send"
            defaultMessage="Send {amount}"
            values={{ amount: totalDisplay }}
          />
        )}
      </Button>

      {/* Fee and balance line, in the same slot the Bitcoin pane uses. The fee
          only exists once the transaction has been built. */}
      {amount > 0n && (
        <div className="flex items-center justify-center gap-3 -mt-1 text-xs text-muted-foreground">
          <span>
            {prepared ? (
              <FormattedMessage
                id="monero.zap.fee"
                defaultMessage="Fee {amount}"
                values={{ amount: formatMoneroAmount(prepared.fee, 'xmr', xmrPrice) }}
              />
            ) : (
              <FormattedMessage
                id="monero.zap.feeUnknown"
                defaultMessage="Fee shown before you send"
              />
            )}
          </span>
          <span>
            <FormattedMessage
              id="monero.zap.spendable"
              defaultMessage="Spendable: {amount}"
              values={{ amount: formatMoneroAmount(unlockedBalance, unit, xmrPrice) }}
            />
          </span>
        </div>
      )}
    </div>
  );
}
