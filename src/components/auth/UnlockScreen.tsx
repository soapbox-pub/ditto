import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Loader2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { DittoLogoMark } from '@/components/DittoLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUnlockRequest } from '@/lib/keyLock';

/**
 * Asks for the password of each password-locked account at launch. Rendered as
 * `NostrLoginProvider`'s fallback, which holds while `loginStorage` waits on
 * {@link useUnlockRequest}; nothing else has a key until this resolves.
 */
export function UnlockScreen() {
  const intl = useIntl();
  const request = useUnlockRequest();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);

  useEffect(() => {
    setPassword('');
    setError('');
    setConfirmForget(false);
  }, [request]);

  if (!request) return null;

  const npub = nip19.npubEncode(request.pubkey);
  const shortNpub = `${npub.slice(0, 12)}…${npub.slice(-6)}`;

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const result = await request.unlock(password);
    setBusy(false);
    if (result === 'ok') return;
    setError(result === 'password'
      ? intl.formatMessage({ id: 'unlock.wrongPassword', defaultMessage: 'Wrong password.' })
      : intl.formatMessage({ id: 'unlock.damaged', defaultMessage: "This account's stored key is damaged and can't be unlocked." }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8 px-6 text-center w-full max-w-sm">
        <DittoLogoMark size={72} />

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            <FormattedMessage id="unlock.title" defaultMessage="Welcome back" />
          </h1>
          <p className="text-sm text-muted-foreground">
            {request.remaining > 1 ? (
              <FormattedMessage
                id="unlock.descriptionMany"
                defaultMessage="Enter the password for {account}. {count} locked accounts to go."
                values={{ account: <span className="font-mono">{shortNpub}</span>, count: request.remaining }}
              />
            ) : (
              <FormattedMessage
                id="unlock.description"
                defaultMessage="Enter the password for {account}."
                values={{ account: <span className="font-mono">{shortNpub}</span> }}
              />
            )}
          </p>
        </div>

        {confirmForget ? (
          <div className="w-full space-y-3 text-left">
            <p className="text-sm text-destructive">
              <FormattedMessage
                id="unlock.forgetWarning"
                defaultMessage="A forgotten password can't be recovered or reset. Once you log out, this account's nsec is the only way back in, so only log out if you have it saved."
              />
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1 rounded-full" onClick={request.forget}>
                <FormattedMessage id="unlock.forgetConfirm" defaultMessage="Log out" />
              </Button>
              <Button variant="ghost" className="rounded-full" onClick={() => setConfirmForget(false)}>
                <FormattedMessage id="unlock.cancel" defaultMessage="Cancel" />
              </Button>
            </div>
          </div>
        ) : (
          <form className="w-full space-y-3 text-left" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              autoFocus
              autoComplete="current-password"
              placeholder={intl.formatMessage({ id: 'unlock.password', defaultMessage: 'Password' })}
              aria-label={intl.formatMessage({ id: 'unlock.password', defaultMessage: 'Password' })}
              aria-invalid={!!error}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full rounded-full" disabled={busy || !password}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <FormattedMessage id="unlock.unlocking" defaultMessage="Unlocking…" />
                </>
              ) : (
                <FormattedMessage id="unlock.submit" defaultMessage="Unlock" />
              )}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:underline"
              onClick={() => setConfirmForget(true)}
            >
              <FormattedMessage id="unlock.forget" defaultMessage="Log out" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
