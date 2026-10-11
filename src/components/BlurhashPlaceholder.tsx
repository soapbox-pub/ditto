import { memo, useMemo } from 'react';
import { decodeBlurhash } from '@/lib/blurhash';

interface BlurhashPlaceholderProps {
  /** A blurhash already checked with `isValidBlurhash`. */
  hash: string;
  className?: string;
  style?: React.CSSProperties;
}

/** A blurhash stretched to fill its box. Position and size it with `className` / `style`. */
export const BlurhashPlaceholder = memo(function BlurhashPlaceholder({ hash, className, style }: BlurhashPlaceholderProps) {
  const url = useMemo(() => decodeBlurhash(hash), [hash]);
  return (
    <div
      aria-hidden
      className={className}
      style={{
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: '100% 100%',
        ...style,
      }}
    />
  );
});
