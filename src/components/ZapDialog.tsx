import { useState, useEffect, useRef, forwardRef } from 'react';
import { Zap, Copy, Check, ExternalLink, Sparkle, Sparkles, Star, Rocket, X } from 'lucide-react';
import { HelpTip } from '@/components/HelpTip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useToast } from '@/hooks/useToast';
import { useZaps } from '@/hooks/useZaps';
import { useWallet } from '@/hooks/useWallet';
import { useAppContext } from '@/hooks/useAppContext';
import type { Event } from 'nostr-tools';
import QRCode from 'qrcode';
import type { WebLNProvider } from "@webbtc/webln-types";

interface ZapDialogProps {
  target: Event;
  children?: React.ReactNode;
  className?: string;
}

const presetAmounts = [
  { amount: 21, icon: Sparkle },
  { amount: 50, icon: Sparkles },
  { amount: 100, icon: Zap },
  { amount: 250, icon: Star },
  { amount: 1000, icon: Rocket },
];

interface ZapContentProps {
  invoice: string | null;
  amount: number | string;
  comment: string;
  isZapping: boolean;
  qrCodeUrl: string;
  copied: boolean;
  webln: WebLNProvider | null;
  handleZap: () => void;
  handleCopy: () => void;
  openInWallet: () => void;
  setAmount: (amount: number | string) => void;
  setComment: (comment: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  zap: (amount: number, comment: string) => void;
}

// Moved ZapContent outside of ZapDialog to prevent re-renders causing focus loss
const ZapContent = forwardRef<HTMLDivElement, ZapContentProps>(({
  invoice,
  amount,
  comment,
  isZapping,
  qrCodeUrl,
  copied,
  webln,
  handleZap,
  handleCopy,
  openInWallet,
  setAmount,
  setComment,
  inputRef,
  zap,
}, ref) => (
  <div ref={ref}>
    {invoice ? (
      <div className="flex flex-col h-full min-h-0">
        {/* Payment amount display */}
        <div className="text-center pt-4">
          <div className="text-2xl font-bold">{amount} sats</div>
        </div>

        <Separator className="my-4" />

        <div className="flex flex-col justify-center min-h-0 flex-1 px-5">
          {/* QR Code */}
          <div className="flex justify-center">
            <Card className="p-3 w-[min(240px,70vw,35vh)] mx-auto">
              <CardContent className="p-0 flex justify-center">
                {qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="Lightning Invoice QR Code"
                    className="w-full h-auto aspect-square object-contain"
                  />
                ) : (
                  <div className="w-full aspect-square bg-muted animate-pulse rounded" />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Invoice input */}
          <div className="space-y-2 mt-4">
            <Label htmlFor="invoice">Lightning Invoice</Label>
            <div className="flex gap-2 min-w-0">
              <Input
                id="invoice"
                value={invoice}
                readOnly
                className="font-mono text-base md:text-xs min-w-0 flex-1 overflow-hidden text-ellipsis"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Payment buttons */}
          <div className="space-y-3 mt-4">
            {webln && (
              <Button
                onClick={() => {
                  const finalAmount = typeof amount === 'string' ? parseInt(amount, 10) : amount;
                  zap(finalAmount, comment);
                }}
                disabled={isZapping}
                className="w-full"
                size="lg"
              >
                <Zap className="h-4 w-4 mr-2" />
                {isZapping ? "Processing..." : "Pay with WebLN"}
              </Button>
            )}

            <Button
              variant="outline"
              onClick={openInWallet}
              className="w-full"
              size="lg"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in Lightning Wallet
            </Button>

            <div className="text-xs text-muted-foreground text-center pb-3">
              Scan the QR code or copy the invoice to pay with any Lightning wallet.
            </div>
          </div>
        </div>
      </div>
    ) : (
      <>
        <div className="grid gap-3 px-4 py-4 w-full overflow-hidden">
          <ToggleGroup
            type="single"
            value={String(amount)}
            onValueChange={(value) => {
              if (value) {
                setAmount(parseInt(value, 10));
              }
            }}
            className="grid grid-cols-5 gap-1 w-full"
          >
            {presetAmounts.map(({ amount: presetAmount, icon: Icon }) => (
              <ToggleGroupItem
                key={presetAmount}
                value={String(presetAmount)}
                className="flex flex-col h-auto min-w-0 text-xs px-1 py-2"
              >
                <Icon className="h-4 w-4 mb-1" />
                <span className="truncate">{presetAmount}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-muted" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="h-px flex-1 bg-muted" />
          </div>
          <Input
            ref={inputRef}
            id="custom-amount"
            type="number"
            placeholder="Custom amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full"
          />
          <Textarea
            id="custom-comment"
            placeholder="Add a comment (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full resize-none"
            rows={2}
          />
        </div>
        <div className="px-4 pb-4">
          <Button onClick={handleZap} className="w-full" disabled={isZapping} size="default">
            {isZapping ? (
              'Creating invoice...'
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Zap {amount} sats
              </>
            )}
          </Button>
        </div>
      </>
    )}
  </div>
));
ZapContent.displayName = 'ZapContent';

export function ZapDialog({ target, children, className }: ZapDialogProps) {
  const [open, setOpen] = useState(false);
  const { user } = useCurrentUser();
  const { data: author } = useAuthor(target.pubkey);
  const { toast } = useToast();
  const { webln, activeNWC } = useWallet();
  const { zap, isZapping, invoice, setInvoice } = useZaps(target, webln, activeNWC, () => setOpen(false));
  const { config } = useAppContext();
  const [amount, setAmount] = useState<number | string>(100);
  const [comment, setComment] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (target) {
      setComment(`Zapped with ${config.appName}!`);
    }
  }, [target, config.appName]);

  // Generate QR code
  useEffect(() => {
    let isCancelled = false;

    const generateQR = async () => {
      if (!invoice) {
        setQrCodeUrl('');
        return;
      }

      try {
        const url = await QRCode.toDataURL(invoice.toUpperCase(), {
          width: 512,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });

        if (!isCancelled) {
          setQrCodeUrl(url);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to generate QR code:', err);
        }
      }
    };

    generateQR();

    return () => {
      isCancelled = true;
    };
  }, [invoice]);

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
      const lightningUrl = `lightning:${invoice}`;
      window.open(lightningUrl, '_blank');
    }
  };

  useEffect(() => {
    if (open) {
      setAmount(100);
      setInvoice(null);
      setCopied(false);
      setQrCodeUrl('');
    } else {
      setAmount(100);
      setInvoice(null);
      setCopied(false);
      setQrCodeUrl('');
    }
  }, [open, setInvoice]);

  const handleZap = () => {
    const finalAmount = typeof amount === 'string' ? parseInt(amount, 10) : amount;
    zap(finalAmount, comment);
  };

  const contentProps = {
    invoice,
    amount,
    comment,
    isZapping,
    qrCodeUrl,
    copied,
    webln,
    handleZap,
    handleCopy,
    openInWallet,
    setAmount,
    setComment,
    inputRef,
    zap,
  };

  const canZap = !!user && user.pubkey !== target.pubkey && !!(author?.metadata?.lud06 || author?.metadata?.lud16);

  if (!canZap) {
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
            {invoice ? 'Lightning Payment' : 'Send a Zap'} <HelpTip faqId="what-are-zaps" />
          </DialogTitle>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="px-4 -mt-1 mb-1 text-sm text-muted-foreground">
          {invoice ? 'Pay with Bitcoin Lightning Network' : 'Send a small Bitcoin payment to support the creator.'}
        </p>
        <div className="overflow-y-auto">
          <ZapContent {...contentProps} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
