import { cn } from '@/lib/utils';

interface MewLogoProps {
  className?: string;
  size?: number;
}

/** The Mew cat-paw/connection logo, matching the screenshot's abstract connected nodes icon. */
export function MewLogo({ className, size = 40 }: MewLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-foreground', className)}
    >
      {/* Connecting lines */}
      <line x1="14" y1="14" x2="34" y2="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="14" y1="14" x2="14" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="14" y1="14" x2="34" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="34" y1="14" x2="34" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="14" y1="34" x2="34" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="34" y1="14" x2="14" y2="34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

      {/* Nodes */}
      <circle cx="14" cy="14" r="5" fill="currentColor" />
      <circle cx="34" cy="14" r="5" fill="currentColor" />
      <circle cx="14" cy="34" r="5" fill="currentColor" />
      <circle cx="34" cy="34" r="5" fill="currentColor" />
      <circle cx="24" cy="24" r="4" fill="currentColor" />
    </svg>
  );
}
