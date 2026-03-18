import { useState } from 'react';
import { AlertTriangle, Globe, Radio, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useRequestToVanish } from '@/hooks/useRequestToVanish';
import { useAppContext } from '@/hooks/useAppContext';
import { useLoginActions } from '@/hooks/useLoginActions';
import { toast } from '@/hooks/useToast';

interface RequestToVanishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type VanishMode = 'global' | 'targeted';

const CONFIRMATION_PHRASE = 'VANISH';

export function RequestToVanishDialog({ open, onOpenChange }: RequestToVanishDialogProps) {
  const { config } = useAppContext();
  const { mutateAsync: requestVanish, isPending } = useRequestToVanish();
  const { logout } = useLoginActions();

  const [mode, setMode] = useState<VanishMode>('global');
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  const userRelays = config.relayMetadata.relays.map((r) => r.url);
  const isConfirmed = confirmText === CONFIRMATION_PHRASE && acknowledged;

  const handleSubmit = async () => {
    if (!isConfirmed) return;

    try {
      const relayUrls = mode === 'global' ? ['ALL_RELAYS'] : userRelays;

      await requestVanish({
        relayUrls,
        content: reason.trim(),
      });

      toast({
        title: 'Request to vanish sent',
        description: mode === 'global'
          ? 'Your request has been broadcast. Compliant relays will delete your data.'
          : `Your request was sent to ${userRelays.length} relay(s).`,
      });

      // Reset state and close.
      resetState();
      onOpenChange(false);

      // Log the user out since their identity is being erased.
      await logout();
    } catch {
      toast({
        title: 'Failed to send request',
        description: 'Some relays may not have received the request. You can try again.',
        variant: 'destructive',
      });
    }
  };

  const resetState = () => {
    setMode('global');
    setReason('');
    setConfirmText('');
    setAcknowledged(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md max-h-[85dvh] rounded-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 shrink-0">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <div>
            <DialogTitle>Request to Vanish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              NIP-62: Permanently erase your data from relays.
            </DialogDescription>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 space-y-5 mt-2">
          {/* Warning banner */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive space-y-1">
            <p className="font-medium">This action is irreversible.</p>
            <p className="text-xs leading-relaxed opacity-90">
              Compliant relays will permanently delete all your events, including your profile,
              posts, reactions, and direct messages. Your data cannot be recovered after deletion.
              Deletion events (kind 5) published against this request have no effect.
            </p>
          </div>

          {/* Scope selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Scope</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as VanishMode)}
              className="space-y-1"
            >
              <label className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-secondary/60">
                <RadioGroupItem value="global" className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Globe className="size-3.5" />
                    All relays
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Request every relay to delete your data. Broadcast to as many relays as possible.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-secondary/60">
                <RadioGroupItem value="targeted" className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Radio className="size-3.5" />
                    My relays only ({userRelays.length})
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Request only your configured relays to delete your data.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Targeted relay list preview */}
          {mode === 'targeted' && userRelays.length > 0 && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Target relays:</p>
              <ul className="space-y-0.5">
                {userRelays.map((url) => (
                  <li key={url} className="text-xs font-mono text-muted-foreground truncate">
                    {url}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reason / legal notice */}
          <div className="space-y-2">
            <Label htmlFor="vanish-reason" className="text-sm font-medium">
              Reason or legal notice <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="vanish-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optionally include a reason or legal notice for the relay operator..."
              className="resize-none"
              rows={2}
            />
          </div>

          {/* Acknowledgment */}
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
              className="mt-0.5 shrink-0"
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              I understand that this will request permanent deletion of all my data from
              {mode === 'global' ? ' all compliant relays' : ` ${userRelays.length} relay(s)`}.
              This action cannot be undone, and I will be logged out immediately.
            </span>
          </label>

          {/* Confirmation input */}
          <div className="space-y-2">
            <Label htmlFor="vanish-confirm" className="text-sm font-medium">
              Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-destructive">{CONFIRMATION_PHRASE}</span> to confirm
            </Label>
            <Input
              id="vanish-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRMATION_PHRASE}
              className="font-mono text-base md:text-sm"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2 shrink-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isConfirmed || isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Sending...
              </>
            ) : (
              'Request to Vanish'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
