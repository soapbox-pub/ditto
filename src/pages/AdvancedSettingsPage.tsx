import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdvancedSettings } from '@/components/AdvancedSettings';
import { WalletSettings } from '@/components/WalletSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export function AdvancedSettingsPage() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const [walletOpen, setWalletOpen] = useState(false);

  useSeoMeta({
    title: `Advanced | Settings | ${config.appName}`,
    description: 'Advanced settings for wallet, system, and power user configuration',
  });

  return (
    <main className="">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Advanced</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Wallet connections, system configuration, and other advanced options for power users.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Wallet collapsible — only when logged in */}
        {user && (
          <Collapsible open={walletOpen} onOpenChange={setWalletOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="text-base font-semibold">Wallet</span>
                {walletOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-2 pb-4">
                <WalletSettings />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <AdvancedSettings />
      </div>
    </main>
  );
}
