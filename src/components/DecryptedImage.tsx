import { useBlossomFallback } from '@/hooks/useBlossomFallback';
import { useDecryptedFile } from '@/hooks/useDecryptedFile';
import { EncryptedFileNotice } from '@/components/EncryptedFileNotice';
import type { FileEncryption } from '@/lib/encryptedFile';

type ImgProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>;

interface DecryptedImageProps extends ImgProps {
  url: string;
  /** Present when `url` serves ciphertext that must be decrypted to render. */
  encryption?: FileEncryption;
  /**
   * Defer decryption until true — for off-screen tiles. Defaults to true.
   */
  enabled?: boolean;
  /** Extra classes for the notice shown in place of an undecryptable image. */
  noticeClassName?: string;
  /**
   * Render the notice absolutely positioned to fill the parent. Only for
   * parents that are `relative` and already have a size — otherwise the notice
   * flows as a block, which is the default.
   */
  noticeFill?: boolean;
}

/**
 * An `<img>` that transparently decrypts an encrypted attachment.
 *
 * Drop-in for the plain `<img src={url}>` sites that render imeta media
 * directly rather than going through `ImageGallery`. Unencrypted URLs keep the
 * usual Blossom cross-server fallback; encrypted ones render a notice instead
 * of a broken image while they decrypt or if they can't be decrypted.
 */
export function DecryptedImage({
  url,
  encryption,
  enabled,
  noticeClassName,
  noticeFill,
  onError,
  ...props
}: DecryptedImageProps) {
  const fallback = useBlossomFallback(url);
  const decrypted = useDecryptedFile(url, encryption, { enabled });

  if (decrypted.encrypted && !decrypted.src) {
    return (
      <EncryptedFileNotice
        fill={noticeFill}
        loading={decrypted.loading}
        unsupported={decrypted.unsupported}
        tooLarge={decrypted.tooLarge}
        byteSize={decrypted.byteSize}
        onDecryptAnyway={decrypted.decryptAnyway}
        className={noticeClassName}
      />
    );
  }

  return (
    <img
      {...props}
      src={decrypted.encrypted ? decrypted.src : fallback.src}
      onError={(e) => {
        if (!decrypted.encrypted) fallback.onError();
        onError?.(e);
      }}
    />
  );
}
