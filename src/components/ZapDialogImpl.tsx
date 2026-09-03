import { useState, useEffect, useMemo, useCallback, forwardRef } from 'react';
import { Copy, Check, ExternalLink, X, Loader2, ChevronDown, MessageCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { openUrl } from '@/lib/downloadFile';
import { impactMedium } from '@/lib/haptics';
import { HelpTip } from '@/components/HelpTip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { AmountField } from '@/components/AmountField';
import { OnchainZapContent } from '@/components/OnchainZapContent';
import { GenericPaymentContent } from '@/components/GenericPaymentContent';
import { PaymentMethodIcon } from '@/components/PaymentMethodIcon';
import { ZapSuccessScreen } from '@/components/ZapSuccessScreen';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useToast } from '@/hooks/useToast';
import { useZaps } from '@/hooks/useZaps';
import { useWallet } from '@/hooks/useWallet';
import { useAppContext } from '@/hooks/useAppContext';
import { usePaymentTargets } from '@/hooks/usePaymentTargets';
import { canZap } from '@/lib/canZap';
import { parseCampaign } from '@/lib/campaign';
import {
  PAYMENT_METHODS,
  findBitcoinTarget,
  findLightningTarget,
  isSilentPaymentLike,
  type PaymentMethodDef,
  type PaymentTarget,
} from '@/lib/paymentTargets';
import type { BitcoinRecipientOverride } from '@/hooks/useOnchainZap';
import {
  amountInputToSats,
  fetchBtcPrice,
  formatAmountInput,
  formatMoneyAmount,
  isLargeAmount,
  type AmountPresetSet,
} from '@/lib/bitcoinMoney';
import type { CurrencyDisplay } from '@/contexts/AppContext';
import type { Event } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import type { WebLNProvider } from '@webbtc/webln-types';

export interface ZapDialogProps {
  target: Event;
  /**
   * Optional trigger node. When provided, the dialog wraps it in a
   * `DialogTrigger` so a click opens the dialog (uncontrolled use).
   * Omit when controlling the dialog's `open` state from the outside.
   */
  children?: React.ReactNode;
  className?: string;
  /**
   * Controlled open state. When set, the dialog ignores its internal
   * trigger-click handling and follows this prop instead. Pair with
   * `onOpenChange`.
   */
  open?: boolean;
  /** Controlled open setter. Required when `open` is provided. */
  onOpenChange?: (open: boolean) => void;
}

// Amount presets for the Lightning tab. Lightning zaps are expected to be
// much smaller than on-chain sends (which have a fixed per-tx fee floor),
// so the presets stay in tip-jar territory. The sats row is hand-picked
// round numbers rather than a conversion of the USD row.
const LIGHTNING_PRESETS: AmountPresetSet = {
  usd: [0.1, 0.5, 1, 2, 5],
  sats: [100, 500, 1_000, 2_100, 5_000],
};

/** Opening amount for a fresh dialog, in the user's display currency. */
function defaultAmount(currency: CurrencyDisplay): number {
  return currency === 'sats' ? 500 : 0.5;
}

/**
 * Identifier for a selectable payment method in the dialog. Native methods use
 * fixed ids; generic payment targets reuse their NIP-A3 type string.
 */
type DialogMethodId = string;

/** A method shown in the dialog's title switcher. */
interface DialogMethod {
  id: DialogMethodId;
  def: PaymentMethodDef;
  /** The underlying payment target, for generic (non-native) methods. */
  target?: PaymentTarget;
}

interface LightningZapContentProps {
  invoice: string | null;
  /** Raw amount input, denominated in `currency`. */
  amount: number | string;
  /** The user's display-currency preference. */
  currency: CurrencyDisplay;
  comment: string;
  setComment: (v: string) => void;
  amountSats: number;
  btcPrice: number | undefined;
  isZapping: boolean;
  copied: boolean;
  webln: WebLNProvider | null;
  insufficient: boolean;
  isLarge: boolean;
  confirmArmed: boolean;
  error: string;
  handleZap: () => void;
  handleCopy: () => void;
  openInWallet: () => void;
  setAmount: (amount: number | string) => void;
  setError: (msg: string) => void;
  editingAmount: boolean;
  setEditingAmount: (v: boolean) => void;
  payWithWebLN: () => void;
}

