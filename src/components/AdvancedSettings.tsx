import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WalletSettings } from '@/components/WalletSettings';
import { RelayListManager } from '@/components/RelayListManager';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';

export function AdvancedSettings() {
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const [walletOpen, setWalletOpen] = useState(false);
  const [relaysOpen, setRelaysOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsPubkey, setStatsPubkey] = useState(config.nip85StatsPubkey);

  const handleStatsPubkeyChange = (value: string) => {
    setStatsPubkey(value);
    
    // Validate hex format (64 characters)
    if (value.length === 64 && /^[0-9a-f]{64}$/i.test(value)) {
      updateConfig(() => ({ nip85StatsPubkey: value.toLowerCase() }));
      toast({
        title: 'Stats source updated',
        description: 'NIP-85 stats pubkey has been saved.',
      });
    } else if (value.length === 0) {
      // Allow clearing the field
      updateConfig(() => ({ nip85StatsPubkey: '' }));
    }
  };

  return (
    <div>
      {/* Intro */}
      <div className="px-3 pt-2 pb-4">
        <h2 className="text-sm font-semibold">Advanced Settings</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Power user features including wallet connections and network relay management.
        </p>
      </div>

      {/* Wallet Section */}
      <div>
        <Collapsible open={walletOpen} onOpenChange={setWalletOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 rounded-none border-b-[4px] border-primary"
            >
              <span className="text-base font-semibold">Wallet</span>
              {walletOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4 pt-4">
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
      <div>
        <Collapsible open={relaysOpen} onOpenChange={setRelaysOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 rounded-none border-b-[4px] border-primary"
            >
              <span className="text-base font-semibold">Network</span>
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

      {/* Stats Source Section */}
      <div>
        <Collapsible open={statsOpen} onOpenChange={setStatsOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 rounded-none border-b-[4px] border-primary"
            >
              <span className="text-base font-semibold">Stats Source</span>
              {statsOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4 pt-4 px-3 space-y-3">
              <div>
                <Label htmlFor="stats-pubkey" className="text-sm font-medium">
                  NIP-85 Stats Pubkey
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Enter a trusted pubkey for pre-computed engagement stats (likes, reposts, comments). 
                  Leave empty to always calculate stats manually.
                </p>
                <Input
                  id="stats-pubkey"
                  value={statsPubkey}
                  onChange={(e) => handleStatsPubkeyChange(e.target.value)}
                  placeholder="Enter 64-character hex pubkey"
                  className="font-mono text-sm"
                  maxLength={64}
                />
                {statsPubkey && statsPubkey.length !== 64 && (
                  <p className="text-xs text-destructive mt-1">
                    Pubkey must be exactly 64 hexadecimal characters
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Default pubkey:</p>
                <p className="font-mono break-all">
                  5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
