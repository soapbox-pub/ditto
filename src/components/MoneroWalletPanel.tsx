import { useEffect, useRef, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { MoneroSetupDialog } from '@/components/MoneroSetupDialog';
import { SendMoneroDialog } from '@/components/SendMoneroDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMoneroWallet } from '@/hooks/useMoneroWallet';
import { atomicToUSD, buildMoneroUri, formatXMR, truncateAddress } from '@/lib/monero/units';
import type { MoneroTxSummary } from '@/lib/monero/record';

interface MoneroWalletPanelProps {
  /**
   * A `monero:` URI to open the Send dialog with, set when the user arrived
   * via a deep link or a scanned QR code.
   */
  initialSendUri?: string;
}

/**
 * The Monero half of the wallet page.
 *
 * Rendered only when the Monero tab is selected, so the 3 MB wasm chunk is
 * never fetched for a user who only uses Bitcoin. `connect()` is what pulls it
 * in, and it's called from an effect once a wallet record exists.
 */
export function MoneroWalletPanel({ initialSendUri }: MoneroWalletPanelProps = {}) {
  const {
    hasWallet,
    isLoadingRecord,
    canEncrypt,
    address,
    balance,
    unlockedBalance,
    state,
    isStale,
    transactions,
    blocksBehind,
    xmrPrice,
    phase,
    progress,
    error,
    connect,
    refresh,
  } = useMoneroWallet();

  const { user } = useCurrentUser();
  const pubkey = user?.pubkey ?? '';

  const [setupOpen, setSetupOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txOpen, setTxOpen] = useState(false);

  // Open the Send dialog when a `monero:` deep link brought us here. Guarded
  // by a ref so dismissing the dialog doesn't immediately reopen it.
  const consumedSendUri = useRef(false);

  // Auto-connect once, when a wallet record exists. The ref keeps a re-render
  // (or a failed connect that flips `phase` to 'error') from retrying in a
  // loop against an unreachable node.
  const connectAttempted = useRef(false);

  // Both refs latch for the lifetime of the component, and Ditto doesn't
  // remount on an account switch — so without this, switching to an account
  // whose session was just torn down would leave the panel permanently
  // disconnected, waiting on a connect that already "happened" for someone
  // else. This effect is declared *first* so it re-arms the refs before the
  // two effects below read them, and only fires on a real change: on mount
  // there is nothing to reset and re-arming would connect twice.
  const panelPubkey = useRef(pubkey);
  useEffect(() => {
    if (panelPubkey.current === pubkey) return;
    panelPubkey.current = pubkey;

    connectAttempted.current = false;
    consumedSendUri.current = false;
    setCopied(false);
    setTxOpen(false);
    setSendOpen(false);
    setSetupOpen(false);
  }, [pubkey]);

  useEffect(() => {
    if (!initialSendUri || consumedSendUri.current || !hasWallet) return;
    consumedSendUri.current = true;
    setSendOpen(true);
  }, [initialSendUri, hasWallet]);

  useEffect(() => {
    if (!hasWallet || connectAttempted.current) return;
    connectAttempted.current = true;
    void connect();
  }, [hasWallet, connect]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the address is selectable in the QR caption.
    }
  };

  if (isLoadingRecord) {
    return (
      <div className="flex flex-col items-center space-y-3 pt-8">
        <Skeleton className="h-10 w-40 rounded-lg" />
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-[200px] w-[200px] rounded-2xl" />
      </div>
    );
  }

  // No wallet yet — the setup call to action.
  if (!hasWallet) {
    return (
      <>
        <div className="py-12 px-4 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-orange-500/10">
            <MoneroGlyph className="size-8 text-orange-500" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h2 className="text-xl font-bold">
              <FormattedMessage id="monero.panel.empty.title" defaultMessage="Set up Monero" />
            </h2>
            <p className="text-muted-foreground text-sm">
              <FormattedMessage
                id="monero.panel.empty.description"
                defaultMessage="Create a wallet or restore one from a seed. It's encrypted to your account and follows you across devices."
              />
            </p>
          </div>

          {canEncrypt ? (
            <Button onClick={() => setSetupOpen(true)} className="rounded-full">
              <FormattedMessage id="monero.panel.empty.action" defaultMessage="Get started" />
            </Button>
          ) : (
            <p className="text-sm text-destructive max-w-xs">
              <FormattedMessage
                id="monero.panel.empty.noNip44"
                defaultMessage="Your signer doesn't support NIP-44 encryption, which is required to store a Monero wallet."
              />
            </p>
          )}
        </div>

        <MoneroSetupDialog
          isOpen={setupOpen}
          onClose={() => setSetupOpen(false)}
          onComplete={() => {
            connectAttempted.current = false;
          }}
        />
      </>
    );
  }

  const syncing = phase === 'syncing' || phase === 'opening' || phase === 'loading';
  const locked = balance - unlockedBalance;

  return (
    <div className="flex flex-col items-center px-4 pt-8 pb-4 space-y-6 max-w-sm mx-auto">
      {/* Balance */}
      <div className="flex flex-col items-center space-y-1">
        <span className="text-4xl font-bold tracking-tight">
          {xmrPrice ? atomicToUSD(balance, xmrPrice) : `${formatXMR(balance)} XMR`}
        </span>
        <span className="text-sm text-muted-foreground">{formatXMR(balance)} XMR</span>

        {locked > 0n && (
          <span className="text-xs text-muted-foreground pt-1">
            <FormattedMessage
              id="monero.panel.locked"
              defaultMessage="{amount} XMR locked"
              values={{ amount: formatXMR(locked) }}
            />
          </span>
        )}

        {isStale && !syncing && (
          <span className="text-xs text-muted-foreground pt-1">
            <FormattedMessage
              id="monero.panel.cached"
              defaultMessage="Cached balance — syncing for the latest"
            />
          </span>
        )}
      </div>

      {/* Sync status */}
      {syncing && (
        <div className="w-full space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {phase === 'loading' ? (
              <FormattedMessage
                id="monero.panel.loading"
                defaultMessage="Loading the Monero engine…"
              />
            ) : phase === 'opening' ? (
              <FormattedMessage id="monero.panel.opening" defaultMessage="Opening your wallet…" />
            ) : progress ? (
              <FormattedMessage
                id="monero.panel.scanning"
                defaultMessage="Scanning block {height} of {end}"
                values={{
                  height: progress.height.toLocaleString(),
                  end: progress.endHeight.toLocaleString(),
                }}
              />
            ) : (
              <FormattedMessage id="monero.panel.syncing" defaultMessage="Syncing…" />
            )}
          </div>

          {progress && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-orange-500 transition-[width] duration-300"
                style={{ width: `${Math.round(progress.percent * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {!syncing && blocksBehind > 1000 && (
        <p className="text-xs text-muted-foreground">
          <FormattedMessage
            id="monero.panel.behind"
            defaultMessage="{blocks} blocks behind"
            values={{ blocks: blocksBehind.toLocaleString() }}
          />
        </p>
      )}

      {error && (
        <div className="flex w-full gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <div className="space-y-2 min-w-0">
            <p className="text-sm text-destructive break-words">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              <RefreshCw className="size-3.5 mr-1.5" />
              <FormattedMessage id="monero.panel.retry" defaultMessage="Retry" />
            </Button>
          </div>
        </div>
      )}

      {/*
        Send is hidden entirely while scanning rather than shown disabled: it
        has no output set to spend from mid-sync, and a greyed-out button beside
        a spinning one reads as a broken control rather than a temporary one.
        The progress line above already says what's happening.
      */}
      {!syncing && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSendOpen(true)}
            disabled={unlockedBalance === 0n}
            className="rounded-full"
          >
            <Send className="size-3.5 mr-1.5" />
            <FormattedMessage id="monero.panel.send" defaultMessage="Send" />
          </Button>
        </div>
      )}

      <SendMoneroDialog
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        initialUri={initialSendUri}
      />

      {/* QR + address */}
      {address && (
        <>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <QRCodeCanvas value={buildMoneroUri(address)} size={200} level="M" />
          </div>

          <button
            onClick={copyAddress}
            title={address}
            className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-mono text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer max-w-full"
          >
            <span className="truncate">{truncateAddress(address)}</span>
            {copied ? (
              <Check className="size-3.5 shrink-0 text-green-500" />
            ) : (
              <Copy className="size-3.5 shrink-0" />
            )}
          </button>
        </>
      )}

      {/* Transactions */}
      {transactions.length > 0 && (
        <>
          <button
            onClick={() => setTxOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <FormattedMessage id="monero.panel.transactions" defaultMessage="Transactions" />
            <ChevronDown
              className={`size-3 transition-transform duration-200 ${txOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <div
            className="w-full grid transition-[grid-template-rows] duration-300 ease-in-out"
            style={{ gridTemplateRows: txOpen ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="w-full divide-y">
                {transactions.map((tx) => (
                  <MoneroTxRow key={tx.hash} tx={tx} xmrPrice={xmrPrice} />
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {state && !syncing && transactions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          <FormattedMessage
            id="monero.panel.noTransactions"
            defaultMessage="No transactions yet."
          />
        </p>
      )}
    </div>
  );
}

/** Single transaction row. */
function MoneroTxRow({ tx, xmrPrice }: { tx: MoneroTxSummary; xmrPrice?: number }) {
  const amount = BigInt(tx.amount);
  const isReceive = !tx.outgoing;

  return (
    <div className="flex items-center justify-between py-3 px-2">
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center justify-center size-8 rounded-full ${
            isReceive
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400'
          }`}
        >
          {isReceive ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </div>
        <div>
          <p className="text-sm font-medium">
            {isReceive ? (
              <FormattedMessage id="monero.panel.received" defaultMessage="Received" />
            ) : (
              <FormattedMessage id="monero.panel.sent" defaultMessage="Sent" />
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {!tx.confirmed ? (
              <FormattedMessage id="monero.panel.pending" defaultMessage="Pending" />
            ) : (
              formatTxDate(tx.timestamp)
            )}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={`text-sm font-medium ${
            isReceive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {isReceive ? '+' : '-'}
          {xmrPrice ? atomicToUSD(amount, xmrPrice) : `${formatXMR(amount)} XMR`}
        </p>
        <p className="text-xs text-muted-foreground">{formatXMR(amount)} XMR</p>
      </div>
    </div>
  );
}

/** Format a unix timestamp as a relative or absolute date. */
function formatTxDate(timestamp?: number): string {
  if (!timestamp) return '';

  const date = new Date(timestamp * 1000);
  const diffDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The Monero glyph, as an inline SVG so it inherits `currentColor`. */
export function MoneroGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 1.33.22 2.61.62 3.81h3.59V6.43L12 14.21l7.79-7.78v9.38h3.59c.4-1.2.62-2.48.62-3.81 0-6.63-5.37-12-12-12z" />
      <path d="M10.08 16.13L6.19 12.24v5.57H1.62A12.01 12.01 0 0012 24c4.51 0 8.44-2.49 10.49-6.17h-4.68v-5.57l-3.89 3.87-1.92 1.93-1.92-1.93z" />
    </svg>
  );
}
