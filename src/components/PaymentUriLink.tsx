import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bitcoin, Copy, ExternalLink, Search, Wallet, Zap } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/useToast';
import { openUrl } from '@/lib/downloadFile';
import { resolveSchemeUri } from '@/lib/schemeUri';
import { isSilentPaymentAddress } from '@/lib/silentPaymentsCore';

interface PaymentUriLinkProps {
  /** `bitcoin` for a BIP-21 URI, `lightning` for a lightning address or LNURL. */
  scheme: 'bitcoin' | 'lightning';
  /** The full URI as written in the note, already validated by the caller. */
  uri: string;
  /** The address the URI pays: an on-chain / silent payment address, or a lightning address. */
  address: string;
}

/**
 * An inline `bitcoin:` or `lightning:` URI found in note content. Tapping it
 * opens a menu rather than paying straight away: the address came from an
 * untrusted event, so the user picks where it goes — Ditto's own wallet, an
 * external wallet app, or just the clipboard.
 */
export function PaymentUriLink({ scheme, uri, address }: PaymentUriLinkProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: intl.formatMessage({ id: 'paymentUri.copied', defaultMessage: 'Address copied' }) });
    } catch {
      toast({ title: intl.formatMessage({ id: 'paymentUri.copyFailed', defaultMessage: 'Failed to copy' }), variant: 'destructive' });
    }
  }, [address, toast, intl]);

  const handleOpenExternal = useCallback(async () => {
    try {
      await openUrl(uri);
    } catch {
      toast({
        title: intl.formatMessage({ id: 'paymentUri.openFailed', defaultMessage: 'Could not open wallet' }),
        description: intl.formatMessage({ id: 'paymentUri.openFailedDescription', defaultMessage: 'No wallet app is installed to handle this address.' }),
        variant: 'destructive',
      });
    }
  }, [uri, toast, intl]);

  const handleSendInApp = useCallback(() => {
    const target = resolveSchemeUri(uri);
    if (target) navigate(target.path, { state: target.state });
  }, [uri, navigate]);

  const Icon = scheme === 'bitcoin' ? Bitcoin : Zap;
  // Silent payment codes and `bitcoin:?sp=…` URIs have no address to look up.
  const viewable = scheme === 'bitcoin' && !!address && !isSilentPaymentAddress(address);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline text-left text-primary hover:underline break-all rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon className="inline size-[1em] mr-0.5 align-[-0.125em]" aria-hidden />
          {uri}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" onClick={(e) => e.stopPropagation()}>
        {scheme === 'bitcoin' && (
          <DropdownMenuItem onSelect={handleSendInApp} className="gap-2">
            <Wallet className="size-4" />
            <FormattedMessage id="paymentUri.sendWithWallet" defaultMessage="Send from my wallet" />
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={handleOpenExternal} className="gap-2">
          <ExternalLink className="size-4" />
          <FormattedMessage id="paymentUri.openInWallet" defaultMessage="Open in wallet app" />
        </DropdownMenuItem>
        {viewable && (
          <DropdownMenuItem asChild className="gap-2">
            <Link to={`/i/bitcoin:address:${address}`}>
              <Search className="size-4" />
              <FormattedMessage id="paymentUri.viewAddress" defaultMessage="View address" />
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={handleCopy} className="gap-2">
          <Copy className="size-4" />
          <FormattedMessage id="paymentUri.copyAddress" defaultMessage="Copy address" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
