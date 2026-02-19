import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sticky header class for pages inside MainLayout.
 * Headers stick to the top of the viewport on all screen sizes.
 */
export const STICKY_HEADER_CLASS = 'sticky top-0';
