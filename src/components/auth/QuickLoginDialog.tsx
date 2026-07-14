import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useLoginActions } from '@/hooks/useLoginActions';
import { getAvatarShape } from '@/lib/avatarShape';

interface QuickLoginDialogProps {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /** The pubkey (hex) detected from the NIP-07 extension. */
  pubkey: string;
  /** Close the dialog. */
  onClose: () => void;
  /** Called after a successful login. */
  onLogin: () => void;
  /** Continue to the full login dialog ("Other ways to log in"). */
  onOtherLogin: () => void;
}

/**
 * Confirmation dialog shown when a NIP-07 extension is present and exposes a
 * public key. Displays the detected account's profile and a one-tap "Log in"
 * button, with a smaller "Other ways to log in" escape hatch to the full
 * LoginDialog.
 */
export function QuickLoginDialog({
  isOpen,
  pubkey,
  onClose,
  onLogin,
  onOtherLogin,
}: QuickLoginDialogProps) {
  const author = useAuthor(pubkey);
  const login = useLoginActions();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState('');

  const metadata = author.data?.metadata;
  const displayName =
    metadata?.display_name || metadata?.name || genericName(pubkey);
  const picture = metadata?.picture;

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError('');
    try {
      await login.extension();
      onLogin();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed.');
      setIsLoggingIn(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-center">Welcome back</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-4">
          {author.isLoading ? (
            <>
              <Skeleton className="size-20 rounded-full" />
              <Skeleton className="h-5 w-32" />
            </>
          ) : (
            <>
              <Avatar shape={getAvatarShape(metadata)} className="size-20">
                <AvatarImage src={picture} alt={displayName} />
                <AvatarFallback className="text-xl">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-lg font-semibold leading-none">{displayName}</p>
            </>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive text-center" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col items-center gap-2">
          <Button
            className="w-full rounded-full"
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Logging in…
              </>
            ) : (
              'Log in'
            )}
          </Button>
          <Button
            variant="link"
            size="sm"
            className="text-muted-foreground"
            onClick={onOtherLogin}
            disabled={isLoggingIn}
          >
            Other ways to log in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Fallback display name derived from the npub when no metadata is available. */
function genericName(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
  } catch {
    return 'Nostr user';
  }
}
