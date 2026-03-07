/**
 * Utility for merging CSS class names
 * Self-contained implementation with no external dependencies
 */

export function cn(...classes: Array<string | undefined | null | false>): string {
  return classes.filter(Boolean).join(' ');
}
