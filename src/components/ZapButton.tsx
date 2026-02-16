import { ZapDialog } from '@/components/ZapDialog';
import { useZaps } from '@/hooks/useZaps';
import { useWallet } from '@/hooks/useWallet';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { Zap } from 'lucide-react';
import type { Event } from 'nostr-tools';

interface ZapButtonProps {
  target: Event;
  className?: string;
  showCount?: boolean;
  zapData?: { count: number; totalSats: number; isLoading?: boolean };
}

export function ZapButton({
  target,
  className = "text-xs ml-1",
  showCount = true,
  zapData: externalZapData
}: ZapButtonProps) {
  const { user } = useCurrentUser();
  const { data: author } = useAuthor(target?.pubkey || '');
  const { webln, activeNWC } = useWallet();

  // Only fetch data if not provided externally
  const { totalSats: fetchedTotalSats, isLoading } = useZaps(
    externalZapData ? [] : target ?? [], // Empty array prevents fetching if external data provided
    webln,
    activeNWC
  );

  // Don't show zap button if user is not logged in, is the author, or author has no lightning address
  if (!user || !target || user.pubkey === target.pubkey || (!author?.metadata?.lud16 && !author?.metadata?.lud06)) {
    return null;
  }

  // Use external data if provided, otherwise use fetched data
  const totalSats = externalZapData?.totalSats ?? fetchedTotalSats;
  const showLoading = externalZapData?.isLoading || isLoading;

  return (
    <ZapDialog target={target}>
      <div className={`flex items-center gap-1 ${className}`}>
        <Zap className="h-4 w-4" />
        <span className="text-xs">
          {showLoading ? (
            '...'
          ) : showCount && totalSats > 0 ? (
            `${totalSats.toLocaleString()}`
          ) : (
            'Zap'
          )}
        </span>
      </div>
    </ZapDialog>
  );
}