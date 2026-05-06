import { useState, useEffect, useRef, useMemo, useCallback, forwardRef } from 'react';
import { Zap, Copy, Check, ExternalLink, X, Bitcoin, Loader2 } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { OnchainZapContent } from '@/components/OnchainZapContent';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useToast } from '@/hooks/useToast';
import { useZaps } from '@/hooks/useZaps';
import { useWallet } from '@/hooks/useWallet';
import { canZap } from '@/lib/canZap';
import {
  fetchBtcPrice,
  isLargeAmount,
  satsToUSD,
  formatSats,
} from '@/lib/bitcoin';
import type { Event } from 'nostr-tools';
import type { WebLNProvider } from '@webbtc/webln-types';

interface ZapDialogProps {
  target: Event;
  children?: React.ReactNode;
  className?: string;
}

// USD presets — identical set to the onchain tab so the two flows feel like
// the same dialog in two flavors rather than two different products.
const USD_PRESETS = [1, 5, 10, 25, 100];

interface LightningZapContentProps {
  invoice: string | null;
  usdAmount: number | string;
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
  setUsdAmount: (amount: number | string) => void;
  setError: (msg: string) => void;
  editingAmount: boolean;
  setEditingAmount: (v: boolean) => void;
  amountInputRef: React.RefObject<HTMLInputElement | null>;
  commitAmountEdit: () => void;
  payWithWebLN: () => void;
}

/**
 * Lightning zap flow. Mirrors the onchain tab: one screen, one button, no
 * comment field. Amount is denominated in USD and converted to sats at
 * payment time using the same BTC price query the onchain tab uses.
 *
 * Defined outside `ZapDialog` as a `forwardRef` to keep the amount input
 * from losing focus on parent re-renders.
 */
const LightningZapContent = forwardRef<HTMLDivElement, LightningZapContentProps>(({
  invoice,
  usdAmount,
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
  setUsdAmount,
  setError,
  editingAmount,
  setEditingAmount,
  amountInputRef,
  commitAmountEdit,
  payWithWebLN,
}, ref) => {
  const currentUsd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
  const hasValidAmount = Number.isFinite(currentUsd) && currentUsd > 0;
  const usdString = btcPrice && amountSats > 0 ? satsToUSD(amountSats, btcPrice) : '';
  const usdDisplay = usdString || (hasValidAmount ? `$${currentUsd}` : '');

  if (invoice) {
    return (
      <div ref={ref} className="grid gap-3 px-4 py-4 w-full overflow-hidden">
        {/* Amount header — USD primary, sats secondary (matches onchain). */}
        <div className="flex flex-col items-center pt-1">
          <div className="text-3xl font-semibold tabular-nums">
            {usdDisplay || `${formatSats(amountSats)} sats`}
          </div>
          {usdDisplay && (
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatSats(amountSats)} sats
            </div>
          )}
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
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Pay with WebLN
                </>
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
      {/* Amount — big number on top, editable by clicking. Matches OnchainZapContent. */}
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
        {btcPrice && amountSats > 0 && (
          <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
            {formatSats(amountSats)} sats
          </div>
        )}
      </div>

      {/* Presets — compact. */}
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

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <Button
        type="button"
        onClick={handleZap}
        disabled={!btcPrice || amountSats <= 0 || isZapping}
        variant={isLarge && !isZapping ? 'destructive' : 'default'}
        className="w-full"
      >
        {isZapping ? (
          <>
            <Loader2 className="size-4 mr-1.5 animate-spin" />
            Creating invoice…
          </>
        ) : isLarge && confirmArmed ? (
          <>Tap again to send {usdDisplay}</>
        ) : (
          <>
            <Zap className="h-4 w-4 mr-2" />
            Send {usdDisplay}
          </>
        )}
      </Button>
    </div>
  );
});
LightningZapContent.displayName = 'LightningZapContent';

