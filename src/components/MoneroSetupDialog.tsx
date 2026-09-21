import { useCallback, useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { AlertTriangle, Check, Copy, Loader2, Plus, RotateCcw, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { MoneroWalletExistsError, useMoneroRecord } from '@/hooks/useMoneroRecord';
import { useEnsurePaymentTarget } from '@/hooks/usePaymentTargets';
import { createWallet, restoreWallet } from '@/lib/monero/wallet';

interface MoneroSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once the wallet record has been published. */
  onComplete?: () => void;
}

type Step =
  | { name: 'choose' }
  | { name: 'creating' }
  | { name: 'backup'; seed: string; address: string; restoreHeight: number; cachePassword: string }
  | { name: 'restore' }
  | { name: 'restoring' };

/**
 * First-run setup for the Monero wallet.
 *
 * Bitcoin needs none of this — a Nostr pubkey *is* a Taproot key, so the
 * wallet simply exists (see `WALLET.md`). Monero uses a different curve and a
 * separate view/spend keypair, so there is real key material to generate,
 * show to the user once, and store. That makes the seed-backup step
 * unavoidable and the most important screen in the feature: it is the only
 * moment the user can record something that recovers their funds.
 */
export function MoneroSetupDialog({ isOpen, onClose, onComplete }: MoneroSetupDialogProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { createRecord, canEncrypt } = useMoneroRecord();
  const { mutateAsync: ensurePaymentTarget } = useEnsurePaymentTarget();

  const pubkey = user?.pubkey ?? '';

  const [step, setStep] = useState<Step>({ name: 'choose' });
  const [error, setError] = useState<string | null>(null);

  // Backup-confirmation state.
  const [copied, setCopied] = useState(false);
  const [confirmedBackup, setConfirmedBackup] = useState(false);

  /** Whether to announce the address as a NIP-A3 payment target on finish. */
  const [publishAddress, setPublishAddress] = useState(true);

  // Restore-form state.
  const [seedInput, setSeedInput] = useState('');
  const [restoreHeightInput, setRestoreHeightInput] = useState('');
  const [passphrase, setPassphrase] = useState('');

  const reset = useCallback(() => {
    setStep({ name: 'choose' });
    setError(null);
    setCopied(false);
    setConfirmedBackup(false);
    setPublishAddress(true);
    setSeedInput('');
    setRestoreHeightInput('');
    setPassphrase('');
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  /**
   * The account this in-progress flow belongs to.
   *
   * A generated seed lives in component state until "Finish setup" publishes
   * it, and Ditto doesn't remount on an account switch. Without this, a switch
   * between generating and finishing would encrypt that seed to the *new*
   * account and announce its address on their profile. Discarding an unsaved
   * seed is free — nothing has been published yet, and the next "Create"
   * generates another.
   */
  const startedFor = useRef(pubkey);
  useEffect(() => {
    if (startedFor.current === pubkey) return;
    startedFor.current = pubkey;
    reset();
  }, [pubkey, reset]);

  /** Guard every publish against a switch that landed mid-flow. */
  const assertSameAccount = useCallback((): boolean => {
    if (startedFor.current === pubkey) return true;
    setError(
      intl.formatMessage({
        id: 'monero.setup.error.accountChanged',
        defaultMessage: 'Your account changed. Start the wallet setup again.',
      }),
    );
    setStep({ name: 'choose' });
    return false;
  }, [pubkey, intl]);

  /** Generate a brand-new wallet and move to the backup screen. */
  const handleCreate = useCallback(async () => {
    setError(null);
    startedFor.current = pubkey;
    setStep({ name: 'creating' });
    try {
      // No node involved: generating a wallet is local work. See createWallet().
      const created = await createWallet();
      setStep({ name: 'backup', ...created });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
      setStep({ name: 'choose' });
    }
  }, [pubkey]);

  /**
   * Advertise the wallet's address as a NIP-A3 Monero payment target, unless
   * the user has already declared one — see `useEnsurePaymentTarget`.
   *
   * Asked for up front rather than reported in a toast afterwards. Publishing
   * ties a Nostr identity to a Monero address in public and permanently — the
   * wallet has no subaddresses yet, so this is the one address everything is
   * received on, forever. Defaulting the checkbox to on keeps the behaviour
   * most people want; putting it on screen *before* the publish is what makes
   * it a choice.
   *
   * Deliberately cannot fail the setup flow. By the time this runs the seed is
   * already saved, and a relay hiccup while publishing a donation address must
   * not look like the wallet itself didn't work.
   */
  const announceTarget = useCallback(
    async (address: string): Promise<boolean> => {
      if (!publishAddress) return false;
      try {
        return (await ensurePaymentTarget({ type: 'monero', authority: address })) === 'added';
      } catch (err) {
        console.warn('Failed to publish Monero payment target:', err);
        return false;
      }
    },
    [publishAddress, ensurePaymentTarget],
  );

  /**
   * Recover gracefully when a create/restore finds the wallet already exists.
   *
   * By the time this fires, `publishRecord` has already pushed the found event
   * into the query cache, so the wallet is loading behind the dialog. All that
   * is left is to reassure the user, who reached this screen believing they
   * had no wallet, that nothing was lost, and get out of the way. Deliberately
   * a positive toast, not the red error box the setup flow uses for failures.
   */
  const handleAlreadyExists = useCallback(() => {
    toast({
      title: intl.formatMessage({
        id: 'monero.setup.alreadyExists.title',
        defaultMessage: 'Your wallet is already here',
      }),
      description: intl.formatMessage({
        id: 'monero.setup.alreadyExists.description',
        defaultMessage:
          "This account's Monero wallet is backed up to your Nostr account. Nothing was lost, and there's no need to restore. Loading it now.",
      }),
    });
    onComplete?.();
    handleClose();
  }, [toast, intl, onComplete, handleClose]);

  /** Publish the record for a newly-created wallet. */
  const handleFinishCreate = useCallback(async () => {
    if (step.name !== 'backup') return;
    if (!assertSameAccount()) return;
    setError(null);
    try {
      await createRecord.mutateAsync({
        seed: step.seed,
        address: step.address,
        restoreHeight: step.restoreHeight,
        cachePassword: step.cachePassword,
        hasPassphrase: false,
      });
      const announced = await announceTarget(step.address);
      toast({
        title: intl.formatMessage({
          id: 'monero.setup.created.title',
          defaultMessage: 'Monero wallet created',
        }),
        description: announced
          ? intl.formatMessage({
              id: 'monero.setup.created.description.announced',
              defaultMessage:
                'Encrypted to your account. Your address is now on your profile so people can send you Monero.',
            })
          : intl.formatMessage({
              id: 'monero.setup.created.description',
              defaultMessage: 'Your wallet is encrypted and synced to your Nostr account.',
            }),
      });
      onComplete?.();
      handleClose();
    } catch (err) {
      if (err instanceof MoneroWalletExistsError) {
        handleAlreadyExists();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to save wallet');
    }
  }, [
    step,
    assertSameAccount,
    createRecord,
    announceTarget,
    toast,
    intl,
    onComplete,
    handleClose,
    handleAlreadyExists,
  ]);

  /** Validate and publish a restored wallet. */
  const handleRestore = useCallback(async () => {
    setError(null);
    startedFor.current = pubkey;

    const seed = seedInput.trim().replace(/\s+/g, ' ');
    const wordCount = seed ? seed.split(' ').length : 0;
    // Monero's legacy mnemonic is 25 words (24 + a checksum word); Polyseed is
    // 16. We accept both lengths and let monero-ts do the real validation,
    // rather than rejecting a valid seed on a word count we guessed wrong.
    if (wordCount !== 25 && wordCount !== 16) {
      setError(
        intl.formatMessage({
          id: 'monero.setup.error.wordCount',
          defaultMessage: 'A Monero seed is 25 words (or 16 for Polyseed).',
        }),
      );
      return;
    }

    const restoreHeight = restoreHeightInput.trim() ? Number(restoreHeightInput.trim()) : 0;
    if (!Number.isInteger(restoreHeight) || restoreHeight < 0) {
      setError(
        intl.formatMessage({
          id: 'monero.setup.error.height',
          defaultMessage: 'Restore height must be a whole number.',
        }),
      );
      return;
    }

    setStep({ name: 'restoring' });
    try {
      const { address, cachePassword } = await restoreWallet(seed, {
        restoreHeight,
        passphrase: passphrase || undefined,
      });

      // Deriving the address is slow enough to switch accounts under.
      if (!assertSameAccount()) return;

      await createRecord.mutateAsync({
        seed,
        address,
        restoreHeight,
        cachePassword,
        hasPassphrase: !!passphrase,
      });

      const announced = await announceTarget(address);
      toast({
        title: intl.formatMessage({
          id: 'monero.setup.restored.title',
          defaultMessage: 'Monero wallet restored',
        }),
        description: announced
          ? intl.formatMessage({
              id: 'monero.setup.restored.description.announced',
              defaultMessage:
                'Scanning the blockchain now. Your address is also on your profile so people can send you Monero.',
            })
          : intl.formatMessage({
              id: 'monero.setup.restored.description',
              defaultMessage: 'Scanning the blockchain now — this can take a while.',
            }),
      });
      onComplete?.();
      handleClose();
    } catch (err) {
      if (err instanceof MoneroWalletExistsError) {
        handleAlreadyExists();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to restore wallet');
      setStep({ name: 'restore' });
    }
  }, [
    pubkey,
    seedInput,
    restoreHeightInput,
    passphrase,
    assertSameAccount,
    createRecord,
    announceTarget,
    toast,
    intl,
    onComplete,
    handleClose,
    handleAlreadyExists,
  ]);

  const copySeed = useCallback(async () => {
    if (step.name !== 'backup') return;
    try {
      await navigator.clipboard.writeText(step.seed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: intl.formatMessage({
          id: 'monero.setup.copyFailed',
          defaultMessage: 'Copy failed',
        }),
        description: intl.formatMessage({
          id: 'monero.setup.copyFailed.description',
          defaultMessage: 'Please write the words down manually.',
        }),
        variant: 'destructive',
      });
    }
  }, [step, toast, intl]);

  /**
   * Consent row for announcing the address, shown on both finish screens.
   */
  const publishAddressField = (
    <label className="flex items-start gap-3 cursor-pointer">
      <Checkbox
        checked={publishAddress}
        onCheckedChange={(checked) => setPublishAddress(checked === true)}
        className="mt-0.5"
      />
      <span className="text-sm text-muted-foreground">
        <FormattedMessage
          id="monero.setup.publishAddress"
          defaultMessage="Put this address on my profile so people can send me Monero. It will be public."
        />
      </span>
    </label>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage id="monero.setup.title" defaultMessage="Set up Monero" />
          </DialogTitle>
          <DialogDescription>
            {step.name === 'restore' || step.name === 'restoring' ? (
              <FormattedMessage
                id="monero.setup.description.restore"
                defaultMessage="Enter an existing Monero seed to restore your wallet."
              />
            ) : (
              <FormattedMessage
                id="monero.setup.description"
                defaultMessage="Your wallet is encrypted to your account, so it follows you across devices."
              />
            )}
          </DialogDescription>
        </DialogHeader>

        {!canEncrypt && (
          <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <ShieldAlert className="size-5 shrink-0 text-destructive" />
            <p className="text-sm text-muted-foreground">
              <FormattedMessage
                id="monero.setup.noNip44"
                defaultMessage="Your signer doesn't support NIP-44 encryption, which is required to store a Monero wallet securely."
              />
            </p>
          </div>
        )}

        {error && (
          <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {step.name === 'choose' && (
          <div className="grid gap-3">
            <Button onClick={handleCreate} disabled={!canEncrypt} className="w-full justify-start h-auto py-3">
              <Plus className="size-4 mr-3 shrink-0" />
              <span className="text-left">
                <span className="block font-medium">
                  <FormattedMessage id="monero.setup.create" defaultMessage="Create a new wallet" />
                </span>
                <span className="block text-xs font-normal opacity-80">
                  <FormattedMessage
                    id="monero.setup.create.hint"
                    defaultMessage="Generates a fresh seed. Nothing to scan."
                  />
                </span>
              </span>
            </Button>

            <Button
              variant="outline"
              onClick={() => setStep({ name: 'restore' })}
              disabled={!canEncrypt}
              className="w-full justify-start h-auto py-3"
            >
              <RotateCcw className="size-4 mr-3 shrink-0" />
              <span className="text-left">
                <span className="block font-medium">
                  <FormattedMessage id="monero.setup.restore" defaultMessage="Restore from seed" />
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  <FormattedMessage
                    id="monero.setup.restore.hint"
                    defaultMessage="Import an existing wallet from its 25-word seed."
                  />
                </span>
              </span>
            </Button>
          </div>
        )}

        {step.name === 'creating' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              <FormattedMessage
                id="monero.setup.creating"
                defaultMessage="Generating your wallet…"
              />
            </p>
          </div>
        )}

        {step.name === 'backup' && (
          <div className="grid gap-4">
            <div className="flex gap-3 rounded-lg border border-orange-500/40 bg-orange-500/5 p-3">
              <AlertTriangle className="size-5 shrink-0 text-orange-500" />
              <p className="text-sm text-muted-foreground">
                <FormattedMessage
                  id="monero.setup.backup.warning"
                  defaultMessage="Write these 25 words down and keep them offline. They are the only way to recover your funds."
                />
              </p>
            </div>

            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="font-mono text-sm leading-relaxed break-words select-all">{step.seed}</p>
            </div>

            <Button variant="outline" size="sm" onClick={copySeed} className="w-full">
              {copied ? (
                <>
                  <Check className="size-3.5 mr-1.5 text-green-500" />
                  <FormattedMessage id="monero.setup.copied" defaultMessage="Copied" />
                </>
              ) : (
                <>
                  <Copy className="size-3.5 mr-1.5" />
                  <FormattedMessage id="monero.setup.copySeed" defaultMessage="Copy seed" />
                </>
              )}
            </Button>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={confirmedBackup}
                onCheckedChange={(checked) => setConfirmedBackup(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm text-muted-foreground">
                <FormattedMessage
                  id="monero.setup.backup.confirm"
                  defaultMessage="I've saved my seed somewhere safe."
                />
              </span>
            </label>

            {publishAddressField}

            <Button
              onClick={handleFinishCreate}
              disabled={!confirmedBackup || createRecord.isPending}
              className="w-full"
            >
              {createRecord.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              <FormattedMessage id="monero.setup.finish" defaultMessage="Finish setup" />
            </Button>
          </div>
        )}

        {(step.name === 'restore' || step.name === 'restoring') && (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="monero-seed">
                <FormattedMessage id="monero.setup.seedLabel" defaultMessage="Seed phrase" />
              </Label>
              <Textarea
                id="monero-seed"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder={intl.formatMessage({
                  id: 'monero.setup.seedPlaceholder',
                  defaultMessage: 'Enter your 25-word Monero seed…',
                })}
                rows={4}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-sm resize-none"
                disabled={step.name === 'restoring'}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="monero-restore-height">
                <FormattedMessage
                  id="monero.setup.heightLabel"
                  defaultMessage="Restore height (optional)"
                />
              </Label>
              <Input
                id="monero-restore-height"
                value={restoreHeightInput}
                onChange={(e) => setRestoreHeightInput(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0"
                inputMode="numeric"
                disabled={step.name === 'restoring'}
              />
              <p className="text-xs text-muted-foreground">
                <FormattedMessage
                  id="monero.setup.heightHint"
                  defaultMessage="The block your wallet was created at. Leaving this blank scans from the beginning of the chain, which is very slow."
                />
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="monero-passphrase">
                <FormattedMessage
                  id="monero.setup.passphraseLabel"
                  defaultMessage="Passphrase (optional)"
                />
              </Label>
              <Input
                id="monero-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="off"
                disabled={step.name === 'restoring'}
              />
              <p className="text-xs text-muted-foreground">
                <FormattedMessage
                  id="monero.setup.passphraseHint"
                  defaultMessage="Only if you set one. The same seed with a different passphrase is a completely different wallet."
                />
              </p>
            </div>

            {publishAddressField}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep({ name: 'choose' })}
                disabled={step.name === 'restoring'}
                className="flex-1"
              >
                <FormattedMessage id="monero.setup.back" defaultMessage="Back" />
              </Button>
              <Button
                onClick={handleRestore}
                disabled={step.name === 'restoring' || !seedInput.trim()}
                className="flex-1"
              >
                {step.name === 'restoring' && <Loader2 className="size-4 mr-2 animate-spin" />}
                <FormattedMessage id="monero.setup.restoreAction" defaultMessage="Restore" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
