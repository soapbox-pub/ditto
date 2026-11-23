import React from 'react';

/**
 * Armada logo (sail over three wave lines), from Armada's favicon.
 * Rendered as a filled SVG component using currentColor.
 */
export const ArmadaIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 128 128"
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M64 4.225l-39.97 88.5h17.13l2.31-5.2 2.76-6.22-2.22-1.43-1.42-12.84h9.99l4.89-11.01L64 41.335l11.42 25.7h9.99l-1.43 12.84-2.22 1.43 2.77 6.22 2.31 5.2h17.13z" />
      <path d="M76.84 79.165c-.15 0-.31-.05-.44-.15l-12.41-9.65-12.41 9.65c-.31.24-.76.19-1-.13a.706.706 0 0 1 .13-1l12.85-9.99c.26-.2.62-.2.88 0l12.85 9.99a.715.715 0 0 1-.43 1.28z" />
      <path d="M95.4 104.865H32.59c-1.18 0-2.14-.96-2.14-2.14s.96-2.14 2.14-2.14H95.4c1.18 0 2.14.96 2.14 2.14s-.96 2.14-2.14 2.14z" />
      <path d="M83.98 115.565H44.01a1.43 1.43 0 1 1 0-2.86h39.97a1.43 1.43 0 1 1 0 2.86z" />
      <path d="M73.99 123.775H54.01a1.071 1.071 0 0 1 0-2.14h19.98a1.071 1.071 0 0 1 0 2.14z" />
    </svg>
  ),
);

ArmadaIcon.displayName = 'ArmadaIcon';
