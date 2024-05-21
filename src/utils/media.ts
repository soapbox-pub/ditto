import { typeByExtension } from '@std/media-types';

/** Get media type of the filename in the URL by its extension, if any. */
export function getUrlMediaType(url: string): string | undefined {
  try {
    const { pathname } = new URL(url);
    const ext = pathname.split('.').pop() ?? '';
    return typeByExtension(ext);
  } catch {
    return undefined;
  }
}

/**
 * Check if the base type matches any of the permitted types.
 *
 * ```ts
 * isPermittedMediaType('image/png', ['image', 'video']); // true
 * ```
 */
export function isPermittedMediaType(mediaType: string, permitted: string[]): boolean {
  const [baseType, _subType] = mediaType.split('/');
  return permitted.includes(baseType);
}
