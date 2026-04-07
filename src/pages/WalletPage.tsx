import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Bitcoin, Copy, Check, RefreshCw, Wallet, ArrowDownLeft, ArrowUpRight, Hash, ExternalLink } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
        <div className="p-4 space-y-4">
          {/* Balance Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Wallet className="size-4 text-primary" />
                  Balance
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <div className="grid grid-cols-3 gap-3">
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                </div>
              ) : error ? (
                <div className="text-center py-6">
                  <p className="text-sm text-destructive">Failed to fetch balance. Please try again.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                    <RefreshCw className="size-3.5 mr-1.5" />
                    Retry
                  </Button>
                </div>
              ) : addressData ? (
                <>
                  {/* Main balance display */}
                  <div className="rounded-lg border bg-card p-5 text-center space-y-1.5">
                    <div className="text-3xl font-bold tracking-tight">
                      {satsToBTC(addressData.totalBalance).replace(/\.?0+$/, '')} <span className="text-lg font-medium text-muted-foreground">BTC</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatSats(addressData.totalBalance)} sats
                    </div>

                    {addressData.pendingBalance !== 0 && (
                      <div className="pt-2 border-t mt-3 flex items-center justify-center gap-4 text-xs">
                        <span className="text-muted-foreground">
                          Confirmed: {satsToBTC(addressData.balance).replace(/\.?0+$/, '')} BTC
                        </span>
                        <span className="flex items-center gap-1 text-orange-500 dark:text-orange-400">
                          <RefreshCw className="size-3 animate-spin" />
                          Pending: {satsToBTC(addressData.pendingBalance).replace(/\.?0+$/, '')} BTC
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card p-3 text-center space-y-1">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <ArrowDownLeft className="size-3" />
                        Received
                      </div>
                      <div className="text-sm font-semibold truncate">{formatSats(addressData.totalReceived)}</div>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center space-y-1">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <ArrowUpRight className="size-3" />
                        Sent
                      </div>
                      <div className="text-sm font-semibold truncate">{formatSats(addressData.totalSent)}</div>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center space-y-1">
                      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Hash className="size-3" />
                        Txns
                      </div>
                      <div className="text-sm font-semibold">
                        {addressData.txCount}
                        {addressData.pendingTxCount > 0 && (
                          <span className="text-orange-500 dark:text-orange-400"> (+{addressData.pendingTxCount})</span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* Address Card with QR */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Bitcoin className="size-4 text-orange-500" />
                Your Bitcoin Address
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* QR Code */}
              <div className="flex justify-center">
                <div className="rounded-xl border bg-white p-3">
                  <QRCodeCanvas value={bitcoinAddress} size={200} level="M" />
                </div>
              </div>

              {/* Address text */}
              <div
                className="rounded-lg border bg-muted/50 p-3 cursor-pointer transition-colors hover:bg-muted"
                onClick={copyAddress}
              >
                <p className="font-mono text-sm break-all text-center leading-relaxed">
                  {bitcoinAddress}
                </p>
              </div>

              {/* Copy button */}
              <Button onClick={copyAddress} variant="outline" className="w-full">
                {copiedAddress ? (
                  <>
                    <Check className="size-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-4 mr-2" />
                    Copy Address
                  </>
                )}
              </Button>

              {/* View on explorer */}
              <Button
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                asChild
              >
                <a
                  href={`https://blockstream.info/address/${bitcoinAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-3.5 mr-1.5" />
                  View on Blockstream Explorer
                </a>
              </Button>

              {/* Warning */}
              <p className="text-xs text-muted-foreground text-center px-2">
                This is a Taproot (P2TR) address derived from your Nostr key. You need
                access to your Nostr private key to spend funds sent here.
              </p>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Same cryptography.</span>{' '}
                Both Nostr and Bitcoin Taproot use secp256k1 with Schnorr signatures (BIP-340).
                Your 32-byte Nostr x-only public key is byte-for-byte identical to a Taproot
                internal key.
              </p>
              <p>
                <span className="font-medium text-foreground">Direct derivation.</span>{' '}
                The <code className="text-xs bg-muted rounded px-1 py-0.5">bc1p</code> address
                above is generated by passing your Nostr pubkey to{' '}
                <code className="text-xs bg-muted rounded px-1 py-0.5">bitcoin.payments.p2tr()</code>{' '}
                as the internal key. No seed phrases or HD derivation paths involved.
              </p>
              <p className="text-xs border-t pt-3 text-orange-600 dark:text-orange-400">
                <span className="font-semibold">Caution:</span> This is an experimental feature.
                Always test with small amounts first and ensure you have secure backups of your
                Nostr private key.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
