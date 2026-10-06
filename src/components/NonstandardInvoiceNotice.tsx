import { Zap } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

import { ExternalFavicon } from '@/components/ExternalFavicon';

interface NonstandardInvoiceNoticeProps {
  /** The LNURL callback that issued the invoice; its host names the provider. */
  callback: string;
}

/**
 * Names the lightning provider, with its favicon, that issued an invoice not
 * bound to the zap request as NIP-57 specifies.
 */
export function NonstandardInvoiceNotice({ callback }: NonstandardInvoiceNoticeProps) {
  const host = new URL(callback).hostname;

  return (
    <div className="flex items-start gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
      <ExternalFavicon
        url={callback}
        size={16}
        className="mt-px size-4 shrink-0"
        fallback={<Zap className="size-4" />}
      />
      <span className="min-w-0">
        <FormattedMessage
          id="zap.nonstandardInvoice"
          defaultMessage="{host}'s invoice is for the right amount, but doesn't record who it's from, which post it's for, or your comment."
          values={{ host: <span className="font-medium text-foreground">{host}</span> }}
        />
      </span>
    </div>
  );
}
