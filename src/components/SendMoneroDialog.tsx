import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Check, Copy, Loader2, QrCode, UserRoundCheck, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AmountField, type AmountPresets } from '@/components/AmountField';
import { EmojifiedText } from '@/components/CustomEmoji';
import { QrScannerDialog } from '@/components/QrScannerDialog';

import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useMoneroAddresses } from '@/hooks/useMoneroAddresses';
import { useMoneroWallet } from '@/hooks/useMoneroWallet';
import { useNip05Resolve } from '@/hooks/useNip05Resolve';
import { PortalContainerProvider } from '@/hooks/usePortalContainer';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { useToast } from '@/hooks/useToast';
import { getAvatarShape } from '@/lib/avatarShape';
import { notificationSuccess } from '@/lib/haptics';
import { detectIdentifier, type IdentifierMatch } from '@/lib/nostrIdentifier';
import {
  amountInputToAtomic,
  atomicToFiat,
  formatMoneroAmount,
  formatMoneroAmountInput,
  formatXMR,
  isMoneroAddress,
  parseMoneroUri,
  truncateAddress,
  type MoneroDisplayUnit,
} from '@/lib/monero/units';
import { prepareSweepTx, prepareTx, relayTx, type PreparedTx } from '@/lib/monero/wallet';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Amount presets, one row per unit — the same rows the Monero zap pane uses, so
 * the two surfaces don't disagree about what a common amount looks like. The
 * USD row matches the Bitcoin dialog's exactly; the XMR row is hand-picked
 * round numbers near those dollar values rather than a conversion of them.
 */
const PRESETS: AmountPresets = {
  usd: [1, 5, 20, 50, 100],
  xmr: [0.005, 0.02, 0.05, 0.2, 0.5],
};

/** Opening amount for a fresh form, in the active unit. */
function defaultAmount(unit: MoneroDisplayUnit): number {
  return unit === 'xmr' ? 0.02 : 5;
}

