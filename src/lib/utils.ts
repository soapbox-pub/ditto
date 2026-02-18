import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sticky header class for pages inside MainLayout.
 * On mobile, page headers scroll naturally with the content.
 * On desktop (sidebar breakpoint) they stick to the top of the viewport.
 */
export const STICKY_HEADER_CLASS = 'sidebar:sticky sidebar:top-0';
