import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, Check, Copy, Download, Eye, EyeOff, KeyRound, Loader2, LogOut } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { saveNsec } from '@/lib/credentialManager';
import { markKeyBackedUp, useKeySafetyMarker } from '@/lib/keyBackup';
import { useRecordedNcryptsec } from '@/lib/keyLock';

interface KeySafetyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nsec: string;
  pubkey: string;
  /**
   * Logout mode: the dialog stands between "Log out" and the account, with one
   * last chance to copy the key (a back-up-first warning when it exists nowhere
   * else). Without it, it's the post-signup reminder.
   */
  onLogout?: () => void;
}

/**
 * Back up a key signup made. Copying or saving counts as a backup
 * ({@link markKeyBackedUp}).
 */
export function KeySafetyDialog({ open, onOpenChange, nsec, pubkey, onLogout }: KeySafetyDialogProps) {
  const intl = useIntl();
  const { config } = useAppContext();
  const { toast } = useToast();
  const marker = useKeySafetyMarker(pubkey);
  const ncryptsec = useRecordedNcryptsec(pubkey);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backedUpHere, setBackedUpHere] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowKey(false);
    setCopied(false);
    setBackedUpHere(false);
  }, [open]);

  const backedUp = backedUpHere || (marker?.backedUp ?? true);
  const keyOnlyHere = marker !== null && !marker.backedUp;
  // Logging out an account whose key is saved somewhere: just a last chance to copy it.
  const lastCopy = !!onLogout && !keyOnlyHere;
  // A password-protected key offers its ncryptsec, never the plain key behind the password.
  const shownKey = lastCopy && ncryptsec ? ncryptsec : nsec;
  const encrypted = shownKey !== nsec;
  // The backup stays on screen once done here, ticked, rather than vanishing mid-read.
  const showBackup = lastCopy || !marker?.backedUp || backedUpHere;

  const done = () => {
    setBackedUpHere(true);
    markKeyBackedUp(pubkey);
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(shownKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      done();
    } catch {
      toast({
        title: intl.formatMessage({ id: 'keySafety.copyFailed', defaultMessage: 'Copy failed' }),
        description: intl.formatMessage({ id: 'keySafety.copyFailedDescription', defaultMessage: 'Reveal the key and copy it by hand.' }),
        variant: 'destructive',
      });
    }
  };

  const saveKey = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await saveNsec(nip19.npubEncode(pubkey), nsec, config.appName);
      if (result !== 'dismissed') done();
    } catch {
      toast({
        title: intl.formatMessage({ id: 'keySafety.saveFailed', defaultMessage: "Couldn't save your key" }),
        description: intl.formatMessage({ id: 'keySafety.saveFailedDescription', defaultMessage: 'Reveal it, copy it, and keep it somewhere safe.' }),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No autofocus: it would land on the key field and select the key. */}
      <DialogContent
        className="max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="items-center text-center sm:text-center space-y-3">
          <span
            className={
              onLogout
                ? 'flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive'
                : 'flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary'
            }
          >
            {onLogout ? <LogOut className="size-6" /> : <KeyRound className="size-6" />}
          </span>
          <DialogTitle className="text-lg">
            {lastCopy ? (
              <FormattedMessage id="keySafety.lastCopyTitle" defaultMessage="Log out?" />
            ) : onLogout ? (
              <FormattedMessage id="keySafety.logoutTitle" defaultMessage="Back up before logging out" />
            ) : (
              <FormattedMessage id="keySafety.title" defaultMessage="Keep your account safe" />
            )}
          </DialogTitle>
          <DialogDescription>
            {lastCopy ? (
              encrypted ? (
                <FormattedMessage
                  id="keySafety.lastCopyEncryptedDescription"
                  defaultMessage="You'll need your encrypted key and its password to log back in. Copy it one last time if you're not sure it's saved."
                />
              ) : (
                <FormattedMessage
                  id="keySafety.lastCopyDescription"
                  defaultMessage="You'll need your secret key to log back in. Copy it one last time if you're not sure it's saved."
                />
              )
            ) : onLogout ? (
              <FormattedMessage
                id="keySafety.logoutDescription"
                defaultMessage="Your key isn't saved anywhere else. Log out without it and this account is gone for good."
              />
            ) : (
              <FormattedMessage
                id="keySafety.description"
                defaultMessage="Your secret key is your account. There's no email or password reset, so here's how to keep it."
              />
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {showBackup && (
            <section className="space-y-3">
              {/* In logout mode the dialog's own title already says this. */}
              {!onLogout && (
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  {backedUp && <Check className="size-4 text-emerald-600" />}
                  <FormattedMessage id="keySafety.backupTitle" defaultMessage="Back up your key" />
                </h3>
              )}
              {!backedUp && (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
                  <AlertTriangle className="mt-px size-4 shrink-0 text-amber-700 dark:text-amber-400" />
                  <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-300">
                    <FormattedMessage
                      id="keySafety.backupWarning"
                      defaultMessage="Only this device has it. Save it in a password manager, and never share it: anyone with it can act as you."
                    />
                  </p>
                </div>
              )}
              <div className="flex overflow-hidden rounded-md border border-input bg-background">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={shownKey}
                  readOnly
                  className="min-w-0 flex-1 rounded-none border-0 font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
                  aria-label={encrypted
                    ? intl.formatMessage({ id: 'keySafety.encryptedKeyLabel', defaultMessage: 'Your encrypted key' })
                    : intl.formatMessage({ id: 'keySafety.keyLabel', defaultMessage: 'Your secret key' })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-auto w-10 shrink-0 rounded-none focus-visible:ring-inset focus-visible:ring-offset-0"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey
                    ? intl.formatMessage({ id: 'keySafety.hideKey', defaultMessage: 'Hide secret key' })
                    : intl.formatMessage({ id: 'keySafety.showKey', defaultMessage: 'Show secret key' })}
                >
                  {showKey ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-auto w-10 shrink-0 rounded-none focus-visible:ring-inset focus-visible:ring-offset-0"
                  onClick={copyKey}
                  aria-label={intl.formatMessage({ id: 'keySafety.copyKey', defaultMessage: 'Copy secret key' })}
                >
                  {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4 text-muted-foreground" />}
                </Button>
              </div>
              {!lastCopy && (
                <Button type="button" variant="secondary" className="w-full rounded-full gap-2" onClick={saveKey} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  <FormattedMessage id="keySafety.save" defaultMessage="Save key" />
                </Button>
              )}
            </section>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {onLogout ? (
            <>
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
                <FormattedMessage id="keySafety.cancel" defaultMessage="Cancel" />
              </Button>
              <Button type="button" variant="destructive" className="rounded-full" onClick={onLogout}>
                {backedUp ? (
                  <FormattedMessage id="keySafety.logOut" defaultMessage="Log out" />
                ) : (
                  <FormattedMessage id="keySafety.logOutAnyway" defaultMessage="Log out anyway" />
                )}
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => onOpenChange(false)}>
              {!backedUp ? (
                <FormattedMessage id="keySafety.later" defaultMessage="Remind me tomorrow" />
              ) : (
                <FormattedMessage id="keySafety.done" defaultMessage="Done" />
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