/** Render an atomic amount as a value the amount field can hold and re-parse. */
function atomicToInputValue(
  atomicUnits: bigint,
  unit: MoneroDisplayUnit,
  xmrPrice: number | undefined,
): string {
  if (unit === 'usd' && xmrPrice) return atomicToFiat(atomicUnits, xmrPrice).toFixed(2);
  return formatXMR(atomicUnits, { maxDecimals: 6, minDecimals: 0 });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A resolved destination for the send.
 *
 * Always an actual Monero address — a Nostr recipient is one whose address we
 * already looked up in their NIP-A3 payment targets, so `pubkey` is display
 * metadata rather than something the send derives anything from.
 */
interface ResolvedRecipient {
  /** Monero address (standard, subaddress, or integrated). */
  address: string;
  /** Hex Nostr pubkey, when the address came from someone's profile. */
  pubkey?: string;
  /** Profile metadata for display, when we have it inline. */
  profile?: SearchProfile;
}

interface SendMoneroDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional `monero:` URI or bare address to prefill the form with. */
  initialUri?: string;
  /** Called after a successful relay, with the transaction hash. */
  onSuccess?: (result: { txHash: string; amount: bigint }) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Wallet "Send Monero" dialog, laid out like {@link SendBitcoinDialog}: one
 * screen, a big editable amount with preset chips on top, a recipient picker
 * with profile autocomplete below it, a single wide button, and a small
 * fee/balance line underneath.
 *
 * Two things work differently, both because of Monero rather than for their
 * own sake:
 *
 *  - **The send is always two taps.** Bitcoin estimates a fee from a vbyte
 *    formula before it builds anything, so its button can state the total up
 *    front and only arms a second tap for large amounts. A Monero fee depends
 *    on the ring members and output count wallet2 selects, which isn't known
 *    until the transaction exists. The first tap builds it (nothing is
 *    broadcast) and fills in the real fee and a summary of what will be spent;
 *    the second relays it.
 *  - **Recipients have to have published an address.** A Bitcoin address is
 *    derived from a pubkey, so every profile is payable. Here the picker only
 *    surfaces people with a Monero address in their kind 10133 — see
 *    {@link useMoneroAddresses}.
 *
 * There's no attribution event on success. A kind 8333 works for Bitcoin
 * because the transaction is publicly verifiable; a Monero transaction isn't,
 * so the equivalent receipt would be an unverifiable claim.
 */
export function SendMoneroDialog({ isOpen, onClose, initialUri, onSuccess }: SendMoneroDialogProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const { config } = useAppContext();
  const { hasWallet, session, unlockedBalance, xmrPrice, phase, needsPassphrase, connect, refreshState } =
    useMoneroWallet();

  // Monero has no sats, so a sats-preferring user writes amounts in XMR. The
  // unit follows the preference alone and never flips when the price arrives —
  // a number that silently changed denomination mid-edit is how you send a
  // hundred times too much.
  const unit: MoneroDisplayUnit = config.currencyDisplay === 'usd' ? 'usd' : 'xmr';

  const [recipient, setRecipient] = useState<ResolvedRecipient | null>(null);
  const [amountInput, setAmountInput] = useState<number | string>(() => defaultAmount(unit));
  const [editingAmount, setEditingAmount] = useState(false);
  const [sweep, setSweep] = useState(false);
  const [prepared, setPrepared] = useState<PreparedTx | null>(null);
  const [busy, setBusy] = useState<'preparing' | 'sending' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ txHash: string; amount: bigint } | null>(null);
  const [pickerQuery, setPickerQuery] = useState<string | undefined>(undefined);

  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>(undefined);
  const dialogContentRef = useCallback((node: HTMLElement | null) => {
    setPortalContainer(node ?? undefined);
  }, []);

  // `useMoneroWallet` is a plain hook, not a shared context, so this dialog
  // holds its own `session` state — the one the wallet panel opened lives in a
  // different instance and isn't visible here. Without opening our own, the
  // send button's `!session` guard never clears and it stays disabled even
  // when the panel behind it reads as fully synced. `connect()` is idempotent
  // and `getSession` is cached per pubkey, so this reuses the already-open
  // wallet rather than loading a second one. A passphrase wallet with no local
  // cache is left alone: that prompt belongs on the wallet page, not here.
  useEffect(() => {
    if (isOpen && hasWallet && !needsPassphrase) void connect();
  }, [isOpen, hasWallet, needsPassphrase, connect]);

  // ── Amount ───────────────────────────────────────────────────

  const typedAmount = useMemo(
    () => amountInputToAtomic(amountInput, unit, xmrPrice),
    [amountInput, unit, xmrPrice],
  );

  /**
   * A `monero:` URI's amount that can't be written into the form yet: in USD
   * mode there is nothing to convert it with until the price lands. Held here
   * and applied by the effect below when it does.
   */
  const pendingAmount = useRef<bigint | null>(null);

  /** Seed the amount field from a `monero:` URI's `tx_amount`. */
  const applyUriAmount = useCallback(
    (amount: bigint | undefined) => {
      if (!amount || amount <= 0n) return;
      if (unit === 'usd' && !xmrPrice) {
        pendingAmount.current = amount;
        return;
      }
      setSweep(false);
      setAmountInput(atomicToInputValue(amount, unit, xmrPrice));
    },
    [unit, xmrPrice],
  );

  useEffect(() => {
    if (!isOpen) return;
    const amount = pendingAmount.current;
    if (amount === null || !xmrPrice) return;
    pendingAmount.current = null;
    setSweep(false);
    setAmountInput(atomicToInputValue(amount, unit, xmrPrice));
  }, [isOpen, unit, xmrPrice]);

  /**
   * What the big number shows. A sweep doesn't have a typed amount — wallet2
   * solves for it — so until the transaction is built the field states the
   * spendable balance, and afterwards the exact amount being sent. Editing it
   * cancels the sweep.
   */
  const fieldValue = sweep
    ? atomicToInputValue(prepared?.amount ?? unlockedBalance, unit, xmrPrice)
    : amountInput;

  // Editing after building invalidates the built transaction: its fee belongs
  // to the output set it was constructed for. Mirrors the Bitcoin dialog
  // re-arming its confirmation whenever the amount moves.
  useEffect(() => {
    setPrepared(null);
  }, [typedAmount, sweep, recipient?.address]);

  const total = prepared ? prepared.amount + prepared.fee : typedAmount;
  // Unlike the Bitcoin dialog — which can't tell "no UTXOs" from "UTXOs still
  // loading" — the spendable balance comes from the encrypted record and
  // resolves with it, so a zero here is a real zero.
  const insufficient = !sweep && typedAmount > 0n && total > unlockedBalance;

  // In USD mode the amount is 0 until the price lands, so fall back to echoing
  // the raw input ("$5") rather than putting a "0" on the send button.
  const totalDisplay =
    total > 0n ? formatMoneroAmount(total, unit, xmrPrice) : formatMoneroAmountInput(amountInput, unit);

  /**
   * The same total in XMR, always stated on the confirming tap.
   *
   * A USD figure is the output of a price fetched over the network, and the
   * thing being authorized is an irreversible, unverifiable transfer. If that
   * number is wrong the user can't tell from a dollar sign — so the
   * confirmation says what actually leaves the wallet.
   */
  const totalXmrDisplay = unit === 'usd' && total > 0n ? formatMoneroAmount(total, 'xmr', xmrPrice) : null;

  const syncing = phase === 'loading' || phase === 'opening' || phase === 'syncing';
  const awaitingPrice = unit === 'usd' && !xmrPrice;

  // ── Send ─────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    setError('');

    if (!session) {
      setError(
        intl.formatMessage({
          id: 'monero.send.error.notReady',
          defaultMessage: 'Your wallet is still syncing. Wait for it to finish before sending.',
        }),
      );
      return;
    }
    if (!recipient) {
      setError(
        intl.formatMessage({
          id: 'monero.send.error.recipient',
          defaultMessage: 'Choose who to send to.',
        }),
      );
      return;
    }
    if (!sweep) {
      if (unit === 'usd' && !xmrPrice) {
        setError(
          intl.formatMessage({
            id: 'monero.send.error.price',
            defaultMessage: 'Waiting for the XMR price…',
          }),
        );
        return;
      }
      if (typedAmount <= 0n) {
        setError(
          intl.formatMessage({
            id: 'monero.send.error.amount',
            defaultMessage: 'Enter an amount greater than zero.',
          }),
        );
        return;
      }
      if (typedAmount > unlockedBalance) {
        setError(
          intl.formatMessage({
            id: 'monero.send.error.insufficient',
            defaultMessage: 'Not enough spendable balance.',
          }),
        );
        return;
      }
    }

    // First tap: build the transaction so the real fee is known. Nothing is
    // broadcast, and the button turns into the confirmation.
    if (!prepared) {
      setBusy('preparing');
      try {
        setPrepared(
          sweep
            ? await prepareSweepTx(session, { address: recipient.address })
            : await prepareTx(session, { address: recipient.address, amount: typedAmount }),
        );
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
      notificationSuccess();
      setSuccess({ txHash, amount: prepared.amount });
      onSuccess?.({ txHash, amount: prepared.amount });
      void refreshState();
      toast({
        title: intl.formatMessage({ id: 'monero.send.sent.title', defaultMessage: 'Monero sent' }),
        description: formatMoneroAmount(prepared.amount, 'xmr', xmrPrice),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to broadcast the transaction');
    } finally {
      setBusy(null);
    }
  }, [
    session,
    recipient,
    sweep,
    unit,
    xmrPrice,
    typedAmount,
    unlockedBalance,
    prepared,
    onSuccess,
    refreshState,
    toast,
    intl,
  ]);

  // ── Open / close ─────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setRecipient(null);
    setAmountInput(defaultAmount(unit));
    setEditingAmount(false);
    setSweep(false);
    setPrepared(null);
    setError('');
    setSuccess(null);
    setPickerQuery(undefined);
    pendingAmount.current = null;
    onClose();
  }, [onClose, unit]);

  // Seed from the incoming URI each time the dialog opens. A `monero:` link is
  // untrusted input — `parseMoneroUri` rejects anything whose address doesn't
  // validate, and a bare string only lands in the picker's query where the
  // same check gates it.
  const seededUri = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!isOpen) {
      seededUri.current = undefined;
      return;
    }
    if (!initialUri || seededUri.current === initialUri) return;
    seededUri.current = initialUri;

    const parsed = parseMoneroUri(initialUri);
    if (parsed) {
      setRecipient({ address: parsed.address });
      applyUriAmount(parsed.amount);
      return;
    }
    const trimmed = initialUri.trim();
    if (isMoneroAddress(trimmed)) {
      setRecipient({ address: trimmed });
      return;
    }
    setPickerQuery(trimmed);
  }, [isOpen, initialUri, applyUriAmount]);

  // ── Render ───────────────────────────────────────────────────

  const sendDisabled =
    !session || syncing || !!busy || !recipient || insufficient || (!sweep && typedAmount <= 0n);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !busy && handleClose()}>
      <DialogContent
        ref={dialogContentRef}
        className="max-w-[425px] rounded-2xl p-0 gap-0 border-border overflow-visible max-h-[95vh] [&>button]:hidden"
      >
        <PortalContainerProvider value={portalContainer}>
          <div className="flex items-center justify-between px-4 h-12">
            <DialogTitle className="text-base font-semibold flex items-center gap-1.5">
              {success ? (
                <FormattedMessage id="monero.send.success.title" defaultMessage="Sent" />
              ) : (
                <FormattedMessage id="monero.send.title" defaultMessage="Send Monero" />
              )}
            </DialogTitle>
            <button
              onClick={handleClose}
              disabled={!!busy}
              className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors disabled:opacity-50"
              aria-label={intl.formatMessage({ id: 'monero.send.close', defaultMessage: 'Close' })}
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[calc(95vh-3rem)]">
            {success ? (
              <SendSuccess
                txHash={success.txHash}
                amount={success.amount}
                unit={unit}
                xmrPrice={xmrPrice}
                onClose={handleClose}
              />
            ) : (
              <div className="grid gap-4 px-4 py-4 w-full overflow-hidden">
                {/* Big editable amount + preset chips, in the active unit. */}
                <div className="grid gap-4 pt-2">
                  <AmountField
                    value={fieldValue}
                    onValueChange={(v) => {
                      setSweep(false);
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

                <RecipientPicker
                  value={recipient}
                  onChange={(next, uriAmount) => {
                    setRecipient(next);
                    if (uriAmount) applyUriAmount(uriAmount);
                    setError('');
                  }}
                  initialQuery={pickerQuery}
                  onInitialQueryConsumed={() => setPickerQuery(undefined)}
                />

                {/*
                  Once the transaction is built, state exactly what the second
                  tap will do: the real XMR total, the fee wallet2 computed, the
                  split if it made one, and the address it goes to. A Monero
                  payment can't be checked afterwards, so this is the last place
                  any of it can be verified.
                */}
                {prepared && (
                  <dl className="grid gap-2 rounded-lg border p-3 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        <FormattedMessage id="monero.send.confirm.amount" defaultMessage="Amount" />
                      </dt>
                      <dd className="font-medium text-right">
                        {formatMoneroAmount(prepared.amount, 'xmr', xmrPrice)}
                        {unit === 'usd' && xmrPrice
                          ? ` · ${formatMoneroAmount(prepared.amount, 'usd', xmrPrice)}`
                          : ''}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        <FormattedMessage id="monero.send.confirm.fee" defaultMessage="Network fee" />
                      </dt>
                      <dd className="text-right">{formatMoneroAmount(prepared.fee, 'xmr', xmrPrice)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">
                        <FormattedMessage id="monero.send.confirm.to" defaultMessage="To" />
                      </dt>
                      <dd className="font-mono text-right break-all">{truncateAddress(prepared.address)}</dd>
                    </div>
                    {/* wallet2 splits a transfer whose inputs don't fit in one
                        transaction. The fee above is already the total, but the
                        recipient will see several payments, so say so. */}
                    {prepared.txCount > 1 && (
                      <p className="text-muted-foreground">
                        <FormattedMessage
                          id="monero.send.confirm.split"
                          defaultMessage="Sent as {count} transactions, because of how your funds are split up."
                          values={{ count: prepared.txCount }}
                        />
                      </p>
                    )}
                  </dl>
                )}

                {error && <p className="text-xs text-destructive break-words">{error}</p>}

                <Button
                  onClick={() => void handleSend()}
                  disabled={sendDisabled}
                  variant={(insufficient || !!prepared) && !busy ? 'destructive' : 'default'}
                  className="w-full"
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                      {busy === 'preparing' ? (
                        <FormattedMessage id="monero.send.building" defaultMessage="Building…" />
                      ) : (
                        <FormattedMessage id="monero.send.sending" defaultMessage="Sending…" />
                      )}
                    </>
                  ) : syncing ? (
                    // Mid-scan there is no output set to spend from, so the
                    // button is a status line rather than a disabled control
                    // wearing a stale label.
                    <>
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                      <FormattedMessage id="monero.send.syncing" defaultMessage="Syncing your wallet…" />
                    </>
                  ) : awaitingPrice && !sweep ? (
                    <>
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                      <FormattedMessage
                        id="monero.send.awaitingPrice"
                        defaultMessage="Waiting for the XMR price…"
                      />
                    </>
                  ) : insufficient ? (
                    <FormattedMessage id="monero.send.insufficient" defaultMessage="Not enough Monero" />
                  ) : prepared ? (
                    <FormattedMessage
                      id="monero.send.confirmAction"
                      defaultMessage="Tap again to send {amount}"
                      values={{ amount: totalXmrDisplay ?? totalDisplay }}
                    />
                  ) : sweep ? (
                    <FormattedMessage id="monero.send.reviewMax" defaultMessage="Review max send" />
                  ) : (
                    <FormattedMessage
                      id="monero.send.send"
                      defaultMessage="Send {amount}"
                      values={{ amount: totalDisplay }}
                    />
                  )}
                </Button>

                {/* Fee and balance line, in the same slot the Bitcoin dialog
                    uses. The fee can't be named until the transaction has been
                    built, and once it has it belongs in the summary above with
                    everything else being confirmed. The balance doubles as the
                    "send everything" control — Monero can't subtract an
                    estimated fee from it the way the Bitcoin wallet does, so a
                    sweep is the only way to empty a wallet. */}
                <div className="flex items-center justify-center gap-3 -mt-1 text-xs text-muted-foreground">
                  {!prepared && (
                    <span>
                      <FormattedMessage
                        id="monero.send.feeUnknown"
                        defaultMessage="Fee shown before you send"
                      />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSweep(true);
                      setEditingAmount(false);
                      setError('');
                    }}
                    disabled={unlockedBalance === 0n}
                    aria-label={intl.formatMessage({
                      id: 'monero.send.max.label',
                      defaultMessage: 'Send your entire spendable balance',
                    })}
                    className={cn(
                      'rounded-sm underline-offset-2 hover:text-foreground hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:no-underline disabled:hover:text-muted-foreground',
                      sweep && 'text-foreground font-medium',
                    )}
                  >
                    <FormattedMessage
                      id="monero.send.max"
                      defaultMessage="Max {amount}"
                      values={{ amount: formatMoneroAmount(unlockedBalance, unit, xmrPrice) }}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        </PortalContainerProvider>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Recipient picker
// ═══════════════════════════════════════════════════════════════════

interface RecipientPickerProps {
  value: ResolvedRecipient | null;
  /** `uriAmount` is set when the input was a `monero:` URI carrying one. */
  onChange: (value: ResolvedRecipient | null, uriAmount?: bigint) => void;
  /** One-shot seed for the query input; cleared via `onInitialQueryConsumed`. */
  initialQuery?: string;
  onInitialQueryConsumed?: () => void;
}

/**
 * Combobox that takes a Monero address, a `monero:` URI, a pasted Nostr
 * identifier, or a profile picked from autocomplete.
 *
 * Only profiles with a Monero address in their NIP-A3 payment targets are
 * offered — see {@link useMoneroAddresses} for why that lookup has to happen
 * before the row is rendered rather than after it's picked.
 */
function RecipientPicker({ value, onChange, initialQuery, onInitialQueryConsumed }: RecipientPickerProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [scannerOpen, setScannerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);

  // One-shot seeding from the parent. Mirrored into local state once, then the
  // parent clears it so later edits aren't overwritten by re-renders.
  useEffect(() => {
    if (!initialQuery) return;
    setQuery(initialQuery);
    setOpen(true);
    onInitialQueryConsumed?.();
  }, [initialQuery, onInitialQueryConsumed]);

  const trimmed = query.trim();
  const uri = useMemo(() => parseMoneroUri(trimmed), [trimmed]);
  const addressCandidate = uri?.address ?? (isMoneroAddress(trimmed) ? trimmed : '');

  // Suppress profile search while the input is an address or URI: the NIP-50
  // query would be run against the address string, racing (usually empty)
  // results against the local recognition path — and leaking the recipient
  // address to the search relay on the way.
  const { data: rawProfiles, isFetching: rawIsFetching, followedPubkeys } = useSearchProfiles(
    addressCandidate ? '' : query,
  );
  const profiles = addressCandidate ? undefined : rawProfiles;
  const isSearching = addressCandidate ? false : rawIsFetching;

  const identifierMatch = useMemo(() => {
    const m = detectIdentifier(query);
    if (!m) return null;
    // Only pubkey-resolvable identifiers belong in this picker. Bare hex is
    // deliberately excluded — it's ambiguous and not a user-facing format.
    switch (m.type) {
      case 'npub':
      case 'nprofile':
      case 'nip05':
        return m;
      default:
        return null;
    }
  }, [query]);

  const searchPubkeys = useMemo(() => (profiles ?? []).map((p) => p.pubkey), [profiles]);
  const { addresses, isLoading: addressesLoading } = useMoneroAddresses(searchPubkeys);

  // Drop the profiles nobody can be paid at. Held back entirely while the
  // lookup is in flight, so rows don't appear and then vanish under the
  // user's finger.
  const payableProfiles = useMemo(() => {
    if (!profiles || addressesLoading) return [];
    return profiles.filter((p) => addresses.has(p.pubkey));
  }, [profiles, addresses, addressesLoading]);

  const hasIdentifier = !!identifierMatch;
  const hasAddress = !identifierMatch && !!addressCandidate;
  const profileCount = payableProfiles.length;
  const totalItems = (hasIdentifier ? 1 : 0) + profileCount + (hasAddress ? 1 : 0);
  const isFetching = isSearching || addressesLoading;

  const selectProfile = useCallback(
    (profile: SearchProfile) => {
      const address = addresses.get(profile.pubkey);
      if (!address) return;
      onChange({ address, pubkey: profile.pubkey, profile });
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [addresses, onChange],
  );

  const selectPubkey = useCallback(
    (pubkey: string, address: string) => {
      onChange({ address, pubkey });
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const selectAddress = useCallback(
    (address: string, uriAmount?: bigint) => {
      onChange({ address }, uriAmount);
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  // A typed or pasted address is unambiguous — skip the one-item dropdown and
  // make the chip straight away. Identifiers stay in their row: unlike the
  // Bitcoin dialog, where an address falls out of the pubkey arithmetically,
  // resolving one here is a relay round-trip that may come back empty.
  useEffect(() => {
    if (!addressCandidate) return;
    selectAddress(addressCandidate, uri?.amount);
  }, [addressCandidate, uri?.amount, selectAddress]);

  // Open the dropdown whenever there's a suggestion or a query in flight.
  useEffect(() => {
    if (trimmed.length === 0) {
      setOpen(false);
      return;
    }
    if (hasIdentifier || hasAddress || profileCount > 0 || isFetching) setOpen(true);
  }, [trimmed, hasIdentifier, hasAddress, profileCount, isFetching]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [payableProfiles, identifierMatch, hasAddress]);

  const handleScan = useCallback(
    (scanned: string) => {
      setScannerOpen(false);
      const value = scanned.trim();

      const parsed = parseMoneroUri(value);
      if (parsed) {
        selectAddress(parsed.address, parsed.amount);
        return;
      }
      if (isMoneroAddress(value)) {
        selectAddress(value);
        return;
      }
      // Anything else (npub / nprofile / nip05, with or without a `nostr:`
      // prefix) goes into the query so the dropdown can resolve it.
      if (detectIdentifier(value)) {
        setQuery(value.replace(/^nostr:/, ''));
        setOpen(true);
        inputRef.current?.focus();
        return;
      }

      toast({
        title: intl.formatMessage({
          id: 'monero.send.scan.failed',
          defaultMessage: "Couldn't read that QR code",
        }),
        description: intl.formatMessage({
          id: 'monero.send.scan.failedHint',
          defaultMessage: 'Expected a Monero address or a Nostr identifier (npub, nprofile, NIP-05).',
        }),
        variant: 'destructive',
      });
    },
    [selectAddress, toast, intl],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (!open || selectedIndex < 0 || selectedIndex >= totalItems) return;
      // Order: [identifier?, ...profiles, address?]
      let idx = selectedIndex;
      if (hasIdentifier) {
        if (idx === 0) {
          // The identifier row owns its own selection — its address may still
          // be resolving — so trigger it through the DOM.
          const items = popoverContentRef.current?.querySelectorAll('[data-recipient-item]');
          (items?.[0] as HTMLElement | undefined)?.click();
          return;
        }
        idx -= 1;
      }
      if (idx < profileCount) {
        selectProfile(payableProfiles[idx]);
        return;
      }
      if (hasAddress) selectAddress(addressCandidate, uri?.amount);
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

  if (value) {
    return <SelectedRecipientChip value={value} onClear={() => onChange(null)} />;
  }

  const showEmptyState = trimmed.length > 0 && !isFetching && totalItems === 0;
  const popoverOpen = open && (totalItems > 0 || isFetching || showEmptyState);

  return (
    <Popover open={popoverOpen} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (trimmed.length > 0) setOpen(true); }}
            // Tapping a still-focused input needs its own opener — `onFocus`
            // only fires on the first tap, so without this the user has to
            // un-focus to get the list back after an outside-click dismiss.
            onClick={() => { if (trimmed.length > 0) setOpen(true); }}
            onKeyDown={handleKeyDown}
            placeholder={intl.formatMessage({
              id: 'monero.send.recipientPlaceholder',
              defaultMessage: 'Search people, paste an npub, or enter a Monero address',
            })}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={popoverOpen}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            className="rounded-full pr-11"
          />

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            aria-label={intl.formatMessage({ id: 'monero.send.scan', defaultMessage: 'Scan QR code' })}
            className="absolute right-1 top-1/2 -translate-y-1/2 size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <QrCode className="size-4" />
          </button>

          <QrScannerDialog
            isOpen={scannerOpen}
            onClose={() => setScannerOpen(false)}
            onScan={handleScan}
            title={intl.formatMessage({
              id: 'monero.send.scanTitle',
              defaultMessage: 'Scan a Monero address',
            })}
          />
        </div>
      </PopoverAnchor>

      <PopoverContent
        ref={popoverContentRef}
        align="start"
        sideOffset={6}
        // Keep typing focus in the input on open/close — Radix's default is to
        // focus the content, which dismisses the mobile keyboard mid-type.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        style={{ width: 'var(--radix-popover-trigger-width)' }}
        className="p-0 w-[--radix-popover-trigger-width] rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
      >
        {totalItems > 0 ? (
          <div role="listbox" className="max-h-[280px] overflow-y-auto py-1">
            {identifierMatch && (
              <IdentifierRow
                match={identifierMatch}
                isSelected={selectedIndex === 0}
                onSelect={selectPubkey}
              />
            )}
            {payableProfiles.map((profile, i) => (
              <ProfileRow
                key={profile.pubkey}
                profile={profile}
                address={addresses.get(profile.pubkey) ?? ''}
                isFollowed={followedPubkeys.has(profile.pubkey)}
                isSelected={selectedIndex === (hasIdentifier ? i + 1 : i)}
                onClick={selectProfile}
              />
            ))}
            {hasAddress && (
              <AddressRow
                address={addressCandidate}
                isSelected={selectedIndex === totalItems - 1}
                onClick={() => selectAddress(addressCandidate, uri?.amount)}
              />
            )}
          </div>
        ) : isFetching ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <FormattedMessage id="monero.send.searching" defaultMessage="Searching…" />
          </div>
        ) : (
          <div className="py-6 px-4 text-center text-sm text-muted-foreground">
            <FormattedMessage
              id="monero.send.noMatches"
              defaultMessage="No matches. Paste a Monero address, or search for someone who has published one."
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Monero address avatar ─────────────────────────────────────

/** Stand-in avatar for a bare address: the Monero symbol from NIP-A3. */
function MoneroAvatar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'size-9 shrink-0 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 font-semibold',
        className,
      )}
    >
      ɱ
    </div>
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
  const intl = useIntl();
  const { pubkey, profile, address } = value;
  // Author lookup only when we have a pubkey but no inline profile.
  const author = useAuthor(profile ? undefined : pubkey);
  const metadata = profile?.metadata ?? author.data?.metadata;
  const tags = profile?.event.tags ?? author.data?.event?.tags ?? [];

  const displayName = pubkey
    ? metadata?.name || metadata?.display_name || intl.formatMessage({
      id: 'monero.send.anonymous',
      defaultMessage: 'Anonymous',
    })
    : intl.formatMessage({ id: 'monero.send.addressLabel', defaultMessage: 'Monero address' });

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-2 py-1.5 w-full min-w-0 max-w-full">
      {pubkey ? (
        <Avatar shape={getAvatarShape(metadata)} className="size-9 shrink-0">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      ) : (
        <MoneroAvatar />
      )}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="text-[11px] text-muted-foreground leading-tight">
          <FormattedMessage id="monero.send.to" defaultMessage="To" />
        </div>
        <div className="text-sm font-medium truncate">
          {pubkey ? <EmojifiedText tags={tags}>{displayName}</EmojifiedText> : displayName}
        </div>
        {/* Always the address, even for a profile: a Monero payment can't be
            verified after the fact, so the destination is worth stating. */}
        <div className="text-xs text-muted-foreground truncate font-mono">{truncateAddress(address)}</div>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label={intl.formatMessage({
          id: 'monero.send.clearRecipient',
          defaultMessage: 'Clear recipient',
        })}
        className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ── Dropdown rows ─────────────────────────────────────────────

const ROW_CLASS = 'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer';

function ProfileRow({
  profile,
  address,
  isFollowed,
  isSelected,
  onClick,
}: {
  profile: SearchProfile;
  address: string;
  isFollowed: boolean;
  isSelected: boolean;
  onClick: (profile: SearchProfile) => void;
}) {
  const intl = useIntl();
  const { metadata } = profile;
  const displayName = metadata.name || metadata.display_name || intl.formatMessage({
    id: 'monero.send.anonymous',
    defaultMessage: 'Anonymous',
  });

  return (
    <button
      type="button"
      data-recipient-item
      role="option"
      aria-selected={isSelected}
      onClick={() => onClick(profile)}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(ROW_CLASS, isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60')}
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
            title={intl.formatMessage({ id: 'monero.send.following', defaultMessage: 'Following' })}
          >
            <UserRoundCheck className="size-2 text-primary-foreground" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">
          <EmojifiedText tags={profile.event.tags}>{displayName}</EmojifiedText>
        </div>
        <div className="text-xs text-muted-foreground truncate font-mono">{truncateAddress(address)}</div>
      </div>
    </button>
  );
}

/**
 * A pasted npub / nprofile / NIP-05.
 *
 * Resolving one means two round-trips — the identifier to a pubkey, then the
 * pubkey to a kind 10133 — so the row carries its own loading state, and says
 * so plainly when the person turns out to have no Monero address rather than
 * disappearing and leaving the user to guess why.
 */
function IdentifierRow({
  match,
  isSelected,
  onSelect,
}: {
  match: IdentifierMatch;
  isSelected: boolean;
  onSelect: (pubkey: string, address: string) => void;
}) {
  const intl = useIntl();
  const nip05Id = match.type === 'nip05' ? match.identifier : undefined;
  const { data: nip05Pubkey, isLoading: isResolvingNip05 } = useNip05Resolve(nip05Id);

  const pubkey =
    match.type === 'npub' || match.type === 'nprofile'
      ? match.pubkey
      : match.type === 'hex'
        ? match.hex
        : nip05Pubkey ?? undefined;

  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;

  const pubkeys = useMemo(() => (pubkey ? [pubkey] : []), [pubkey]);
  const { addresses, isLoading: addressLoading } = useMoneroAddresses(pubkeys);
  const address = pubkey ? addresses.get(pubkey) : undefined;

  const displayName = pubkey
    ? metadata?.name || metadata?.display_name || intl.formatMessage({
      id: 'monero.send.anonymous',
      defaultMessage: 'Anonymous',
    })
    : match.type === 'nip05'
      ? match.identifier
      : '';

  const handleClick = useCallback(() => {
    if (!pubkey || !address) return;
    onSelect(pubkey, address);
  }, [pubkey, address, onSelect]);

  if (isResolvingNip05 || (pubkey && addressLoading)) {
    return (
      <div data-recipient-item className={cn(ROW_CLASS, 'cursor-default')}>
        <div className="size-9 shrink-0 rounded-full bg-secondary animate-pulse" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="h-3.5 w-24 bg-secondary animate-pulse rounded" />
          <div className="h-3 w-32 bg-secondary animate-pulse rounded" />
        </div>
      </div>
    );
  }

  // A NIP-05 that doesn't resolve has nothing to show at all.
  if (!pubkey) return null;

  if (!address) {
    return (
      <div data-recipient-item className={cn(ROW_CLASS, 'cursor-default opacity-70')}>
        <Avatar shape={getAvatarShape(metadata)} className="size-9 shrink-0">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">
            <EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            <FormattedMessage
              id="monero.send.noAddress"
              defaultMessage="Hasn't published a Monero address"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-recipient-item
      role="option"
      aria-selected={isSelected}
      onClick={handleClick}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(ROW_CLASS, isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60')}
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
            <span className="text-muted-foreground">
              <FormattedMessage id="monero.send.loadingProfile" defaultMessage="Loading profile…" />
            </span>
          ) : (
            <EmojifiedText tags={author.data?.event?.tags ?? []}>{displayName}</EmojifiedText>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate font-mono">{truncateAddress(address)}</div>
      </div>
    </button>
  );
}

function AddressRow({
  address,
  isSelected,
  onClick,
}: {
  address: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-recipient-item
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      className={cn(ROW_CLASS, isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60')}
    >
      <MoneroAvatar />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">
          <FormattedMessage id="monero.send.sendToAddress" defaultMessage="Send to Monero address" />
        </div>
        <div className="text-xs text-muted-foreground truncate font-mono">{truncateAddress(address)}</div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Success
// ═══════════════════════════════════════════════════════════════════

interface SendSuccessProps {
  txHash: string;
  amount: bigint;
  unit: MoneroDisplayUnit;
  xmrPrice: number | undefined;
  onClose: () => void;
}

/**
 * Success screen, mirroring the Bitcoin dialog's — minus the "view
 * transaction" link, because there is nothing to look at: a Monero
 * transaction isn't publicly readable, and the hash is only useful to the
 * sender and the recipient. So it's offered to copy instead.
 */
function SendSuccess({ txHash, amount, unit, xmrPrice, onClose }: SendSuccessProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: intl.formatMessage({
          id: 'monero.send.copyFailed',
          defaultMessage: "Couldn't copy the transaction ID",
        }),
        variant: 'destructive',
      });
    }
  }, [txHash, toast, intl]);

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
          className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-400/40 to-orange-600/30 motion-safe:animate-success-halo"
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-500/30 motion-safe:animate-success-pop"
        />
        <Check
          className="relative size-14 text-white drop-shadow-sm motion-safe:animate-success-pop"
          strokeWidth={3}
          aria-hidden
        />
      </div>

      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          <FormattedMessage id="monero.send.success.heading" defaultMessage="Monero sent" />
        </h2>
        <div className="text-4xl font-bold tabular-nums bg-gradient-to-br from-orange-500 to-orange-600 bg-clip-text text-transparent">
          {formatMoneroAmount(amount, 'xmr', xmrPrice)}
        </div>
        {unit === 'usd' && xmrPrice && (
          <div className="text-sm text-muted-foreground">
            {formatMoneroAmount(amount, 'usd', xmrPrice)}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Button type="button" variant="outline" onClick={() => void copy()} className="w-full">
          {copied ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
          <FormattedMessage id="monero.send.copyTxid" defaultMessage="Copy transaction ID" />
        </Button>
        <Button type="button" onClick={onClose} className="w-full">
          <FormattedMessage id="monero.send.done" defaultMessage="Done" />
        </Button>
      </div>
    </div>
  );
}
