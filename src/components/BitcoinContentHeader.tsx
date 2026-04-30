import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bitcoin,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Hash,
  Layers,
  RefreshCw,
  Weight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBitcoinTx } from '@/hooks/useBitcoinTx';
import { useBitcoinAddress } from '@/hooks/useBitcoinAddress';
import { satsToBTC, satsToUSD, formatSats, formatBTC } from '@/lib/bitcoin';
import type { TxDetail, TxInput, TxOutput } from '@/lib/bitcoin';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function truncateMiddle(str: string, startLen = 8, endLen = 8): string {
  if (str.length <= startLen + endLen + 3) return str;
  return `${str.slice(0, startLen)}...${str.slice(-endLen)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
      title="Copy"
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/** Format a unix timestamp as a readable date string. */
function formatBlockTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Format a large number with locale separators. */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Bitcoin Transaction Header
// ---------------------------------------------------------------------------

export function BitcoinTxHeader({ txid }: { txid: string }) {
  const { tx, btcPrice, isLoading, error } = useBitcoinTx(txid);

  if (isLoading) return <TxSkeleton />;

  if (error || !tx) {
    return (
      <div className="rounded-2xl border border-border p-6 text-center space-y-3">
        <Bitcoin className="size-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-destructive">Failed to load transaction</p>
        <p className="text-xs text-muted-foreground font-mono break-all">{txid}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center size-10 rounded-full ${
            tx.confirmed
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
          }`}>
            {tx.confirmed ? <Check className="size-5" /> : <Clock className="size-5" />}
          </div>
          <div>
            <h2 className="text-lg font-bold">
              {tx.confirmed ? 'Confirmed' : 'Unconfirmed'}
            </h2>
            {tx.blockTime && (
              <p className="text-sm text-muted-foreground">{formatBlockTime(tx.blockTime)}</p>
            )}
          </div>
        </div>

        {/* Transaction ID */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transaction ID</p>
          <div className="flex items-center gap-2">
            <p className="text-sm font-mono text-foreground break-all">{tx.txid}</p>
            <CopyButton text={tx.txid} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          {tx.confirmed && tx.blockHeight !== undefined && (
            <StatCard icon={<Layers className="size-3.5" />} label="Block" value={formatNumber(tx.blockHeight)} />
          )}
          <StatCard icon={<Weight className="size-3.5" />} label="Size" value={`${formatNumber(tx.weight / 4)} vB`} />
          <StatCard
            icon={<Bitcoin className="size-3.5" />}
            label="Fee"
            value={`${formatSats(tx.fee)} sat`}
            subtitle={`${(tx.fee / (tx.weight / 4)).toFixed(1)} sat/vB`}
          />
          <StatCard
            icon={<Hash className="size-3.5" />}
            label="Amount"
            value={`${formatBTC(tx.totalOutput)} BTC`}
            subtitle={btcPrice ? satsToUSD(tx.totalOutput, btcPrice) : undefined}
          />
        </div>
      </div>

      {/* Inputs → Outputs flow */}
      <div className="border-t border-border">
        <TxFlow tx={tx} btcPrice={btcPrice} />
      </div>

      {/* Footer: link to mempool.space */}
      <div className="border-t border-border px-5 py-2.5">
        <a
          href={`https://mempool.space/tx/${txid}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Bitcoin className="size-3.5" />
          <span>View on mempool.space</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subtitle }: { icon: React.ReactNode; label: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3.5 py-2.5 space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-sm font-semibold">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/** Inputs → Outputs visualization, mempool.space-style. */
function TxFlow({ tx, btcPrice }: { tx: TxDetail; btcPrice?: number }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
        <span>{tx.inputs.length} Input{tx.inputs.length !== 1 ? 's' : ''}</span>
        <ArrowRight className="size-3" />
        <span>{tx.outputs.length} Output{tx.outputs.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Inputs */}
        <div className="space-y-1.5">
          {tx.inputs.slice(0, 10).map((input, i) => (
            <TxInputRow key={`${input.txid}-${input.vout}-${i}`} input={input} btcPrice={btcPrice} />
          ))}
          {tx.inputs.length > 10 && (
            <p className="text-xs text-muted-foreground text-center py-1">
              +{tx.inputs.length - 10} more input{tx.inputs.length - 10 !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Outputs */}
        <div className="space-y-1.5">
          {tx.outputs.slice(0, 10).map((output, i) => (
            <TxOutputRow key={`${output.address ?? 'op_return'}-${i}`} output={output} btcPrice={btcPrice} />
          ))}
          {tx.outputs.length > 10 && (
            <p className="text-xs text-muted-foreground text-center py-1">
              +{tx.outputs.length - 10} more output{tx.outputs.length - 10 !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TxInputRow({ input, btcPrice }: { input: TxInput; btcPrice?: number }) {
  if (input.isCoinbase) {
    return (
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Coinbase</span>
          <span className="text-xs font-mono">{formatBTC(input.value)} BTC</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-2 space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        {input.address ? (
          <Link
            to={`/i/bitcoin:address:${input.address}`}
            className="text-xs font-mono text-red-600 dark:text-red-400 hover:underline truncate"
          >
            {truncateMiddle(input.address, 10, 6)}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">Unknown</span>
        )}
        <span className="text-xs font-mono shrink-0">{formatBTC(input.value)} BTC</span>
      </div>
      {btcPrice !== undefined && (
        <p className="text-[10px] text-muted-foreground text-right">{satsToUSD(input.value, btcPrice)}</p>
      )}
    </div>
  );
}

function TxOutputRow({ output, btcPrice }: { output: TxOutput; btcPrice?: number }) {
  const isOpReturn = output.scriptpubkeyType === 'op_return';

  if (isOpReturn) {
    return (
      <div className="rounded-lg bg-secondary/60 border border-border/50 px-3 py-2">
        <span className="text-xs text-muted-foreground">OP_RETURN</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-green-500/5 border border-green-500/10 px-3 py-2 space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        {output.address ? (
          <Link
            to={`/i/bitcoin:address:${output.address}`}
            className="text-xs font-mono text-green-600 dark:text-green-400 hover:underline truncate"
          >
            {truncateMiddle(output.address, 10, 6)}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">Unknown</span>
        )}
        <span className="text-xs font-mono shrink-0">{formatBTC(output.value)} BTC</span>
      </div>
      {btcPrice !== undefined && (
        <p className="text-[10px] text-muted-foreground text-right">{satsToUSD(output.value, btcPrice)}</p>
      )}
    </div>
  );
}

function TxSkeleton() {
  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
      <div className="border-t border-border p-4 space-y-3">
        <Skeleton className="h-3 w-32" />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bitcoin Address Header
// ---------------------------------------------------------------------------

export function BitcoinAddressHeader({ address }: { address: string }) {
  const { addressDetail, btcPrice, isLoading, error, refetch } = useBitcoinAddress(address);

  if (isLoading) return <AddressSkeleton />;

  if (error || !addressDetail) {
    return (
      <div className="rounded-2xl border border-border p-6 text-center space-y-3">
        <Bitcoin className="size-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-destructive">Failed to load address</p>
        <p className="text-xs text-muted-foreground font-mono break-all">{address}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="size-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-full bg-primary/10 text-primary">
            <Bitcoin className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Bitcoin Address</h2>
            <p className="text-xs text-muted-foreground">
              {addressDetail.txCount + addressDetail.pendingTxCount} transaction{(addressDetail.txCount + addressDetail.pendingTxCount) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Address</p>
          <div className="flex items-center gap-2">
            <p className="text-sm font-mono text-foreground break-all">{address}</p>
            <CopyButton text={address} />
          </div>
        </div>

        {/* Balance hero */}
        <div className="rounded-xl bg-secondary/40 p-4 text-center space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Balance</p>
          <p className="text-3xl font-bold tracking-tight">
            {btcPrice ? satsToUSD(addressDetail.totalBalance, btcPrice) : `${formatBTC(addressDetail.totalBalance)} BTC`}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatBTC(addressDetail.totalBalance)} BTC
          </p>
          {addressDetail.pendingBalance !== 0 && (
            <p className="flex items-center justify-center gap-1 text-xs text-orange-500 dark:text-orange-400 pt-1">
              <RefreshCw className="size-3 animate-spin" />
              {btcPrice
                ? `${satsToUSD(addressDetail.pendingBalance, btcPrice)} pending`
                : `${formatBTC(addressDetail.pendingBalance)} BTC pending`}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<ArrowDownLeft className="size-3.5" />}
            label="Total Received"
            value={`${formatBTC(addressDetail.totalReceived)} BTC`}
            subtitle={btcPrice ? satsToUSD(addressDetail.totalReceived, btcPrice) : undefined}
          />
          <StatCard
            icon={<ArrowUpRight className="size-3.5" />}
            label="Total Sent"
            value={`${formatBTC(addressDetail.totalSent)} BTC`}
            subtitle={btcPrice ? satsToUSD(addressDetail.totalSent, btcPrice) : undefined}
          />
        </div>
      </div>

      {/* Recent Transactions */}
      {addressDetail.recentTxs.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 py-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent Transactions
            </p>
          </div>
          <div className="divide-y divide-border">
            {addressDetail.recentTxs.slice(0, 10).map((tx) => (
              <AddressTxRow key={tx.txid} tx={tx} btcPrice={btcPrice} />
            ))}
          </div>
          {addressDetail.recentTxs.length > 10 && (
            <div className="px-5 py-3 text-center">
              <p className="text-xs text-muted-foreground">
                {addressDetail.txCount - 10} more transaction{addressDetail.txCount - 10 !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer: link to mempool.space */}
      <div className="border-t border-border px-5 py-2.5">
        <a
          href={`https://mempool.space/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Bitcoin className="size-3.5" />
          <span>View on mempool.space</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

function AddressTxRow({ tx, btcPrice }: { tx: { txid: string; amount: number; type: 'receive' | 'send'; confirmed: boolean; timestamp?: number }; btcPrice?: number }) {
  const isReceive = tx.type === 'receive';

  return (
    <Link
      to={`/i/bitcoin:tx:${tx.txid}`}
      className="flex items-center justify-between py-3 px-5 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center size-8 rounded-full ${
          isReceive
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-red-500/10 text-red-600 dark:text-red-400'
        }`}>
          {isReceive ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
        </div>
        <div>
          <p className="text-sm font-medium">{isReceive ? 'Received' : 'Sent'}</p>
          <p className="text-xs text-muted-foreground font-mono">{truncateMiddle(tx.txid, 8, 8)}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium ${
          isReceive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        }`}>
          {isReceive ? '+' : '-'}{formatBTC(tx.amount)} BTC
        </p>
        {btcPrice && (
          <p className="text-xs text-muted-foreground">
            {satsToUSD(tx.amount, btcPrice)}
          </p>
        )}
      </div>
    </Link>
  );
}

