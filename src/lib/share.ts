/**
 * Share a URL using the native Web Share API when available,
 * falling back to copying to clipboard.
 *
 * @returns `'shared'` if the native share sheet was used,
 *          `'copied'` if the URL was copied to clipboard,
 *          `'cancelled'` if the user dismissed the share sheet.
 */
export async function shareOrCopy(url: string, title?: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (navigator.share) {
    try {
      await navigator.share({ url, title });
      return 'shared';
    } catch (error) {
      // User cancelled the share sheet — not an error
      if (error instanceof Error && error.name === 'AbortError') {
        return 'cancelled';
      }
      // Some other error — fall through to clipboard
    }
  }

  await navigator.clipboard.writeText(url);
  return 'copied';
}
