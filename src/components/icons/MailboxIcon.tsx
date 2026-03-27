import React from 'react';

/**
 * Mailbox icon from lief — a rounded post-box with a flag.
 * Rendered as a standard lucide-style SVG component.
 */
export const MailboxIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
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
      <path d="M20 5.5A4 4 0 0 1 22 9v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a4 4 0 0 1 8 0v8a2 2 0 0 1-2 2M6 5h4" />
      <path d="M14 9V5h2v1h-2" />
    </svg>
  ),
);

MailboxIcon.displayName = 'MailboxIcon';
