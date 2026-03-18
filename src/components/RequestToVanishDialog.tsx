import { useState, useCallback, useEffect } from 'react';
import { Globe, Radio, Loader2, X, ArrowRight, ArrowLeft, Flame } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useRequestToVanish } from '@/hooks/useRequestToVanish';
import { useAppContext } from '@/hooks/useAppContext';
import { useLoginActions } from '@/hooks/useLoginActions';
import { toast } from '@/hooks/useToast';

interface RequestToVanishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type VanishMode = 'global' | 'targeted';
type Step = 0 | 1 | 2;

const STEPS = ['Scope', 'Details', 'Confirm'] as const;
const CONFIRMATION_PHRASE = 'VANISH';

export function RequestToVanishDialog({ open, onOpenChange }: RequestToVanishDialogProps) {
  const { config } = useAppContext();
  const { mutateAsync: requestVanish, isPending } = useRequestToVanish();
  const { logout } = useLoginActions();

  const [step, setStep] = useState<Step>(0);
  const [mode, setMode] = useState<VanishMode>('global');
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const userRelays = config.relayMetadata.relays.map((r) => r.url);
  const isConfirmed = confirmText === CONFIRMATION_PHRASE;

  const resetState = useCallback(() => {
    setStep(0);
    setMode('global');
    setReason('');
    setConfirmText('');
  }, []);

  // Reset when dialog closes.
  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const handleSubmit = async () => {
    if (!isConfirmed) return;

    try {
      const relayUrls = mode === 'global' ? ['ALL_RELAYS'] : userRelays;

      await requestVanish({ relayUrls, content: reason.trim() });

      toast({
        title: 'Request to vanish sent',
        description: mode === 'global'
          ? 'Your request has been broadcast. Compliant relays will delete your data.'
          : `Your request was sent to ${userRelays.length} relay(s).`,
      });

      onOpenChange(false);
      await logout();
    } catch {
      toast({
        title: 'Failed to send request',
        description: 'Some relays may not have received the request. You can try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] rounded-2xl p-0 gap-0 border-border overflow-hidden max-h-[90dvh] [&>button]:hidden">
        {/* ── Header ── */}
        <div className="relative overflow-hidden">
          {/* Gradient backdrop */}
          <div className="absolute inset-0 bg-gradient-to-b from-destructive/10 via-destructive/5 to-transparent" />

          <div className="relative px-5 pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/15 ring-1 ring-destructive/20 shrink-0">
                  <Flame className="size-5 text-destructive" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold">Request to Vanish</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Permanently erase your data from relays
                  </DialogDescription>
                </div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 -mr-1 -mt-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1.5 mt-4">
              {STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-1.5 flex-1">
                  <div className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full h-1 rounded-full overflow-hidden bg-muted/60">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500 ease-out',
                          i <= step ? 'bg-destructive w-full' : 'w-0',
                        )}
                      />
                    </div>
                    <span className={cn(
                      'text-[10px] font-medium transition-colors',
                      i <= step ? 'text-destructive' : 'text-muted-foreground/50',
                    )}>
                      {label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Step Content ── */}
        <div className="overflow-y-auto min-h-0 flex-1">
          {step === 0 && <StepScope mode={mode} setMode={setMode} userRelays={userRelays} />}
          {step === 1 && <StepDetails reason={reason} setReason={setReason} mode={mode} userRelays={userRelays} />}
          {step === 2 && (
            <StepConfirm
              confirmText={confirmText}
              setConfirmText={setConfirmText}
              mode={mode}
              relayCount={userRelays.length}
            />
          )}
        </div>

        <Separator />

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-5 py-3.5">
          {step > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={isPending}
              className="gap-1.5 text-muted-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="text-muted-foreground"
            >
              Cancel
            </Button>
          )}

          {step < 2 ? (
            <Button
              size="sm"
              onClick={() => setStep((s) => (s + 1) as Step)}
              className="gap-1.5"
            >
              Continue
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!isConfirmed || isPending}
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Flame className="size-3.5" />
                  Vanish
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Step 0: Scope ───────────────────────── */

function StepScope({
  mode,
  setMode,
  userRelays,
}: {
  mode: VanishMode;
  setMode: (m: VanishMode) => void;
  userRelays: string[];
}) {
  return (
    <div className="px-5 py-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Choose scope</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Select which relays should delete your data. This determines the reach of your vanish request.
        </p>
      </div>

      <div className="space-y-2">
        <ScopeCard
          selected={mode === 'global'}
          onClick={() => setMode('global')}
          icon={<Globe className="size-5" />}
          title="All relays"
          description="Request every relay on the network to delete your data. The event is broadcast as widely as possible."
          badge="Recommended"
        />
        <ScopeCard
          selected={mode === 'targeted'}
          onClick={() => setMode('targeted')}
          icon={<Radio className="size-5" />}
          title={`My relays only (${userRelays.length})`}
          description="Request only your currently configured relays to delete your data."
        />
      </div>

      {/* Relay list preview for targeted mode */}
      {mode === 'targeted' && userRelays.length > 0 && (
        <div className="rounded-lg bg-muted/40 border border-border/50 px-3 py-2.5 space-y-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Target relays</p>
          <ul className="space-y-0.5">
            {userRelays.map((url) => (
              <li key={url} className="text-xs font-mono text-muted-foreground truncate">{url}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScopeCard({
  selected,
  onClick,
  icon,
  title,
  description,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-xl border-2 p-3.5 transition-all duration-200',
        'hover:bg-secondary/30',
        selected
          ? 'border-destructive/60 bg-destructive/[0.03] shadow-sm shadow-destructive/5'
          : 'border-border/60 bg-transparent',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'flex size-9 items-center justify-center rounded-lg shrink-0 transition-colors',
          selected ? 'bg-destructive/10 text-destructive' : 'bg-muted/60 text-muted-foreground',
        )}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {badge && (
              <span className="text-[10px] font-medium bg-destructive/10 text-destructive rounded-full px-2 py-0.5">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
        {/* Selection indicator */}
        <div className={cn(
          'size-4 rounded-full border-2 shrink-0 mt-0.5 transition-all duration-200 flex items-center justify-center',
          selected ? 'border-destructive bg-destructive' : 'border-muted-foreground/30',
        )}>
          {selected && <div className="size-1.5 rounded-full bg-white" />}
        </div>
      </div>
    </button>
  );
}

/* ───────────────────────── Step 1: Details ───────────────────────── */

function StepDetails({
  reason,
  setReason,
  mode,
  userRelays,
}: {
  reason: string;
  setReason: (r: string) => void;
  mode: VanishMode;
  userRelays: string[];
}) {
  return (
    <div className="px-5 py-5 space-y-5">
      {/* Summary of what will happen */}
      <div className="rounded-xl bg-destructive/[0.04] border border-destructive/15 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
          <Flame className="size-4" />
          What will be deleted
        </h3>
        <ul className="space-y-2">
          {[
            'Your profile (kind 0) and metadata',
            'All posts, replies, and reactions',
            'Direct messages and gift wraps',
            'Contact lists, relay lists, and settings',
            'All other events published by your key',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
              <span className="text-destructive/60 mt-0.5 shrink-0">&mdash;</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-destructive/70 pt-1 border-t border-destructive/10">
          {mode === 'global'
            ? 'This request will be sent to all relays on the network.'
            : `This request will be sent to ${userRelays.length} relay(s).`}
        </p>
      </div>

      {/* Reason */}
      <div className="space-y-2">
        <Label htmlFor="vanish-reason" className="text-sm font-medium">
          Reason or legal notice
        </Label>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Optionally include a message for the relay operator. This is included in the event's content field.
        </p>
        <Textarea
          id="vanish-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. GDPR Article 17 — Right to erasure"
          className="resize-none text-sm"
          rows={3}
        />
      </div>
    </div>
  );
}

/* ───────────────────────── Step 2: Confirm ───────────────────────── */

function StepConfirm({
  confirmText,
  setConfirmText,
  mode,
  relayCount,
}: {
  confirmText: string;
  setConfirmText: (t: string) => void;
  mode: VanishMode;
  relayCount: number;
}) {
  const isMatch = confirmText === CONFIRMATION_PHRASE;

  return (
    <div className="px-5 py-5 space-y-5">
      {/* Final warning */}
      <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-center space-y-2">
        <div className="flex justify-center">
          <div className="size-12 rounded-full bg-destructive/15 flex items-center justify-center">
            <Flame className="size-6 text-destructive" />
          </div>
        </div>
        <h3 className="text-sm font-bold text-destructive">This action is irreversible</h3>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
          Once sent, compliant relays will permanently delete your events.
          Deletion requests (kind 5) against this event have no effect.
          You will be logged out immediately.
        </p>
      </div>

      {/* Scope summary */}
      <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3.5 py-2.5">
        {mode === 'global' ? (
          <Globe className="size-4 text-muted-foreground shrink-0" />
        ) : (
          <Radio className="size-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs text-muted-foreground">
          {mode === 'global'
            ? 'Targeting all relays on the network'
            : `Targeting ${relayCount} configured relay(s)`}
        </span>
      </div>

      {/* Confirmation input */}
      <div className="space-y-2.5">
        <Label htmlFor="vanish-confirm" className="text-sm font-medium">
          Type{' '}
          <span className="font-mono bg-destructive/10 text-destructive px-1.5 py-0.5 rounded text-xs">
            {CONFIRMATION_PHRASE}
          </span>{' '}
          to confirm
        </Label>
        <Input
          id="vanish-confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
          placeholder={CONFIRMATION_PHRASE}
          className={cn(
            'font-mono text-center text-lg tracking-widest transition-colors',
            isMatch && 'border-destructive/50 ring-1 ring-destructive/20',
          )}
          autoComplete="off"
          spellCheck={false}
        />
        <p className={cn(
          'text-center text-xs transition-opacity duration-300',
          isMatch ? 'text-destructive opacity-100' : 'text-muted-foreground/40 opacity-0',
        )}>
          Confirmation accepted
        </p>
      </div>
    </div>
  );
}
