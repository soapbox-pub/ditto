import { useState, useCallback, useEffect } from 'react';
import { Zap, Copy, Check, ExternalLink } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { openUrl } from '@/lib/downloadFile';
import { getThemedQRColors } from '@/lib/qrColors';
import { cn } from '@/lib/utils';

interface LightningInvoiceCardProps {
  invoice: string;
  className?: string;
}

/** Parse the sats amount from a BOLT11 invoice's human-readable part. */
function parseBolt11Amount(bolt11: string): number | null {
  const match = bolt11.toLowerCase().match(/^ln\w+?(\d+)([munp]?)1/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  if (isNaN(value)) return null;
  const multiplier = match[2];
  switch (multiplier) {
    case 'm': return value * 100_000;     // milli-BTC → sats
    case 'u': return value * 100;         // micro-BTC → sats
    case 'n': return value / 10;          // nano-BTC → sats
    case 'p': return value / 10_000;      // pico-BTC → sats
    default:  return value * 100_000_000; // BTC → sats
  }
}

/** Format sats with thousands separator. */
function formatSats(sats: number): string {
  if (sats < 1) return '<1';
  const rounded = Math.round(sats);
  return rounded.toLocaleString();
}

/**
 * Inline card for rendering a BOLT11 lightning invoice found in note content.
 * Horizontal layout with theme-aware QR that expands on tap.
 * Amount text scales to fit via container query units.
 */
export function LightningInvoiceCard({ invoice, className }: LightningInvoiceCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrExpanded, setQrExpanded] = useState(false);

  const amount = parseBolt11Amount(invoice);

  // Generate theme-aware QR code
  useEffect(() => {
    let cancelled = false;
    const { dark, light } = getThemedQRColors();
    QRCode.toDataURL(invoice.toUpperCase(), {
      width: 400,
      margin: 2,
      color: { dark, light },
      errorCorrectionLevel: 'M',
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [invoice]);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      toast({ title: 'Copied', description: 'Lightning invoice copied to clipboard' });
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  }, [invoice, toast]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const handleOpenWallet = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await openUrl(`lightning:${invoice}`);
  }, [invoice]);

  const handlePayWebLN = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const webln = (globalThis as { webln?: { enable?: () => Promise<void>; sendPayment?: (invoice: string) => Promise<unknown> } }).webln;
    if (!webln?.sendPayment) return;
    try {
      setPaying(true);
      if (webln.enable) await webln.enable();
      await webln.sendPayment(invoice);
      toast({ title: 'Payment sent' });
    } catch {
      toast({ title: 'Payment failed', variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  }, [invoice, toast]);

  const toggleQr = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setQrExpanded((v) => !v);
  }, []);

  const hasWebLN = typeof globalThis !== 'undefined' && !!(globalThis as { webln?: unknown }).webln;

  const qrImage = qrDataUrl ? (
    <img
      src={qrDataUrl}
      alt="Lightning Invoice QR"
      className="rounded-xl"
      style={{ imageRendering: 'pixelated' }}
    />
  ) : (
    <div className="aspect-square rounded-xl bg-muted animate-pulse" />
  );

  return (
    <div
      className={cn(
        'isolate my-2.5 relative rounded-2xl border border-border overflow-hidden @container',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Subtle accent glow behind QR area */}
      <div className="absolute -z-10 top-0 left-0 w-44 h-44 bg-primary/[0.06] rounded-full blur-2xl" />

      {/* Expanded QR -- square container that replaces the normal layout */}
      {qrExpanded ? (
        <button
          onClick={toggleQr}
          className="w-full aspect-square cursor-pointer p-5"
        >
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Lightning Invoice QR"
              className="w-full h-full rounded-xl"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <div className="w-full h-full rounded-xl bg-muted animate-pulse" />
          )}
        </button>
      ) : (
      <div className="flex gap-1">
        {/* QR code -- tappable thumbnail */}
        <button onClick={toggleQr} className="shrink-0 p-3 cursor-pointer">
          <div className="size-28 sm:size-40">{qrImage}</div>
        </button>

        {/* Info column */}
        <div className="flex flex-col justify-between py-3.5 pr-3.5 min-w-0 flex-1 gap-2">
          {/* Label + amount */}
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium whitespace-nowrap" style={{ fontSize: 'clamp(0.8rem, 3.5cqw, 1.05rem)' }}>
              <span className="flex items-center justify-center size-5 sm:size-6 rounded-full bg-primary/15 shrink-0">
                <Zap className="size-3 sm:size-3.5 text-primary fill-primary" />
              </span>
              Lightning Invoice
            </div>
            {amount !== null && (
              <div className="font-bold tracking-tight leading-none mt-1 whitespace-nowrap" style={{ fontSize: 'clamp(1.5rem, 8cqw, 2.5rem)' }}>
                {formatSats(amount)}
                <span className="font-normal text-muted-foreground ml-1" style={{ fontSize: 'clamp(0.75rem, 3.5cqw, 1.125rem)' }}>sats</span>
              </div>
            )}
          </div>

          {/* Invoice string with copy */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 group max-w-full"
          >
            <span className="truncate text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors">
              {invoice}
            </span>
            {copied
              ? <Check className="size-3.5 text-primary shrink-0" />
              : <Copy className="size-3.5 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />}
          </button>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {hasWebLN && (
              <Button
                size="sm"
                onClick={handlePayWebLN}
                disabled={paying}
                className="gap-1.5 h-9 rounded-xl"
              >
                <Zap className="size-3.5" />
                {paying ? 'Paying...' : 'Pay'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleOpenWallet} className="gap-1.5 h-9 rounded-xl">
              <ExternalLink className="size-3.5" />
              Open in Wallet
            </Button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
