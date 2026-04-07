import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Bitcoin, Copy, Check, RefreshCw, Wallet, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { LoginArea } from '@/components/auth/LoginArea';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { satsToBTC, formatSats } from '@/lib/bitcoin';

export function WalletPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { bitcoinAddress, addressData, isLoading, error, refetch } = useBitcoinWallet();

  const [copiedAddress, setCopiedAddress] = useState(false);

  useSeoMeta({
    title: `Wallet | ${config.appName}`,
    description: 'Your Bitcoin Taproot wallet derived from your Nostr identity.',
  });

  const copyAddress = async () => {
    if (!bitcoinAddress) return;
    try {
      await navigator.clipboard.writeText(bitcoinAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

  const truncatedAddress = bitcoinAddress
    ? `${bitcoinAddress.slice(0, 12)}...${bitcoinAddress.slice(-8)}`
    : '';

  return (
    <main>
      <PageHeader title="Wallet" icon={<Wallet className="size-5" />} />

      {!user ? (
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <Bitcoin className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h2 className="text-xl font-bold">Your Bitcoin Wallet</h2>
            <p className="text-muted-foreground text-sm">
              Log in to see your Bitcoin Taproot address derived from your Nostr identity.
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      ) : (
        <div className="flex flex-col items-center px-4 pt-8 pb-4 space-y-6 max-w-sm mx-auto">
          {/* Balance */}
          {isLoading ? (
            <div className="flex flex-col items-center space-y-2">
              <Skeleton className="h-10 w-40 rounded-lg" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
          ) : error ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-destructive">Failed to load balance</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          ) : addressData ? (
            <div className="flex flex-col items-center space-y-1">
              <button
                onClick={() => refetch()}
                className="group flex items-baseline gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                disabled={isLoading}
              >
                <span className="text-4xl font-bold tracking-tight">
                  {satsToBTC(addressData.totalBalance).replace(/\.?0+$/, '')}
                </span>
                <span className="text-lg font-medium text-muted-foreground">BTC</span>
              </button>
              <span className="text-sm text-muted-foreground">
                {formatSats(addressData.totalBalance)} sats
              </span>

              {addressData.pendingBalance !== 0 && (
                <span className="flex items-center gap-1 text-xs text-orange-500 dark:text-orange-400 pt-1">
                  <RefreshCw className="size-3 animate-spin" />
                  {formatSats(addressData.pendingBalance)} sats pending
                </span>
              )}
            </div>
          ) : null}

          {/* QR Code */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <QRCodeCanvas value={bitcoinAddress} size={200} level="M" />
          </div>

          {/* Address + copy */}
          <button
            onClick={copyAddress}
            className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-mono text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {truncatedAddress}
            {copiedAddress ? (
              <Check className="size-3.5 text-green-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>

          {/* Explorer link */}
          <a
            href={`https://blockstream.info/address/${bitcoinAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-3" />
            View on explorer
          </a>
        </div>
      )}
    </main>
  );
}
