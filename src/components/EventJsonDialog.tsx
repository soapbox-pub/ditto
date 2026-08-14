import { useState } from 'react';
import { Check, Copy, Radio } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { encodeEventAddress } from '@/lib/encodeEvent';
import { toast } from '@/hooks/useToast';

interface EventJsonDialogProps {
  event: NostrEvent;
  /** Precomputed NIP-19 identifier. Falls back to `encodeEventAddress(event)`. */
  nip19Id?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Small copy-to-clipboard icon button with a transient checkmark. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: `${label} copied to clipboard` });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

/**
 * Dialog showing an event's NIP-19 identifier and raw JSON, with copy buttons
 * and a "Broadcast Event" action. Shared by the note overflow menu and the
 * unknown-kind fallback card so users can always inspect and export an event
 * even when Ditto can't render it.
 */
export function EventJsonDialog({ event, nip19Id, open, onOpenChange }: EventJsonDialogProps) {
  const { nostr } = useNostr();
  const [broadcasting, setBroadcasting] = useState(false);

  const id = nip19Id ?? encodeEventAddress(event);
  const jsonText = JSON.stringify(event, null, 2);

  const handleBroadcast = async () => {
    setBroadcasting(true);
    try {
      await nostr.event(event, { signal: AbortSignal.timeout(5000) });
      toast({ title: 'Event broadcast to relays' });
    } catch {
      toast({ title: 'Failed to broadcast event', variant: 'destructive' });
    } finally {
      setBroadcasting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85dvh] flex flex-col gap-0 p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-base font-semibold">Event Details</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3 shrink-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">Event ID</p>
          <div className="relative flex items-center bg-muted rounded-lg px-3 py-2">
            <p className="font-mono text-xs break-all text-foreground/80 flex-1 pr-2 select-all">
              {id}
            </p>
            <CopyButton text={id} label="Event ID" />
          </div>
        </div>

        <div className="px-5 pb-5 flex flex-col flex-1 min-h-0">
          <p className="text-xs font-medium text-muted-foreground mb-1">Raw JSON</p>
          <div className="relative flex-1 min-h-0 overflow-auto rounded-lg bg-muted border border-border">
            <div className="sticky top-2 right-2 float-right mr-2">
              <CopyButton text={jsonText} label="Event JSON" />
            </div>
            <pre className="p-4 text-xs font-mono text-foreground/80 whitespace-pre leading-relaxed">
              {jsonText}
            </pre>
          </div>
        </div>

        <div className="px-5 pb-5 shrink-0">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleBroadcast}
            disabled={broadcasting}
          >
            <Radio className="size-4" />
            {broadcasting ? 'Broadcasting...' : 'Broadcast Event'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
