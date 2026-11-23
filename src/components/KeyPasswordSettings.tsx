import { useState } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, Check, Copy, Download, FileLock, Loader2, Lock } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useNostrLogin } from '@nostrify/react/login';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { downloadTextFile } from '@/lib/downloadFile';
import { markKeyBackedUp, useKeySafetyMarker } from '@/lib/keyBackup';
import {
  AUTO_LOCK_CHOICES,
  lockedNcryptsec,
  lockNow,
  recordNcryptsec,
  setAutoLockMinutes,
  setKeyLock,
  useAutoLockMinutes,
  useKeyLocked,
  useRecordedNcryptsec,
  type AutoLockMinutes,
} from '@/lib/keyLock';
import { decryptNcryptsec, encryptNcryptsec } from '@/lib/ncryptsec';
import { LOGIN_STORAGE_KEY, loginStorage } from '@/lib/secureStorage';

/**
 * Enter submits these fields by hand: they're rendered inside the profile
 * page's own <form>, where a nested <form> would fall through to a native
 * submission (a full page reload) and Enter would submit the profile instead.
 */
const onEnter = (action: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  action();
};

/** An ncryptsec can be guessed offline; at log_n 16 an 8-character password falls to a GPU rig. */
const MIN_PASSWORD_LENGTH = 12;

const AUTO_LOCK_LABELS = defineMessages({
  1: { id: 'settings.profile.keyLock.autoLock1', defaultMessage: 'After 1 minute' },
  5: { id: 'settings.profile.keyLock.autoLock5', defaultMessage: 'After 5 minutes' },
  15: { id: 'settings.profile.keyLock.autoLock15', defaultMessage: 'After 15 minutes' },
  60: { id: 'settings.profile.keyLock.autoLock60', defaultMessage: 'After 1 hour' },
  0: { id: 'settings.profile.keyLock.autoLock0', defaultMessage: 'Only when reopened' },
});

/** The password check shared by revealing the key and turning the lock on or off. */
function PasswordCheckForm({ ncryptsec, submitLabel, onPassed, onCancel }: {
  ncryptsec: string;
  submitLabel: React.ReactNode;
  onPassed: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const intl = useIntl();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      (await decryptNcryptsec(ncryptsec, password)).fill(0);
    } catch {
      setError(intl.formatMessage({ id: 'settings.profile.keyLock.wrongPassword', defaultMessage: 'Wrong password.' }));
      setBusy(false);
      return;
    }
    try {
      await onPassed();
      setPassword('');
    } catch {
      setError(intl.formatMessage({ id: 'settings.profile.keyLock.failed', defaultMessage: "Couldn't update how your key is stored." }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Input
        type="password"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(''); }}
        onKeyDown={onEnter(() => { if (password && !busy) void submit(); })}
        autoFocus
        autoComplete="current-password"
        placeholder={intl.formatMessage({ id: 'settings.profile.keyLock.passwordPlaceholder', defaultMessage: "Your backup's password" })}
        aria-label={intl.formatMessage({ id: 'settings.profile.keyLock.passwordPlaceholder', defaultMessage: "Your backup's password" })}
        aria-invalid={!!error}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" className="flex-1 rounded-full" onClick={() => void submit()} disabled={busy || !password}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : submitLabel}
        </Button>
        <Button type="button" variant="ghost" className="rounded-full" onClick={onCancel} disabled={busy}>
          <FormattedMessage id="settings.profile.keyLock.cancel" defaultMessage="Cancel" />
        </Button>
      </div>
    </div>
  );
}

/**
 * The plain-key controls stay hidden behind the password of the account's
 * ncryptsec: someone who chose a password-protected key shouldn't have the
 * bare nsec one tap away. Checked by decrypting the recorded ncryptsec.
 */
