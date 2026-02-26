import React from 'react';

/**
 * Planet icon from @lucide/lab — used for the Feed nav item.
 * Rendered as a standard lucide-style SVG component.
 */
export const PlanetIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
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
      <circle cx="12" cy="12" r="8" />
      <path d="M4.05 13c-1.7 1.8-2.5 3.5-1.8 4.5c1.1 1.9 6.4 1 11.8-2s8.9-7.1 7.7-9c-.6-1-2.4-1.2-4.7-.7" />
    </svg>
  ),
);

PlanetIcon.displayName = 'PlanetIcon';
