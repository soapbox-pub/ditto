import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RelayListManager } from '@/components/RelayListManager';
import { BlossomSettings } from '@/components/BlossomSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';

export function NetworkSettingsPage() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const [relaysOpen, setRelaysOpen] = useState(true);
  const [blossomOpen, setBlossomOpen] = useState(false);

  useSeoMeta({
    title: `Network | Settings | ${config.appName}`,
    description: 'Manage relays and file upload servers',
  });

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <main className="">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Network</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Relays are servers that store and distribute content across the Nostr network. Blossom servers handle file uploads.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Relays */}
        <Collapsible open={relaysOpen} onOpenChange={setRelaysOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">Relays</span>
              {relaysOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-2 pb-4">
              <RelayListManager />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Blossom Servers */}
        <Collapsible open={blossomOpen} onOpenChange={setBlossomOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">Blossom Servers</span>
              {blossomOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-2 pb-4">
              <BlossomSettings />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </main>
  );
}
