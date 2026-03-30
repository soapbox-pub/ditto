import React from 'react';

/**
 * Ink pen / fountain pen icon — used for letter compose actions.
 * Rendered as a standard lucide-style SVG component.
 */
export const InkPenIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
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
      <path d="M17.9 8H9.2m-4.1 4H14l8-8.2c-2.3-2.3-6.1-2.3-8.5 0L2 15m0 4h8m11-2v1c0 1 1 1.5 1 2.5c0 .8-.7 1.5-1.5 1.5h-5c-.8 0-1.5-.7-1.5-1.5c0-1 1-1.5 1-2.5v-1m-1 0h8" />
    </svg>
  ),
);

InkPenIcon.displayName = 'InkPenIcon';
