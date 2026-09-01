import { HardDrive, Lock, LockKeyholeOpen, ShieldAlert } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/formatBytes';
import { cn } from '@/lib/utils';

interface EncryptedFileNoticeProps {
  /** Decryption in flight. */
  loading?: boolean;
  /** Encrypted with an algorithm this client doesn't implement. */
  unsupported?: boolean;
  /** Past the size cap — offers `onDecryptAnyway` when one is given. */
  tooLarge?: boolean;
  /** File size in bytes, shown alongside the too-large message. */
  byteSize?: number;
  /** Decrypt despite the size cap. Omit to render the message without a button. */
  onDecryptAnyway?: () => void;
  /**
   * Stretch to fill a positioned parent instead of flowing as a block. Use for
   * gallery tiles and lightbox slots, which size themselves.
   */
  fill?: boolean;
  className?: string;
}

/**
 * Stand-in for an encrypted attachment that isn't showing its contents — while
 * it decrypts, because it can't be decrypted, or because it's large enough that
 * we want the user to opt in before pulling it into memory.
 *
 * A failed decryption must never fall back to rendering the source URL: that
 * URL serves ciphertext, so the user would get a broken image at best.
 */
export function EncryptedFileNotice({
  loading,
  unsupported,
  tooLarge,
  byteSize,
  onDecryptAnyway,
  fill,
  className,
}: EncryptedFileNoticeProps) {
  const Icon = loading ? Lock : tooLarge ? HardDrive : unsupported ? ShieldAlert : LockKeyholeOpen;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 bg-muted/50 text-muted-foreground',
        fill
          ? 'absolute inset-0 p-4'
          : 'my-2 min-h-32 rounded-xl border border-dashed border-border px-6 py-8',
        className,
      )}
    >
      <Icon className={cn('size-5 shrink-0', loading && 'motion-safe:animate-pulse')} aria-hidden />
      <p className="text-sm text-center text-balance">
        {loading
          ? <FormattedMessage id="encryptedFile.decrypting" defaultMessage="Decrypting…" />
          : tooLarge
            ? (
              byteSize === undefined
                ? <FormattedMessage id="encryptedFile.tooLarge" defaultMessage="This encrypted file is large. Decrypting it may use a lot of memory." />
                : <FormattedMessage
                    id="encryptedFile.tooLargeWithSize"
                    defaultMessage="This encrypted file is {size}. Decrypting it may use a lot of memory."
                    values={{ size: formatBytes(byteSize) }}
                  />
            )
            : unsupported
              ? <FormattedMessage id="encryptedFile.unsupported" defaultMessage="This file uses an encryption method Ditto doesn't support." />
              : <FormattedMessage id="encryptedFile.failed" defaultMessage="This encrypted file couldn't be decrypted." />}
      </p>
      {tooLarge && onDecryptAnyway && (
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDecryptAnyway(); }}
        >
          <FormattedMessage id="encryptedFile.decryptAnyway" defaultMessage="Decrypt anyway" />
        </Button>
      )}
    </div>
  );
}
