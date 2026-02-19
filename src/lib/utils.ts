import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sticky header class for pages inside MainLayout.
 * On mobile, sticks below the top bar (accounting for safe area).
 * On desktop (sidebar+), sticks to the top of the viewport.
 */
export const STICKY_HEADER_CLASS = 'sticky top-mobile-bar sidebar:top-0';
