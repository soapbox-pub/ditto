import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { PomegranateStatus } from '@/hooks/usePomegranateLogin';

/** The standard multicolor Google "G" mark. */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M23.52 12.273c0-.851-.076-1.67-.218-2.455H12v4.642h6.458a5.52 5.52 0 0 1-2.394 3.622v3.011h3.878c2.269-2.089 3.578-5.166 3.578-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.956-1.075 7.942-2.907l-3.878-3.011c-1.075.72-2.45 1.145-4.064 1.145-3.125 0-5.771-2.111-6.715-4.948H1.276v3.11A11.995 11.995 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.285 14.28A7.213 7.213 0 0 1 4.909 12c0-.79.136-1.56.376-2.28V6.61H1.276a11.995 11.995 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.773c1.762 0 3.344.605 4.587 1.794l3.442-3.442C17.95 1.19 15.235 0 12 0A11.995 11.995 0 0 0 1.276 6.61l4.01 3.11C6.228 6.884 8.874 4.773 12 4.773Z"
      />
    </svg>
  );
}

interface GoogleLoginButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * "Continue with Google" button for the Pomegranate login flow. The click
 * handler must synchronously open the OAuth popup (see usePomegranateLogin).
 */
export function GoogleLoginButton({ onClick, disabled, className }: GoogleLoginButtonProps) {
  return (
    <Button
      type='button'
      variant='outline'
      onClick={onClick}
      disabled={disabled}
      className={cn('w-full rounded-full gap-2', className)}
    >
      <GoogleLogo className='h-4 w-4 shrink-0' />
      Continue with Google
    </Button>
  );
}

const STEP_LABELS: Record<string, string> = {
  'authenticating': 'Waiting for Google sign-in…',
  'checking-account': 'Checking your account…',
  'connecting': 'Connecting to your signer…',
};

interface PomegranateStatusViewProps {
  status: PomegranateStatus;
  /** Abort the flow and return to the login form. */
  onCancel: () => void;
  /** Re-run the flow against a different central server (user-confirmed). */
  onContinue: (centralUrl: string) => void;
}

/**
 * Progress / confirmation / error views for the Pomegranate Google login
 * flow, rendered in place of the login form while the flow is active.
 */
export function PomegranateStatusView({ status, onCancel, onContinue }: PomegranateStatusViewProps) {
  if (status.step === 'error') {
    return (
      <div className='flex flex-col items-center space-y-3 py-4'>
        <p className='text-sm text-destructive text-center'>{status.message}</p>
        <Button variant='outline' onClick={onCancel} className='rounded-full'>
          Try again
        </Button>
      </div>
    );
  }

  if (status.step === 'found-other-central') {
    let host = status.centralUrl;
    try {
      host = new URL(status.centralUrl).host;
    } catch {
      // fall back to the raw URL
    }
    return (
      <div className='flex flex-col items-center space-y-4 py-4'>
        <p className='text-sm text-muted-foreground text-center'>
          Your Google account already has a Nostr key set up at{' '}
          <span className='font-medium text-foreground break-all'>{host}</span>.
          Continue there to use your existing account.
        </p>
        <Button onClick={() => onContinue(status.centralUrl)} className='rounded-full gap-2'>
          <GoogleLogo className='h-4 w-4 shrink-0' />
          Continue at {host}
        </Button>
        <button
          type='button'
          onClick={onCancel}
          className='text-sm text-muted-foreground hover:text-foreground'
        >
          Back
        </button>
      </div>
    );
  }

  const label = status.step === 'creating-account'
    ? `Securing your key (${status.completed}/${status.total})…`
    : STEP_LABELS[status.step] ?? 'Working…';

  return (
    <div className='flex flex-col items-center space-y-4 py-6 w-full'>
      <Loader2 className='w-8 h-8 animate-spin text-primary' />
      <p className='text-sm text-muted-foreground text-center min-h-[1.25rem]' aria-live='polite'>
        {label}
      </p>
      <button
        type='button'
        onClick={onCancel}
        className='text-sm text-primary hover:underline underline-offset-4 font-medium'
      >
        Cancel
      </button>
    </div>
  );
}

export default GoogleLoginButton;
