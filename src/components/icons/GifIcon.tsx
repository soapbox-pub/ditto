import React from 'react';

/**
 * GIF icon — bold "GIF" text, no border.
 * Rendered as a standard lucide-style SVG component.
 */
export const GifIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 140"
      width={24}
      height={24}
      className={className}
      {...props}
    >
      <text
        x="100" y="118"
        fontFamily="Arial Black, Arial, sans-serif"
        fontWeight="900"
        fontSize="120"
        fill="currentColor"
        textAnchor="middle"
        dominantBaseline="auto"
        letterSpacing="-4"
      >GIF</text>
    </svg>
  ),
);

GifIcon.displayName = 'GifIcon';
