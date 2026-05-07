import { useMemo } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { openUrl } from '@/lib/downloadFile';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getAvatarShape } from '@/lib/avatarShape';
import { useAuthor } from '@/hooks/useAuthor';
import { satsToUSD } from '@/lib/bitcoin';
import { genUserName } from '@/lib/genUserName';

interface ZapSuccessScreenProps {
  /** Recipient pubkey (hex). Used to resolve the author avatar + name. */
  recipientPubkey: string;
  /** Amount sent in satoshis. */
  amountSats: number;
  /** Current BTC/USD price for display; optional, falls back to sats only. */
  btcPrice: number | undefined;
  /** Bitcoin txid (onchain only). Enables the mempool.space link. */
  txid?: string;
  /** Close handler invoked by the "Done" button. */
  onClose: () => void;
}

/**
 * Grand confirmation screen shown after a successful Bitcoin send in the
 * ZapDialog. Replaces the previous toast-and-auto-close behavior with a
 * dedicated celebration moment: animated checkmark, expanding halo, a
 * confetti-adjacent sparkle burst, the amount sent, the recipient, and
 * a "View transaction" shortcut when we have a txid on hand.
 *
 * Respects `prefers-reduced-motion`: the entrance animations collapse to a
 * simple fade and the sparkle burst is suppressed.
 */
export function ZapSuccessScreen({
  recipientPubkey,
  amountSats,
  btcPrice,
  txid,
  onClose,
}: ZapSuccessScreenProps) {
  const { data: author } = useAuthor(recipientPubkey);
  const metadata = author?.metadata;
  const displayName = metadata?.name || metadata?.display_name || genUserName(recipientPubkey);
  const avatarShape = getAvatarShape(metadata);

  const usdDisplay = useMemo(
    () => (btcPrice ? satsToUSD(amountSats, btcPrice) : ''),
    [amountSats, btcPrice],
  );

  // Sparkle burst positions: 8 particles radiating outward from the
  // checkmark, each with a slightly offset delay so the burst reads organic
  // rather than synchronised.
  const sparkles = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 58;
        return {
          id: i,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          delay: 0.15 + (i % 4) * 0.05,
          hue: i % 2 === 0 ? 'bg-amber-400' : 'bg-orange-500',
        };
      }),
    [],
  );

  const viewOnMempool = () => {
    if (txid) openUrl(`https://mempool.space/tx/${txid}`);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative grid gap-5 px-6 py-8 w-full overflow-hidden text-center motion-safe:animate-success-fade-up"
    >
      {/* Soft radial glow behind the whole card. Pure decoration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_35%,hsl(var(--primary)/0.18),transparent_65%)]"
      />

      {/* Check + halo + sparkles */}
      <div className="relative mx-auto flex size-28 items-center justify-center">
        {/* Expanding halo ring */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400/40 to-orange-500/30 motion-safe:animate-success-halo"
        />

        {/* Solid gradient disc */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/30 motion-safe:animate-success-pop"
        />

        {/* Checkmark */}
        <Check
          className="relative size-14 text-white drop-shadow-sm motion-safe:animate-success-pop"
          strokeWidth={3}
          aria-hidden
        />

        {/* Sparkle burst */}
        <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
          {sparkles.map((s) => (
            <span
              key={s.id}
              className={`absolute left-1/2 top-1/2 size-1.5 rounded-full ${s.hue} motion-safe:animate-success-spark`}
              style={
                {
                  '--spark-x': `${s.x}px`,
                  '--spark-y': `${s.y}px`,
                  animationDelay: `${s.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>

      {/* Headline + amount */}
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Bitcoin sent
        </h2>
        <div className="text-4xl font-bold tabular-nums bg-gradient-to-br from-amber-500 to-orange-600 bg-clip-text text-transparent">
          {usdDisplay || `${amountSats.toLocaleString()} sats`}
        </div>
      </div>

      {/* Recipient card */}
      <div className="mx-auto flex items-center gap-3 rounded-full border border-border/70 bg-muted/40 pl-2 pr-4 py-2 max-w-full">
        <Avatar shape={avatarShape} className="size-8 shrink-0">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 text-left">
          <div className="text-[11px] text-muted-foreground leading-tight">To</div>
          <div className="text-sm font-medium truncate max-w-[220px]">{displayName}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid gap-2">
        {txid && (
          <Button
            type="button"
            variant="outline"
            onClick={viewOnMempool}
            className="w-full"
          >
            <ExternalLink className="size-4 mr-2" />
            View transaction
          </Button>
        )}
        <Button type="button" onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    </div>
  );
}
