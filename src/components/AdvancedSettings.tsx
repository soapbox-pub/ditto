import { useState } from 'react';
import { ChevronDown, ChevronUp, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { WalletSettings } from '@/components/WalletSettings';
import { RelayListManager } from '@/components/RelayListManager';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function AdvancedSettings() {
  const { user } = useCurrentUser();
  const [walletOpen, setWalletOpen] = useState(false);
  const [relaysOpen, setRelaysOpen] = useState(false);

  return (
    <div>
      {/* Intro */}
      <div className="flex items-center gap-4 px-3 pt-2 pb-4">
        <div className="w-40 shrink-0 flex items-center justify-center">
          <Wrench className="size-20 text-muted-foreground/20" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Advanced Settings</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Power user features including wallet connections and network relay management.
          </p>
        </div>
      </div>

      {/* Wallet Section */}
      <div className="border-b border-border">
        <Collapsible open={walletOpen} onOpenChange={setWalletOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between px-3 py-3 h-auto hover:bg-muted/20 rounded-none"
            >
              <span className="text-sm font-medium">Wallet</span>
              {walletOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4">
              {!user ? (
                <p className="text-center text-muted-foreground py-8 text-sm px-3">
                  Log in to manage your wallet connections.
                </p>
              ) : (
                <div className="px-3">
                  <WalletSettings />
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Network (Relays) Section */}
      <div className="border-b border-border">
        <Collapsible open={relaysOpen} onOpenChange={setRelaysOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between px-3 py-3 h-auto hover:bg-muted/20 rounded-none"
            >
              <span className="text-sm font-medium">Network</span>
              {relaysOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4">
              <RelayListManager />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
