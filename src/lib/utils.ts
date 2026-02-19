import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sticky header class for pages inside MainLayout.
 * Headers stick to the top of the viewport on all screen sizes.
 * Includes safe-area-top for mobile devices with notches/status bars.
 */
export const STICKY_HEADER_CLASS = 'sticky top-0 safe-area-top';