/**
 * Lightning zap flow. Mirrors the onchain tab: one screen, one button, and an
 * optional comment carried into the NIP-57 zap request. The amount is
 * denominated in the user's display currency (`currencyDisplay`) and converted
 * to sats at payment time using the same BTC price query the onchain tab uses.
 *
 * Defined outside `ZapDialog` as a `forwardRef` to keep the amount input
 * from losing focus on parent re-renders.
 */
const LightningZapContent = forwardRef<HTMLDivElement, LightningZapContentProps>(({
  invoice,
  amount,
  currency,
  comment,
  setComment,
  amountSats,
  btcPrice,
  isZapping,
  copied,
  webln,
  insufficient,
  isLarge,
  confirmArmed,
  error,
  handleZap,
  handleCopy,
  openInWallet,
  setAmount,
  setError,
  editingAmount,
  setEditingAmount,
  payWithWebLN,
}, ref) => {
  const [showComment, setShowComment] = useState(false);
  // In USD mode `amountSats` is 0 until the BTC price lands, so fall back to
  // echoing the raw input ("$0.10") rather than rendering an empty label.
  const amountDisplay = amountSats > 0
    ? formatMoneyAmount(amountSats, currency, btcPrice)
    : formatAmountInput(amount, currency);

  if (invoice) {
    return (
      <div ref={ref} className="grid gap-3 px-4 py-4 w-full overflow-hidden">
        {/* Amount header, in the user's preferred display currency. */}
        <div className="flex flex-col items-center pt-1">
          <div className="text-3xl font-semibold tabular-nums">
            {amountDisplay}
          </div>
        </div>

        {/* QR code */}
        <div className="flex justify-center">
          <div className="bg-white p-3 rounded-xl" aria-label="Lightning invoice QR code">
            <QRCodeCanvas value={invoice.toUpperCase()} size={220} level="M" className="block" />
          </div>
        </div>

        {/* Invoice copy row */}
        <div className="flex gap-2 min-w-0">
          <Input
            id="invoice"
            value={invoice}
            readOnly
            aria-label="Lightning invoice"
            className="font-mono text-xs min-w-0 flex-1 overflow-hidden text-ellipsis"
            onClick={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleCopy}
            className="shrink-0"
            aria-label="Copy invoice"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Payment actions */}
        <div className="grid gap-2">
          {webln && (
            <Button
              type="button"
              onClick={payWithWebLN}
              disabled={isZapping}
              className="w-full"
            >
              {isZapping ? (
                <>
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                  Processing…
                </>
              ) : (
                'Pay with WebLN'
              )}
            </Button>
          )}
          <Button
            type="button"
            variant={webln ? 'outline' : 'default'}
            onClick={openInWallet}
            className="w-full"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in Lightning Wallet
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          Scan the QR or copy the invoice to pay with any Lightning wallet.
        </p>
      </div>
    );
  }

  return (
    <div ref={ref} className="grid gap-3 px-4 py-4 w-full overflow-hidden">
      {/* Amount — big number on top, editable by clicking, plus preset chips.
          Lightning zaps lean small, so the defaults stay in tip-jar territory. */}
      <div className="grid gap-3 pt-2">
        <AmountField
          value={amount}
          onValueChange={(v) => { setAmount(v); setError(''); }}
          currency={currency}
          editing={editingAmount}
          setEditing={setEditingAmount}
          presets={LIGHTNING_PRESETS}
          invalid={insufficient}
        />
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Optional comment — carried into the NIP-57 zap request. Revealed by
          the icon on the Send row so it costs no space until wanted. */}
      {showComment && (
        <Input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (optional)"
          maxLength={280}
          aria-label="Comment"
          autoFocus
          className="text-sm rounded-full motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200"
        />
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={handleZap}
          disabled={amountSats <= 0 || isZapping}
          variant={isLarge && !isZapping ? 'destructive' : 'default'}
          className="flex-1 rounded-full"
        >
          {isZapping ? (
            <>
              <Loader2 className="size-4 mr-1.5 animate-spin" />
              Creating invoice…
            </>
          ) : isLarge && confirmArmed ? (
            <>Tap again to send {amountDisplay}</>
          ) : (
            <>Send {amountDisplay}</>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowComment((v) => !v)}
          aria-label="Add a comment"
          aria-pressed={showComment}
          className={`rounded-full ${comment.trim() ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <MessageCircle className="size-4" />
        </Button>
      </div>
    </div>
  );
});
LightningZapContent.displayName = 'LightningZapContent';

export function ZapDialogImpl({
  target,
  children,
  className,
  open: controlledOpen,
  onOpenChange,
}: ZapDialogProps) {
  // Parse kind 33863 campaigns so this dialog can route donations to the
  // campaign's declared `w` endpoint instead of the author's derived
  // Taproot address. Falsy when the target is not a campaign (or is a
  // malformed one — let the regular flow handle it).
  const campaign = useMemo(
    () => (target.kind === 33863 ? parseCampaign(target as NostrEvent) : null),
    [target],
  );
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  // Allow the caller to control open state from the outside (used by ZapMenu
  // to open the dialog after its parent popover finishes dismissing).
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) {
        onOpenChange?.(next);
      } else {
        setUncontrolledOpen(next);
      }
    },
    [isControlled, onOpenChange],
  );
  const { user } = useCurrentUser();
  const { data: author } = useAuthor(target.pubkey);
  const { toast } = useToast();
  const { webln, activeNWC } = useWallet();
  const { config } = useAppContext();
  const { esploraApis } = config;

  // NIP-A3 payment targets declared by the recipient. We don't fetch these
  // for campaigns (campaigns route through their own `w` endpoint). Only
  // fetch once the dialog is open — otherwise every ZapDialog rendered behind
  // a feed's zap button would fire a kind 10133 REQ on mount while closed.
  const { targets: paymentTargets } = usePaymentTargets(
    campaign || !open ? undefined : target.pubkey,
  );

  // A Lightning payment target is preferred over the kind-0 lud16 when zapping.
  const lightningTarget = useMemo(() => findLightningTarget(paymentTargets), [paymentTargets]);

  // Success state: populated by either zap rail's onSuccess callback.
  // When set, we replace the method UI with <ZapSuccessScreen />.
  const [success, setSuccess] = useState<
    | { kind: 'onchain'; amountSats: number; txid: string }
    | { kind: 'lightning'; amountSats: number }
    | null
  >(null);

  const handleLightningSuccess = useCallback(
    ({ amountSats }: { amountSats: number }) => {
      setSuccess({ kind: 'lightning', amountSats });
    },
    [],
  );

  const { zap, isZapping, invoice, setInvoice } = useZaps(
    target,
    webln,
    activeNWC,
    handleLightningSuccess,
    lightningTarget?.authority,
  );

  // The amount input is denominated in the user's display currency (matches
  // OnchainZapContent). In USD mode the sats amount is derived just before we
  // hit the LNURL endpoint; in sats mode the input already *is* sats, so no
  // BTC price is needed to send.
  const currency: CurrencyDisplay = config.currencyDisplay ?? 'usd';
  const [amount, setAmount] = useState<number | string>(() => defaultAmount(currency));
  const [comment, setComment] = useState('');
  const [copied, setCopied] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const [error, setError] = useState('');
  const [confirmArmed, setConfirmArmed] = useState(false);

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price', esploraApis],
    queryFn: ({ signal }) => fetchBtcPrice(esploraApis, signal),
    staleTime: 30_000,
  });

  const amountSats = useMemo(
    () => amountInputToSats(amount, currency, btcPrice),
    [amount, currency, btcPrice],
  );

  const isLarge = isLargeAmount(amountSats, btcPrice);
  // Lightning has no local balance concept (the wallet / LNURL handles that),
  // so `insufficient` stays false — kept for symmetry with the onchain props.
  const insufficient = false;

  // Default method: Bitcoin. Users can switch to Lightning or any configured
  // payment target via the title dropdown. If the user's signer can't sign
  // PSBTs AND Lightning is available, we transparently default to Lightning
  // instead of showing an unusable Bitcoin method as the primary option.
  const { capability: btcCapability } = useBitcoinSigner();
  const hasLightning = canZap(author?.metadata);
  const bitcoinUnsupported = btcCapability === 'unsupported';

  // A Bitcoin payment target overrides the recipient's derived Taproot
  // address. An `sp1…` code routes onto the silent-payment rail (no kind
  // 8333); a `bc1…` address keeps the standard on-chain attribution.
  const bitcoinTarget = useMemo(() => findBitcoinTarget(paymentTargets), [paymentTargets]);
  const bitcoinOverride: BitcoinRecipientOverride | undefined = useMemo(() => {
    if (!bitcoinTarget) return undefined;
    return {
      value: bitcoinTarget.authority,
      mode: isSilentPaymentLike(bitcoinTarget.authority) ? 'sp' : 'onchain',
    };
  }, [bitcoinTarget]);

  // Generic (non-native) payment targets — Monero, Ethereum, etc. These render
  // a QR + native-URI button rather than a built-in send flow.
  const genericTargets = useMemo(
    () =>
      paymentTargets.filter(
        (t) => t.type !== 'bitcoin' && t.type !== 'lightning',
      ),
    [paymentTargets],
  );

  // Build the ordered list of selectable methods for this dialog.
  // Campaigns always render the single on-chain pane (no method switcher).
  const methods = useMemo<DialogMethod[]>(() => {
    if (campaign) return [];
    const list: DialogMethod[] = [
      { id: 'bitcoin', def: PAYMENT_METHODS.bitcoin },
    ];
    if (hasLightning || lightningTarget) {
      list.push({ id: 'lightning', def: PAYMENT_METHODS.lightning });
    }
    for (const t of genericTargets) {
      list.push({ id: t.type, def: PAYMENT_METHODS[t.type], target: t });
    }
    return list;
  }, [campaign, hasLightning, lightningTarget, genericTargets]);

  const defaultMethodId: DialogMethodId =
    bitcoinUnsupported && (hasLightning || lightningTarget) ? 'lightning' : 'bitcoin';
  const [activeMethod, setActiveMethod] = useState<DialogMethodId>(defaultMethodId);

  const currentMethod =
    methods.find((m) => m.id === activeMethod) ?? methods[0];

  // Re-arm (clear confirmation) whenever the amount moves — editing after
  // arming forces another deliberate click. Mirrors OnchainZapContent.
  useEffect(() => {
    setConfirmArmed(false);
  }, [amountSats]);

  const handleCopy = async () => {
    if (invoice) {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      toast({
        title: 'Invoice copied',
        description: 'Lightning invoice copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openInWallet = async () => {
    if (invoice) {
      try {
        await openUrl(`lightning:${invoice}`);
      } catch {
        toast({
          title: 'Could not open wallet',
          description: 'No lightning wallet app is installed to handle this invoice.',
          variant: 'destructive',
        });
      }
    }
  };

  useEffect(() => {
    setAmount(defaultAmount(currency));
    setComment('');
    setInvoice(null);
    setCopied(false);
    setEditingAmount(false);
    setError('');
    setConfirmArmed(false);
    setSuccess(null);
    if (open) {
      setActiveMethod(defaultMethodId);
    }
    // `defaultMethodId` deliberately excluded — we only want to reset the
    // active method on open/close, not on every capability re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currency, setInvoice]);

  // Previously, if Bitcoin capability flipped to `unsupported` mid-session we
  // auto-switched to Lightning because the Bitcoin pane was a dead-end. The
  // Bitcoin pane now shows a QR fallback for unsupported signers, so users
  // should be free to switch into it. We only bias the *initial* method choice
  // toward Lightning (above, in the useState initializer and the open-reset
  // effect); manual navigation into Bitcoin is respected.

  const handleZap = () => {
    setError('');
    // Only USD input needs a price to become sats; a sats amount is payable
    // as-is even when the price endpoint is down.
    if (currency === 'usd' && !btcPrice) { setError('Waiting for BTC price…'); return; }
    if (amountSats <= 0) { setError('Enter an amount.'); return; }

    // Two-tap safety for large amounts: first click arms, second click sends.
    if (isLarge && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }

    impactMedium();
    zap(amountSats, comment.trim());
  };

  const payWithWebLN = () => {
    if (amountSats > 0) {
      zap(amountSats, comment.trim());
    }
  };

  const lightningContentProps: LightningZapContentProps = {
    invoice,
    amount,
    currency,
    comment,
    setComment,
    amountSats,
    btcPrice,
    isZapping,
    copied,
    webln,
    insufficient,
    isLarge,
    confirmArmed,
    error,
    handleZap,
    handleCopy,
    openInWallet,
    setAmount,
    setError,
    editingAmount,
    setEditingAmount,
    payWithWebLN,
  };

  // Zap button shows for any logged-in user except when targeting oneself.
  // Campaigns bypass the self-check: a creator donating to their own
  // campaign is legitimate.
  const canOpenZap = !!user && (!!campaign || user.pubkey !== target.pubkey);

  if (!canOpenZap) {
    // Uncontrolled callers wrap a trigger node; render it bare so the icon
    // still appears (just won't open anything). Controlled callers don't
    // pass children and won't try to open the dialog for themselves anyway.
    return children ? <>{children}</> : null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && (
        <DialogTrigger asChild>
          <div className={`cursor-pointer ${className || ''}`} onClick={(e) => e.stopPropagation()}>
            {children}
          </div>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-[425px] rounded-2xl p-0 gap-0 border-border overflow-hidden max-h-[95vh] [&>button]:hidden" data-testid="zap-modal">
        <div className="flex items-center justify-between px-4 h-12">
          <DialogTitle className="text-base font-semibold flex items-center gap-1.5 min-w-0">
            {success ? (
              'Success'
            ) : campaign ? (
              `Donate to ${campaign.title}`
            ) : invoice ? (
              <>
                Lightning Payment{' '}
                <HelpTip faqId="send-bitcoin-lightning" />
              </>
            ) : methods.length > 1 ? (
              // More than one payment method available (Lightning and/or
              // declared NIP-A3 payment targets) → the title becomes a method
              // switcher. The current method's icon + label + a down chevron
              // open a dropdown of all available methods.
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 min-w-0 rounded-md px-1 -mx-1 hover:bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                    aria-label="Switch payment method"
                  >
                    <PaymentMethodIcon method={currentMethod?.def} />
                    <span className="truncate">{methodTitle(currentMethod)}</span>
                    <ChevronDown className="size-4 shrink-0 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-44" onClick={(e) => e.stopPropagation()}>
                  {methods.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onSelect={() => setActiveMethod(m.id)}
                      className="gap-2"
                    >
                      <PaymentMethodIcon method={m.def} />
                      <span>{m.def.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                Send Bitcoin{' '}
                <HelpTip faqId="send-bitcoin-onchain" />
              </>
            )}
          </DialogTitle>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(95vh-3rem)]">
          {success ? (
            <ZapSuccessScreen
              recipientPubkey={target.pubkey}
              recipientLabel={campaign?.title}
              amountSats={success.amountSats}
              btcPrice={btcPrice}
              txid={success.kind === 'onchain' ? success.txid : undefined}
              onClose={() => setOpen(false)}
            />
          ) : campaign ? (
            // Campaign donations (kind 33863) use the single-pane on-chain UI,
            // routing the send through the campaign's `w` endpoint.
            <OnchainZapContent
              target={target}
              campaign={campaign}
              onSuccess={({ txid, amountSats }) =>
                setSuccess({ kind: 'onchain', amountSats, txid })
              }
              onClose={() => setOpen(false)}
            />
          ) : (
            <ZapMethodPane
              method={currentMethod}
              target={target}
              bitcoinOverride={bitcoinOverride}
              lightningContentProps={lightningContentProps}
              onOnchainSuccess={({ txid, amountSats }) =>
                setSuccess({ kind: 'onchain', amountSats, txid })
              }
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Title label for the current method (native Bitcoin keeps "Send Bitcoin"). */
function methodTitle(method: DialogMethod | undefined): string {
  if (!method) return 'Send Bitcoin';
  if (method.def.kind === 'bitcoin') return 'Send Bitcoin';
  return method.def.label;
}

interface ZapMethodPaneProps {
  method: DialogMethod | undefined;
  target: Event;
  bitcoinOverride: BitcoinRecipientOverride | undefined;
  lightningContentProps: LightningZapContentProps;
  onOnchainSuccess: (result: { txid: string; amountSats: number }) => void;
  onClose: () => void;
}

/** Renders the body for the currently-selected payment method. */
function ZapMethodPane({
  method,
  target,
  bitcoinOverride,
  lightningContentProps,
  onOnchainSuccess,
  onClose,
}: ZapMethodPaneProps) {
  if (method?.def.kind === 'lightning') {
    return <LightningZapContent {...lightningContentProps} />;
  }
  if (method?.def.kind === 'generic' && method.target) {
    return <GenericPaymentContent method={method.def} target={method.target} />;
  }
  // Default: native Bitcoin. Profile zaps use the derived Taproot address
  // unless a Bitcoin payment target overrides it.
  return (
    <OnchainZapContent
      target={target as NostrEvent}
      bitcoinTarget={bitcoinOverride}
      onSuccess={onOnchainSuccess}
      onClose={onClose}
    />
  );
}
