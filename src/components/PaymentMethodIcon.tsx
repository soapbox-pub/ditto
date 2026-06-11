import { Bitcoin, Zap } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { PaymentMethodDef } from '@/lib/paymentTargets';

interface PaymentMethodIconProps {
  method: PaymentMethodDef | undefined;
  className?: string;
}

/**
 * Renders the icon for a NIP-A3 payment method. Native Bitcoin and Lightning
 * use their lucide glyphs; generic methods (Monero, Ethereum, …) render their
 * currency symbol character.
 */
export function PaymentMethodIcon({ method, className }: PaymentMethodIconProps) {
  const cls = cn('size-4 shrink-0', className);
  if (!method || method.kind === 'bitcoin') return <Bitcoin className={cls} />;
  if (method.kind === 'lightning') return <Zap className={cls} />;
  return (
    <span aria-hidden className={cn('w-4 text-center shrink-0 text-base leading-none', className)}>
      {method.symbol}
    </span>
  );
}
