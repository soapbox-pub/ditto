import { Lock, LockKeyholeOpen, ShieldAlert } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

import { cn } from '@/lib/utils';

interface EncryptedFileNoticeProps {
  /** Decryption in flight. */
  loading?: boolean;
  /** Encrypted with an algorithm this client doesn't implement. */
  unsupported?: boolean;
  /**
   * Stretch to fill a positioned parent instead of flowing as a block. Use for
   * gallery tiles and lightbox slots, which size themselves.
   */
  fill?: boolean;
  className?: string;
}

/**
 * Stand-in for an encrypted attachment that isn't showing its contents — while
 * it decrypts, or because it can't be decrypted.
 *
 * A failed decryption must never fall back to rendering the source URL: that
 * URL serves ciphertext, so the user would get a broken image at best.
 */
export function EncryptedFileNotice({ loading, unsupported, fill, className }: EncryptedFileNoticeProps) {
  const Icon = loading ? Lock : unsupported ? ShieldAlert : LockKeyholeOpen;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 bg-muted/50 text-muted-foreground',
        fill
          ? 'absolute inset-0'
          : 'my-2 min-h-32 rounded-xl border border-dashed border-border px-6 py-8',
        className,
      )}
    >
      <Icon className={cn('size-5 shrink-0', loading && 'motion-safe:animate-pulse')} aria-hidden />
      <p className="text-sm text-center text-balance">
        {loading
          ? <FormattedMessage id="encryptedFile.decrypting" defaultMessage="Decrypting…" />
          : unsupported
            ? <FormattedMessage id="encryptedFile.unsupported" defaultMessage="This file uses an encryption method Ditto doesn't support." />
            : <FormattedMessage id="encryptedFile.failed" defaultMessage="This encrypted file couldn't be decrypted." />}
      </p>
    </div>
  );
}
