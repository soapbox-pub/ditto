import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useRequestToVanish } from '@/hooks/useRequestToVanish';
import { useLoginActions } from '@/hooks/useLoginActions';
import { toast } from '@/hooks/useToast';

interface RequestToVanishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const messages = defineMessages({
  profile: { id: 'requestToVanish.item.profile', defaultMessage: 'Your profile and metadata' },
  posts: { id: 'requestToVanish.item.posts', defaultMessage: 'All posts, replies, and reactions' },
  messages: { id: 'requestToVanish.item.messages', defaultMessage: 'Direct messages' },
  settings: { id: 'requestToVanish.item.settings', defaultMessage: 'Follow lists and settings' },
  other: { id: 'requestToVanish.item.other', defaultMessage: 'All other events submitted to the network' },
});

const DELETION_ITEMS = [
  { id: 'profile', label: messages.profile },
  { id: 'posts', label: messages.posts },
  { id: 'messages', label: messages.messages },
  { id: 'settings', label: messages.settings },
  { id: 'other', label: messages.other },
] as const;

type ItemId = (typeof DELETION_ITEMS)[number]['id'];

export function RequestToVanishDialog({ open, onOpenChange }: RequestToVanishDialogProps) {
  const intl = useIntl();
  const { mutateAsync: requestVanish, isPending } = useRequestToVanish();
  const { logout } = useLoginActions();

  const [checked, setChecked] = useState<Set<ItemId>>(new Set());

  const allChecked = DELETION_ITEMS.every((item) => checked.has(item.id));

  const toggle = (id: ItemId) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const resetState = useCallback(() => {
    setChecked(new Set());
  }, []);

  // Reset when dialog closes.
  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const handleSubmit = async () => {
    if (!allChecked) return;

    try {
      await requestVanish({ relayUrls: ['ALL_RELAYS'], content: '' });

      toast({
        title: intl.formatMessage({ id: 'requestToVanish.success.title', defaultMessage: 'Account deleted' }),
        description: intl.formatMessage({ id: 'requestToVanish.success.description', defaultMessage: 'Your deletion request has been broadcast. You have been logged out.' }),
      });

      onOpenChange(false);
      await logout();
    } catch {
      toast({
        title: intl.formatMessage({ id: 'requestToVanish.error.title', defaultMessage: 'Failed to delete account' }),
        description: intl.formatMessage({ id: 'requestToVanish.error.description', defaultMessage: 'Something went wrong. You can try again.' }),
        variant: 'destructive',
      });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[400px] rounded-2xl p-6 gap-0 border-destructive/40">
        {/* Title */}
        <div className="mb-4">
          <AlertDialogTitle className="text-base font-bold flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive shrink-0" />
            <FormattedMessage id="settings.deleteAccount" defaultMessage="Delete Account" />
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground mt-1">
            <FormattedMessage
              id="requestToVanish.description"
              defaultMessage="This will <b>permanently delete your data</b>. Check each box to confirm you understand what will be removed:"
              values={{ b: (chunks) => <span className="font-semibold text-destructive">{chunks}</span> }}
            />
          </AlertDialogDescription>
        </div>

        {/* Checkbox list */}
        <div className="space-y-3 mb-5">
          {DELETION_ITEMS.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-3 cursor-pointer select-none"
            >
              <Checkbox
                checked={checked.has(item.id)}
                onCheckedChange={() => toggle(item.id)}
                className="border-destructive/60 data-[state=checked]:bg-destructive data-[state=checked]:border-destructive"
              />
              <span className="text-sm text-muted-foreground"><FormattedMessage {...item.label} /></span>
            </label>
          ))}
        </div>

        {/* Warning */}
        <p className="text-xs text-muted-foreground leading-relaxed mb-5">
          <FormattedMessage
            id="requestToVanish.warning"
            defaultMessage="This action is <b>irreversible</b>. Your account cannot be recovered after deletion. You will be logged out immediately."
            values={{ b: (chunks) => <span className="font-semibold text-destructive">{chunks}</span> }}
          />
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button
            className="flex-1 gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
            onClick={handleSubmit}
            disabled={!allChecked || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <FormattedMessage id="articles.mine.deleting" defaultMessage="Deleting..." />
              </>
            ) : (
              <FormattedMessage id="settings.deleteAccount" defaultMessage="Delete Account" />
            )}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