export function ZapDialog({ target, children, className }: ZapDialogProps) {
  const [open, setOpen] = useState(false);
  const { user } = useCurrentUser();
  const { data: author } = useAuthor(target.pubkey);
  const { toast } = useToast();
  const { webln, activeNWC } = useWallet();
  const { zap, isZapping, invoice, setInvoice } = useZaps(target, webln, activeNWC, () => setOpen(false));

  // USD-denominated state (matches OnchainZapContent). The sats amount is
  // derived just before we hit the LNURL endpoint.
  const [usdAmount, setUsdAmount] = useState<number | string>(5);
  const [copied, setCopied] = useState(false);
  const [editingAmount, setEditingAmount] = useState(false);
  const [error, setError] = useState('');
  const [confirmArmed, setConfirmArmed] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const { data: btcPrice } = useQuery({
    queryKey: ['btc-price'],
    queryFn: fetchBtcPrice,
    staleTime: 30_000,
  });

  // Convert the USD amount to sats for the actual Lightning payment.
  const amountSats = useMemo(() => {
    if (!btcPrice) return 0;
    const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
    if (!Number.isFinite(usd) || usd <= 0) return 0;
    const btc = usd / btcPrice;
    return Math.round(btc * 100_000_000);
  }, [usdAmount, btcPrice]);

  const isLarge = isLargeAmount(amountSats, btcPrice);
  // Lightning has no local balance concept (the wallet / LNURL handles that),
  // so `insufficient` stays false — kept for symmetry with the onchain props.
  const insufficient = false;

  // Default tab: Bitcoin. Users can switch to Lightning if available.
  // If the user's signer can't sign PSBTs AND Lightning is available, we
  // transparently default to Lightning instead of showing an unusable
  // Bitcoin tab as the primary option.
  const { capability: btcCapability } = useBitcoinSigner();
  const hasLightning = canZap(author?.metadata);
  const bitcoinUnsupported = btcCapability === 'unsupported';
  const [activeTab, setActiveTab] = useState<'onchain' | 'lightning'>(
    bitcoinUnsupported && hasLightning ? 'lightning' : 'onchain',
  );

  // Re-arm (clear confirmation) whenever the amount moves — editing after
  // arming forces another deliberate click. Mirrors OnchainZapContent.
  useEffect(() => {
    setConfirmArmed(false);
  }, [amountSats]);

  // Focus + select-all when the amount is clicked into edit mode.
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

  const openInWallet = () => {
    if (invoice) {
      openUrl(`lightning:${invoice}`);
    }
  };

  useEffect(() => {
    if (open) {
      setUsdAmount(5);
      setInvoice(null);
      setCopied(false);
      setEditingAmount(false);
      setError('');
      setConfirmArmed(false);
      setActiveTab(bitcoinUnsupported && hasLightning ? 'lightning' : 'onchain');
    } else {
      setUsdAmount(5);
      setInvoice(null);
      setCopied(false);
      setEditingAmount(false);
      setError('');
      setConfirmArmed(false);
    }
    // `bitcoinUnsupported`/`hasLightning` deliberately excluded — we only
    // want to reset the active tab on open/close, not on every capability
    // re-render. The mid-session flip is handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, setInvoice]);

  // Previously, if Bitcoin capability flipped to `unsupported` mid-session we
  // auto-switched to Lightning because the Bitcoin tab was a dead-end. The
  // Bitcoin tab now shows a QR fallback for unsupported signers, so users
  // should be free to click into it. We only bias the *initial* tab choice
  // toward Lightning (above, in the useState initializer and the open-reset
  // effect); manual navigation into Bitcoin is respected.

  const handleZap = () => {
    setError('');
    if (!btcPrice) { setError('Waiting for BTC price…'); return; }
    if (amountSats <= 0) { setError('Enter an amount.'); return; }

    // Two-tap safety for large amounts: first click arms, second click sends.
    if (isLarge && !confirmArmed) {
      setConfirmArmed(true);
      return;
    }

    impactMedium();
    zap(amountSats, '');
  };

  const payWithWebLN = () => {
    if (amountSats > 0) {
      zap(amountSats, '');
    }
  };

  const lightningContentProps: LightningZapContentProps = {
    invoice,
    usdAmount,
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
    setUsdAmount,
    setError,
    editingAmount,
    setEditingAmount,
    amountInputRef,
    commitAmountEdit,
    payWithWebLN,
  };

  // Zap button shows for any logged-in user except when targeting oneself.
  // On-chain is always available; Lightning is offered as an in-dialog option
  // when the author has a Lightning address.
  const canOpenZap = !!user && user.pubkey !== target.pubkey;

  if (!canOpenZap) {
    return <>{children}</>;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className={`cursor-pointer ${className || ''}`} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-[425px] rounded-2xl p-0 gap-0 border-border overflow-hidden max-h-[95vh] [&>button]:hidden" data-testid="zap-modal">
        <div className="flex items-center justify-between px-4 h-12">
          <DialogTitle className="text-base font-semibold flex items-center gap-1.5">
            {invoice
              ? 'Lightning Payment'
              : 'Send Bitcoin'}{' '}
            <HelpTip
              faqId={
                invoice || activeTab === 'lightning'
                  ? 'send-bitcoin-lightning'
                  : 'send-bitcoin-onchain'
              }
            />
          </DialogTitle>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto">
          {hasLightning ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'onchain' | 'lightning')} className="w-full">
              <div className="px-4 pt-2">
                <TabsList className="grid w-full grid-cols-2 h-9">
                  <TabsTrigger value="onchain" className="gap-1.5 text-xs">
                    <Bitcoin className="size-3.5" /> Bitcoin
                  </TabsTrigger>
                  <TabsTrigger value="lightning" className="gap-1.5 text-xs">
                    <Zap className="size-3.5" /> Lightning
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="onchain" className="mt-0">
                <OnchainZapContent target={target} onSuccess={() => setOpen(false)} />
              </TabsContent>
              <TabsContent value="lightning" className="mt-0">
                <LightningZapContent {...lightningContentProps} />
              </TabsContent>
            </Tabs>
          ) : (
            <OnchainZapContent target={target} onSuccess={() => setOpen(false)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
