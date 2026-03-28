import React from 'react';

/**
 * Chest icon from @lucide/lab — used for Treasures.
 * Rendered as a standard lucide-style SVG component.
 */
export const ChestIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M8 19a2 2 0 0 0 2-2V9a4 4 0 0 0-8 0v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a4 4 0 0 0-4-4H6" />
      <path d="M2 11h20" />
      <path d="M16 11v3" />
    </svg>
  ),
);

ChestIcon.displayName = 'ChestIcon';
