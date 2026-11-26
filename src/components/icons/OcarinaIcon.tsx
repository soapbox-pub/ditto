import React from 'react';

/**
 * A sweet-potato ocarina, mouthpiece to the left, in the stroke style of
 * lucide's icons. Used for ocarina songs (kind 1853).
 */
export const OcarinaIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M7.5 9.2C9.4 6.6 13 5.6 16.4 6.4c3.6.9 5.6 3.9 4.9 6.9-.7 3.1-4.2 5-8.1 4.6C9.4 17.5 6.6 15 6.3 12.6" />
      <path d="M7.5 9.2 3.6 8.1a1 1 0 0 0-1.2 1.2l.6 2.2a1 1 0 0 0 1.1.7l2.2-.6" />
      <circle cx="11.5" cy="10.5" r=".6" fill="currentColor" />
      <circle cx="14.5" cy="9.5" r=".6" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".6" fill="currentColor" />
      <circle cx="13" cy="14" r=".6" fill="currentColor" />
    </svg>
  ),
);

OcarinaIcon.displayName = 'OcarinaIcon';