function AddressSkeleton() {
  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="rounded-xl bg-secondary/40 p-4 space-y-2 flex flex-col items-center">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact previews (used in NoteCard embeds, hover cards, etc.)
// ---------------------------------------------------------------------------

/** Compact preview for a Bitcoin transaction — fetches real data. */
export function BitcoinTxPreview({ txid, link }: { txid: string; link: string }) {
  const { tx, btcPrice, isLoading } = useBitcoinTx(txid);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  const amount = tx ? tx.totalOutput : 0;
  const fee = tx?.fee ?? 0;

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      <div className="size-12 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
        <Bitcoin className="size-5 text-orange-600 dark:text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bitcoin className="size-3 shrink-0" />
          <span>Bitcoin Transaction</span>
          {tx && (
            <span className={tx.confirmed
              ? 'text-green-600 dark:text-green-400'
              : 'text-yellow-600 dark:text-yellow-400'
            }>
              {tx.confirmed ? 'Confirmed' : 'Unconfirmed'}
            </span>
          )}
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {tx ? `${satsToBTC(amount)} BTC` : truncateMiddle(txid, 12, 8)}
          {tx && btcPrice ? (
            <span className="text-muted-foreground font-normal"> ({satsToUSD(amount, btcPrice)})</span>
          ) : null}
        </p>
        {tx && (
          <p className="text-xs text-muted-foreground truncate">
            Fee {formatSats(fee)} sats
            {tx.blockHeight ? ` · Block ${tx.blockHeight.toLocaleString()}` : ''}
          </p>
        )}
      </div>
      <ExternalLink className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

/** Compact preview for a Bitcoin address — fetches real data. */
export function BitcoinAddressPreview({ address, link }: { address: string; link: string }) {
  const { addressDetail, btcPrice, isLoading } = useBitcoinAddress(address);

  if (isLoading) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  const balance = addressDetail?.totalBalance ?? 0;
  const txCount = addressDetail ? addressDetail.txCount + addressDetail.pendingTxCount : 0;

  return (
    <Link
      to={link}
      className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-secondary/30 transition-colors"
    >
      <div className="size-12 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
        <Bitcoin className="size-5 text-orange-600 dark:text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bitcoin className="size-3 shrink-0" />
          <span>Bitcoin Address</span>
        </div>
        <p className="text-sm font-medium truncate mt-0.5">
          {addressDetail ? `${satsToBTC(balance)} BTC` : truncateMiddle(address, 12, 8)}
          {addressDetail && btcPrice ? (
            <span className="text-muted-foreground font-normal"> ({satsToUSD(balance, btcPrice)})</span>
          ) : null}
        </p>
        {addressDetail && (
          <p className="text-xs text-muted-foreground truncate">
            {txCount.toLocaleString()} transaction{txCount !== 1 ? 's' : ''}
            {' · '}
            <span className="font-mono">{truncateMiddle(address, 8, 6)}</span>
          </p>
        )}
      </div>
      <ExternalLink className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
