import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserStatus } from '@/hooks/useUserStatus';
import { usePublishStatus } from '@/hooks/usePublishStatus';
import { useToast } from '@/hooks/useToast';

/** Compact status widget — shows current NIP-38 status, click to edit inline. */
export function StatusWidget() {
  const { user } = useCurrentUser();
  const userStatus = useUserStatus(user?.pubkey);
  const publishStatus = usePublishStatus();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!user) {
    return (
      <p className="text-sm text-muted-foreground px-1">Log in to set a status.</p>
    );
  }

  if (editing) {
    return (
      <div className="space-y-2 px-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 80))}
          placeholder="What are you up to?"
          className="h-8 text-base md:text-sm"
          maxLength={80}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const text = draft.trim();
              publishStatus.mutateAsync({ status: text }).then(() => {
                setEditing(false);
                setDraft('');
                toast({ title: text ? 'Status updated' : 'Status cleared' });
              }).catch(() => {
                toast({ title: 'Failed to update status', variant: 'destructive' });
              });
            } else if (e.key === 'Escape') {
              setEditing(false);
              setDraft('');
            }
          }}
        />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const text = draft.trim();
              publishStatus.mutateAsync({ status: text }).then(() => {
                setEditing(false);
                setDraft('');
                toast({ title: text ? 'Status updated' : 'Status cleared' });
              }).catch(() => {
                toast({ title: 'Failed to update status', variant: 'destructive' });
              });
            }}
            disabled={publishStatus.isPending}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            {publishStatus.isPending ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
          </button>
          {userStatus.status && (
            <button
              onClick={() => {
                publishStatus.mutateAsync({ status: '' }).then(() => {
                  setEditing(false);
                  setDraft('');
                  toast({ title: 'Status cleared' });
                }).catch(() => {
                  toast({ title: 'Failed to clear status', variant: 'destructive' });
                });
              }}
              disabled={publishStatus.isPending}
              className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => { setEditing(false); setDraft(''); }}
            className="text-xs text-muted-foreground hover:underline ml-auto"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        setEditing(true);
        setDraft(userStatus.status ?? '');
      }}
      className="flex items-center w-full px-1 py-1 text-sm hover:bg-secondary/40 rounded-lg transition-colors text-left"
    >
      {userStatus.status ? (
        <span className="truncate text-muted-foreground italic text-xs">{userStatus.status}</span>
      ) : (
        <span className="text-muted-foreground text-xs">Click to set a status...</span>
      )}
    </button>
  );
}
