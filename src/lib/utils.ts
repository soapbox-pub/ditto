import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sticky header offset class for pages inside MainLayout.
 * On mobile the MobileTopBar is h-10 (40px) and sticky at top-0,
 * so page-level sticky headers must sit below it.
 * On desktop (sidebar breakpoint) the top bar is hidden, so top-0 applies.
 */
export const STICKY_HEADER_CLASS = 'sticky top-10 sidebar:top-0';