export function RevealKeyWithPassword({ ncryptsec, onUnlock }: { ncryptsec: string; onUnlock: () => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <FormattedMessage id="settings.profile.keyLock.hidden" defaultMessage="Your secret key is hidden behind your backup's password." />
        </p>
        <Button type="button" variant="secondary" className="shrink-0 rounded-full gap-2" onClick={() => setOpen(true)}>
          <Lock className="size-4" />
          <FormattedMessage id="settings.profile.keyLock.reveal" defaultMessage="Reveal" />
        </Button>
      </div>
    );
  }

  return (
    <PasswordCheckForm
      ncryptsec={ncryptsec}
      submitLabel={<FormattedMessage id="settings.profile.keyLock.reveal" defaultMessage="Reveal" />}
      onPassed={onUnlock}
      onCancel={() => setOpen(false)}
    />
  );
}

/**
 * NIP-49: seal the key under a password as an `ncryptsec1…`, which most Nostr
 * clients (and Ditto's login) accept, and optionally store the key on this
 * device only in that form, asking for the password at launch.
 */
export function KeyPasswordSettings({ nsec, pubkey }: { nsec: string; pubkey: string }) {
  const intl = useIntl();
  const { toast } = useToast();
  const { logins } = useNostrLogin();
  const { config } = useAppContext();
  const ncryptsec = useRecordedNcryptsec(pubkey);
  const safetyMarker = useKeySafetyMarker(pubkey);
  // Signup made this key and it was never saved: locking hides the only plain copy.
  const keyOnlyHere = safetyMarker !== null && !safetyMarker.backedUp;
  const locked = useKeyLocked(pubkey);
  const minutes = useAutoLockMinutes();

  const [view, setView] = useState<'closed' | 'form' | 'show'>('closed');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingLock, setConfirmingLock] = useState(false);
  // Just encrypted here: explain what changed above the new encrypted key.
  const [justCreated, setJustCreated] = useState(false);

  // The lock applies when the login list is written, so write it now.
  const setLocked = async (sealWith: string | null) => {
    setKeyLock(pubkey, sealWith);
    await loginStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify(logins));
  };

  const closeForm = () => {
    setJustCreated(false);
    setView('closed');
    setPassword('');
    setConfirm('');
    setError('');
  };

  const encrypt = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(intl.formatMessage(
        { id: 'settings.profile.keyLock.tooShort', defaultMessage: 'Use at least {count} characters.' },
        { count: MIN_PASSWORD_LENGTH },
      ));
      return;
    }
    if (password !== confirm) {
      setError(intl.formatMessage({ id: 'settings.profile.keyLock.mismatch', defaultMessage: "The passwords don't match." }));
      return;
    }
    setBusy(true);
    setError('');
    const sk = nip19.decode(nsec).data as Uint8Array;
    try {
      const created = await encryptNcryptsec(sk, password);
      recordNcryptsec(pubkey, created);
      // Someone who just set a password wants it asked for. Turning the lock
      // off later is one switch away.
      await setLocked(created);
      setPassword('');
      setConfirm('');
      setJustCreated(true);
      setView('show');
      toast({ title: intl.formatMessage({ id: 'settings.profile.keyLock.createdToast', defaultMessage: 'Your key is now password-protected' }) });
    } catch {
      setError(intl.formatMessage({ id: 'settings.profile.keyLock.encryptFailed', defaultMessage: "Couldn't encrypt your key." }));
    } finally {
      // NIP-49 asks for key material to be zeroed; this copy is ours alone.
      sk.fill(0);
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!ncryptsec) return;
    try {
      await navigator.clipboard.writeText(ncryptsec);
      markKeyBackedUp(pubkey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: intl.formatMessage({ id: 'settings.profile.backupKey.copyFailed', defaultMessage: 'Copy failed' }),
        variant: 'destructive',
      });
    }
  };

  const save = async () => {
    if (!ncryptsec) return;
    const npub = nip19.npubEncode(pubkey);
    await downloadTextFile(`${npub.slice(0, 16)}.ncryptsec.txt`, ncryptsec);
    markKeyBackedUp(pubkey);
    toast({ title: intl.formatMessage({ id: 'settings.profile.keyLock.saved', defaultMessage: 'Encrypted key saved' }) });
  };

  const sealedWith = locked ? lockedNcryptsec(pubkey) : ncryptsec;

  return (
    <div className="space-y-4 pt-2">
      {/* Password-protected backup */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              <FormattedMessage id="settings.profile.keyLock.backupTitle" defaultMessage="Password-protected backup" />
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {ncryptsec ? (
                <FormattedMessage id="settings.profile.keyLock.backupSetUp" defaultMessage="Set up. Log in anywhere with it and its password." />
              ) : (
                <FormattedMessage id="settings.profile.keyLock.backupDescription" defaultMessage="Your key locked with a password (an ncryptsec). Most Nostr apps can log in with it, and it's useless to anyone without the password." />
              )}
            </p>
          </div>
          {view === 'closed' && (
            ncryptsec ? (
              <Button type="button" variant="secondary" className="shrink-0 rounded-full gap-2" onClick={() => setView('show')}>
                <Check className="size-4 text-emerald-600" />
                <FormattedMessage id="settings.profile.keyLock.show" defaultMessage="Show" />
              </Button>
            ) : (
              <Button type="button" variant="secondary" className="shrink-0 rounded-full gap-2" onClick={() => setView('form')}>
                <FileLock className="size-4" />
                <FormattedMessage id="settings.profile.keyLock.create" defaultMessage="Create" />
              </Button>
            )
          )}
        </div>

        {view === 'show' && ncryptsec && (
          <div className="space-y-2">
            {justCreated && (
              <div className="inset-well space-y-2 p-3" role="status">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Check className="size-4 shrink-0 text-emerald-600" />
                  <FormattedMessage id="settings.profile.keyLock.createdTitle" defaultMessage="Your key is now password-protected" />
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                  <li>
                    <FormattedMessage
                      id="settings.profile.keyLock.createdStored"
                      defaultMessage="{appName} now keeps only the locked copy of your key. You're still logged in."
                      values={{ appName: config.appName }}
                    />
                  </li>
                  <li>
                    <FormattedMessage
                      id="settings.profile.keyLock.createdAsk"
                      defaultMessage="Next time you open {appName}, or after you've been idle a while, it asks for this password. You can change when below."
                      values={{ appName: config.appName }}
                    />
                  </li>
                  <li>
                    <FormattedMessage
                      id="settings.profile.keyLock.createdBackup"
                      defaultMessage="Save the encrypted key below. With it and your password you can log in to {appName}, or most Nostr apps, anywhere."
                      values={{ appName: config.appName }}
                    />
                  </li>
                  <li>
                    <FormattedMessage
                      id="settings.profile.keyLock.createdNoRecovery"
                      defaultMessage="A forgotten password can't be reset."
                    />
                  </li>
                </ul>
              </div>
            )}
            <Input
              value={ncryptsec}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-base md:text-sm"
              aria-label={intl.formatMessage({ id: 'settings.profile.keyLock.encryptedKey', defaultMessage: 'Encrypted secret key' })}
            />
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1 rounded-full gap-2" onClick={copy}>
                {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                <FormattedMessage id="settings.profile.keyLock.copy" defaultMessage="Copy" />
              </Button>
              <Button type="button" variant="secondary" className="flex-1 rounded-full gap-2" onClick={save}>
                <Download className="size-4" />
                <FormattedMessage id="settings.profile.keyLock.save" defaultMessage="Save" />
              </Button>
              <Button type="button" variant="ghost" className="rounded-full" onClick={closeForm}>
                <FormattedMessage id="settings.profile.keyLock.done" defaultMessage="Done" />
              </Button>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:underline"
              onClick={() => setView('form')}
            >
              <FormattedMessage id="settings.profile.keyLock.newPassword" defaultMessage="Make a new one with a different password" />
            </button>
          </div>
        )}

        {view === 'form' && (
          <div className="space-y-2">
            {keyOnlyHere && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                <AlertTriangle className="mt-px size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-300">
                  <FormattedMessage
                    id="settings.profile.keyLock.backUpFirst"
                    defaultMessage="You haven't backed up your key yet. Save it somewhere safe with Back Up Key above first: once it's locked, the password is the only way to see it again, and a forgotten password can't be reset."
                  />
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">
              <FormattedMessage
                id="settings.profile.keyLock.formExplainer"
                defaultMessage="This locks your key with a password. From then on, {appName} keeps only the locked copy on this device and asks for the password each time you open it."
                values={{ appName: config.appName }}
              />
            </p>
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={onEnter(() => { if (password && !busy) void encrypt(); })}
              autoFocus
              autoComplete="new-password"
              placeholder={intl.formatMessage({ id: 'settings.profile.keyLock.password', defaultMessage: 'Password' })}
              aria-label={intl.formatMessage({ id: 'settings.profile.keyLock.password', defaultMessage: 'Password' })}
            />
            <Input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(''); }}
              onKeyDown={onEnter(() => { if (password && !busy) void encrypt(); })}
              autoComplete="new-password"
              placeholder={intl.formatMessage({ id: 'settings.profile.keyLock.confirm', defaultMessage: 'Confirm password' })}
              aria-label={intl.formatMessage({ id: 'settings.profile.keyLock.confirm', defaultMessage: 'Confirm password' })}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground leading-relaxed">
              <FormattedMessage id="settings.profile.keyLock.formHint" defaultMessage="Pick a long password. Anyone holding the encrypted key can try to guess it offline." />
            </p>
            <div className="flex gap-2">
              <Button type="button" className="flex-1 rounded-full" onClick={() => void encrypt()} disabled={busy || !password}>
                {busy ? (
                  <><Loader2 className="size-4 animate-spin" /> <FormattedMessage id="settings.profile.keyLock.encrypting" defaultMessage="Encrypting…" /></>
                ) : (
                  <FormattedMessage id="settings.profile.keyLock.encrypt" defaultMessage="Encrypt key" />
                )}
              </Button>
              <Button type="button" variant="ghost" className="rounded-full" onClick={closeForm} disabled={busy}>
                <FormattedMessage id="settings.profile.keyLock.cancel" defaultMessage="Cancel" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Password lock */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              <FormattedMessage id="settings.profile.keyLock.lockTitle" defaultMessage="Ask for password on open" />
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {locked ? (
                <FormattedMessage id="settings.profile.keyLock.lockOn" defaultMessage="Your key is stored on this device only in encrypted form." />
              ) : ncryptsec ? (
                <FormattedMessage id="settings.profile.keyLock.lockOff" defaultMessage="Store your key only in encrypted form, unlocked with your backup's password." />
              ) : (
                <FormattedMessage id="settings.profile.keyLock.lockNeedsBackup" defaultMessage="Create a password-protected backup to turn this on." />
              )}
            </p>
          </div>
          <Switch
            checked={locked}
            disabled={!locked && !ncryptsec}
            onCheckedChange={() => setConfirmingLock(true)}
            aria-label={intl.formatMessage({ id: 'settings.profile.keyLock.lockTitle', defaultMessage: 'Ask for password on open' })}
          />
        </div>

        {confirmingLock && sealedWith && (
          <PasswordCheckForm
            ncryptsec={sealedWith}
            submitLabel={locked
              ? <FormattedMessage id="settings.profile.keyLock.turnOff" defaultMessage="Turn off" />
              : <FormattedMessage id="settings.profile.keyLock.turnOn" defaultMessage="Turn on" />}
            onPassed={async () => {
              await setLocked(locked ? null : sealedWith);
              setConfirmingLock(false);
            }}
            onCancel={() => setConfirmingLock(false)}
          />
        )}

        {locked && (
          <>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">
                <FormattedMessage id="settings.profile.keyLock.autoLock" defaultMessage="Lock when idle" />
              </p>
              <Select value={String(minutes)} onValueChange={(v) => setAutoLockMinutes(Number(v) as AutoLockMinutes)}>
                <SelectTrigger
                  className="w-44 shrink-0"
                  aria-label={intl.formatMessage({ id: 'settings.profile.keyLock.autoLock', defaultMessage: 'Lock when idle' })}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTO_LOCK_CHOICES.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      <FormattedMessage {...AUTO_LOCK_LABELS[m]} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="secondary" className="w-full rounded-full gap-2" onClick={lockNow}>
              <Lock className="size-4" />
              <FormattedMessage id="settings.profile.keyLock.lockNow" defaultMessage="Lock now" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
