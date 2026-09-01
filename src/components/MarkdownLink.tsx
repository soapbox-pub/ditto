import type { ReactNode } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { stripTrackingParams } from '@/lib/trackingParams';
import { cn } from '@/lib/utils';

/**
 * A markdown `[text](url)` link, used as react-markdown's `a` override (see
 * `buildMarkdownComponents`). Unsafe schemes are dropped, and the href is
 * canonicalized before it is rendered or followed so a shared URL's tracking
 * parameters don't ride along. Its own component, rather than a closure inside
 * the overrides object, so it can read the setting from context.
 */
export function MarkdownLink({
  href,
  children,
  node: _node,
  ...rest
}: { href?: string; children?: ReactNode; node?: unknown } & Record<string, unknown>) {
  const { config } = useAppContext();

  const safe = sanitizeUrl(href);
  if (!safe) {
    // Unsafe href — render label as plain text so we don't emit a dead/dangerous link.
    return <span>{children}</span>;
  }

  const url = config.stripTrackingParams !== false ? stripTrackingParams(safe) : safe;

  return (
    <a
      {...rest}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'text-primary no-underline hover:underline break-all',
        rest.className as string | undefined,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}
