import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useUserStatus } from '@/hooks/useUserStatus';
import { usePublishStatus } from '@/hooks/usePublishStatus';
import { useToast } from '@/hooks/useToast';

interface StatusEditorProps {
  pubkey: string;
  /** Padding class for the editing form wrapper (e.g. "p-3" or "px-3 py-2"). */
  formClassName?: string;
  /** Padding class for the inactive "Set a status" button (e.g. "px-4" or "px-3"). */
  buttonClassName?: string;
}

/**
 * Inline NIP-38 status editor used in the account popover (LeftSidebar)
 * and the mobile drawer (MobileDrawer).
 *
 * Renders either the current status (or "Set a status" placeholder) as a
 * clickable button, or an input + Save/Clear/Cancel controls when editing.
 */
export function StatusEditor({ pubkey, formClassName = 'p-3', buttonClassName = 'px-4' }: StatusEditorProps) {
  const userStatus = useUserStatus(pubkey);
  const publishStatus = usePublishStatus();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const submitStatus = (text: string) => {
    publishStatus.mutateAsync({ status: text }).then(() => {
      setEditing(false);
      setDraft('');
      toast({ title: text ? 'Status updated' : 'Status cleared' });
    }).catch(() => {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    });
  };

  if (editing) {
    return (
      <div className={`${formClassName} space-y-2`}>
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
              submitStatus(draft.trim());
            } else if (e.key === 'Escape') {
              setEditing(false);
              setDraft('');
            }
          }}
        />
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => submitStatus(draft.trim())}
            disabled={publishStatus.isPending}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            {publishStatus.isPending ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
          </button>
          {userStatus.status && (
            <button
              onClick={() => submitStatus('')}
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
      className={`flex items-center gap-3 w-full ${buttonClassName} py-2.5 text-sm hover:bg-secondary/60 transition-colors`}
    >
      {userStatus.status ? (
        <span className="truncate text-muted-foreground italic text-xs pr-1">{userStatus.status}</span>
      ) : (
        <span className="text-muted-foreground">Set a status</span>
      )}
    </button>
  );
}
