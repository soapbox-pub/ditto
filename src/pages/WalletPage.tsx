import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { Bitcoin, Check, Wallet, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { LoginArea } from '@/components/auth/LoginArea';
import { BitcoinWalletPanel } from '@/components/BitcoinWalletPanel';
import { MoneroWalletPanel, MoneroGlyph } from '@/components/MoneroWalletPanel';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useWalletCurrency, type WalletCurrency } from '@/hooks/useWalletCurrency';

/**
 * Shape of `location.state` consumed by this page when arriving via a
 * `bitcoin:` deep link. The `DeepLinkHandler` navigates to `/wallet` with
 * `state: { bip21Uri }` so we can auto-open the Send dialog with the URI
 * prefilled. Kept here (rather than exported) because no other route
 * produces this state.
 */
interface WalletLocationState {
  bip21Uri?: string;
  /** A `monero:` URI, which also switches the page to the Monero tab. */
  moneroUri?: string;
}

/** Display metadata for the currency switcher. */
const CURRENCY_LABELS: Record<WalletCurrency, string> = {
  bitcoin: 'Bitcoin',
  monero: 'Monero',
};

export function WalletPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { currency, setCurrency } = useWalletCurrency();

  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as WalletLocationState | null;

  // Snapshot of the URI we opened with. We snapshot once (rather than reading
  // `locationState?.bip21Uri` on every render) so clearing `location.state`
  // after consumption doesn't blank out the panel's `initialSendUri` prop
  // while the dialog is still open.
  const [pendingUri, setPendingUri] = useState<string | undefined>(undefined);
  const [pendingMoneroUri, setPendingMoneroUri] = useState<string | undefined>(undefined);
  const consumedDeepLinkRef = useRef(false);

  // Auto-open the Send dialog when the user arrived via a `bitcoin:` or
  // `monero:` deep link. Only fires once per navigation; we then clear
  // `location.state` so a back-then-forward navigation, or a refresh, doesn't
  // relaunch the dialog. Logged-out users get the login prompt instead — no
  // point opening a Send dialog they can't use.
  useEffect(() => {
    if (consumedDeepLinkRef.current) return;
    const bitcoinUri = locationState?.bip21Uri;
    const moneroUri = locationState?.moneroUri;
    if (!bitcoinUri && !moneroUri) return;
    consumedDeepLinkRef.current = true;

    if (user) {
      if (moneroUri) {
        // Switch tabs first so the Monero panel is mounted (and its wallet
        // hook connected) by the time the Send dialog renders.
        setCurrency('monero');
        setPendingMoneroUri(moneroUri);
      } else if (bitcoinUri) {
        setCurrency('bitcoin');
        setPendingUri(bitcoinUri);
      }
    }
    // Strip the URI from history state so it doesn't replay on back-forward.
    navigate(location.pathname, { replace: true, state: null });
  }, [locationState, user, navigate, location.pathname, setCurrency]);

  useSeoMeta({
    title: `Wallet | ${config.appName}`,
    description:
      'Your Bitcoin Taproot wallet derived from your Nostr identity, and your encrypted Monero wallet.',
  });

  return (
    <main>
      <PageHeader title="Wallet" icon={<Wallet className="size-5" />} />

      {!user ? (
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <Bitcoin className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h2 className="text-xl font-bold">Your Wallet</h2>
            <p className="text-muted-foreground text-sm">
              Log in to see your Bitcoin Taproot address derived from your Nostr identity, and to
              set up a Monero wallet.
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      ) : (
        <>
          {/* Currency switcher. The choice is remembered per account. */}
          <div className="flex justify-center pt-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full gap-1.5">
                  {currency === 'bitcoin' ? (
                    <Bitcoin className="size-4 text-orange-500" />
                  ) : (
                    <MoneroGlyph className="size-4 text-orange-500" />
                  )}
                  {CURRENCY_LABELS[currency]}
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuItem onSelect={() => setCurrency('bitcoin')} className="gap-2">
                  <Bitcoin className="size-4 text-orange-500" />
                  Bitcoin
                  {currency === 'bitcoin' && <Check className="size-3.5 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setCurrency('monero')} className="gap-2">
                  <MoneroGlyph className="size-4 text-orange-500" />
                  Monero
                  {currency === 'monero' && <Check className="size-3.5 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/*
            Only the selected panel is mounted. That's what keeps the 3 MB
            Monero wasm chunk from loading for users who never switch to it.
          */}
          {currency === 'monero' ? (
            <MoneroWalletPanel initialSendUri={pendingMoneroUri} />
          ) : (
            <BitcoinWalletPanel initialSendUri={pendingUri} />
          )}
        </>
      )}
    </main>
  );
}
