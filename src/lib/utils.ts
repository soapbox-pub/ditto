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

/**
 * Extracts the domain from a NIP-05 identifier.
 * @param nip05 - The NIP-05 identifier (e.g., "user@domain.com")
 * @returns The domain part of the NIP-05 identifier, or undefined if invalid
 */
export function getNip05Domain(nip05: string | undefined): string | undefined {
  if (!nip05) return undefined;
  const atIndex = nip05.indexOf('@');
  if (atIndex === -1) return undefined;
  return nip05.slice(atIndex + 1);
}

/**
 * Gets the favicon URL for a domain using Google's favicon service.
 * @param domain - The domain to get the favicon for
 * @returns The favicon URL
 */
export function getDomainFavicon(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
}
