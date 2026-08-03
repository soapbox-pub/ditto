import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { useToast } from '@/hooks/useToast';
import { openUrl } from '@/lib/downloadFile';
import { type PaymentMethodDef, type PaymentTarget } from '@/lib/paymentTargets';

interface GenericPaymentContentProps {
  method: PaymentMethodDef;
  target: PaymentTarget;
}

/**
 * Renders a non-native payment method (Monero, Ethereum, Nano, Cash App, …) in
 * the zap dialog: a QR code of the preferred URI, a copyable address, and a
 * clickable button that opens the native URI (e.g. `monero:<addr>`) where one
 * exists. We never generate `payto:` URIs — the native scheme is preferred and
 * custodial handles fall back to their web payment page.
 */
export function GenericPaymentContent({ method, target }: GenericPaymentContentProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const uri = useMemo(() => method.uri(target.authority), [method, target.authority]);
  // QR encodes the native URI when there is one (so wallet apps can scan it),
  // otherwise the bare address/handle.
  const qrValue = uri ?? target.authority;

  // Truncate long addresses (e.g. Monero) the same way the wallet page does;
  // short handles (Cash App, etc.) are shown in full.
  const displayAddress = useMemo(() => {
    const addr = target.authority;
    return addr.length > 24 ? `${addr.slice(0, 12)}...${addr.slice(-8)}` : addr;
  }, [target.authority]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(target.authority);
      setCopied(true);
      toast({ title: 'Copied', description: `${method.label} address copied to clipboard` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy manually.', variant: 'destructive' });
    }
  };

  return (
    <div className="grid gap-3 px-4 py-4 w-full overflow-hidden">
      <div className="flex justify-center">
        <div className="bg-white p-3 rounded-xl" aria-label={`${method.label} payment QR code`}>
          <QRCodeCanvas value={qrValue} size={220} level="M" className="block" />
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleCopy}
          title={target.authority}
          aria-label={`Copy ${method.label} address`}
          className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-mono text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer max-w-full"
        >
          <span className="truncate">{displayAddress}</span>
          {copied ? (
            <Check className="size-3.5 shrink-0 text-green-500" />
          ) : (
            <Copy className="size-3.5 shrink-0" />
          )}
        </button>
      </div>

      {uri && (
        <Button type="button" onClick={() => openUrl(uri)} className="w-full">
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in {method.label}
        </Button>
      )}
    </div>
  );
}
