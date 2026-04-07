import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { Bitcoin, Copy, Check, RefreshCw, Wallet, ChevronDown, ArrowDownLeft, ArrowUpRight, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { LoginArea } from '@/components/auth/LoginArea';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { SendBitcoinDialog } from '@/components/SendBitcoinDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { satsToBTC, satsToUSD } from '@/lib/bitcoin';
import type { Transaction } from '@/lib/bitcoin';

export function WalletPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { bitcoinAddress, addressData, btcPrice, transactions, isLoading, error, refetch } = useBitcoinWallet();

  const [copiedAddress, setCopiedAddress] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

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
              <span className="text-4xl font-bold tracking-tight">
                {btcPrice
                  ? satsToUSD(addressData.totalBalance, btcPrice)
                  : '---'}
              </span>
              <span className="text-sm text-muted-foreground">
                {satsToBTC(addressData.totalBalance).replace(/\.?0+$/, '')} BTC
              </span>

              {addressData.pendingBalance !== 0 && (
                <span className="flex items-center gap-1 text-xs text-orange-500 dark:text-orange-400 pt-1">
                  <RefreshCw className="size-3 animate-spin" />
                  {btcPrice
                    ? `${satsToUSD(addressData.pendingBalance, btcPrice)} pending`
                    : 'pending'}
                </span>
              )}
            </div>
          ) : null}

          {/* Send button */}
          {addressData && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSendOpen(true)}
              className="rounded-full"
            >
              <Send className="size-3.5 mr-1.5" />
              Send
            </Button>
          )}

          <SendBitcoinDialog
            isOpen={sendOpen}
            onClose={() => setSendOpen(false)}
            btcPrice={btcPrice}
          />

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

          {/* Transactions */}
          {transactions && transactions.length > 0 && (
            <>
              <button
                onClick={() => setTxOpen((o) => !o)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Transactions
                <ChevronDown className={`size-3 transition-transform duration-200 ${txOpen ? 'rotate-180' : ''}`} />
              </button>

              <TxAccordion open={txOpen}>
                <div className="w-full divide-y">
                  {transactions.map((tx) => (
                    <TxRow key={tx.txid} tx={tx} btcPrice={btcPrice} />
                  ))}
                </div>
              </TxAccordion>
            </>
          )}
        </div>
      )}
    </main>
  );
}

/** Accordion wrapper using grid-template-rows for smooth height animation. */
function TxAccordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="w-full grid transition-[grid-template-rows] duration-300 ease-in-out"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
    >
      <div ref={contentRef} className="overflow-hidden">
        {children}
      </div>
    </div>
  );
}

/** Format a unix timestamp as a relative or absolute date. */
function formatTxDate(timestamp?: number): string {
  if (!timestamp) return 'Pending';

  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Single transaction row. */
function TxRow({ tx, btcPrice }: { tx: Transaction; btcPrice?: number }) {
  const isReceive = tx.type === 'receive';

  return (
    <Link
      to={`/i/bitcoin:tx:${tx.txid}`}
      className="flex items-center justify-between py-3 px-1 hover:bg-muted/50 transition-colors rounded-lg -mx-1 px-2"
    >
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${
          isReceive
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {isReceive
            ? <ArrowDownLeft className="size-4" />
            : <ArrowUpRight className="size-4" />}
        </div>
        <div>
          <p className="text-sm font-medium">{isReceive ? 'Received' : 'Sent'}</p>
          <p className="text-xs text-muted-foreground">{formatTxDate(tx.timestamp)}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium ${
          isReceive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {isReceive ? '+' : '-'}
          {btcPrice
            ? satsToUSD(tx.amount, btcPrice)
            : `${satsToBTC(tx.amount).replace(/\.?0+$/, '')} BTC`}
        </p>
        <p className="text-xs text-muted-foreground">
          {satsToBTC(tx.amount).replace(/\.?0+$/, '')} BTC
        </p>
      </div>
    </Link>
  );
}
