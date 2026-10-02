import { FormattedMessage } from 'react-intl';
import { ShieldX } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BlockedSearchNoticeProps {
  className?: string;
}

/**
 * Shown in place of results when a search or hashtag contains a blocked term
 * (see `containsBlockedTerm`). Nothing was sent to any relay or service.
 */
export function BlockedSearchNotice({ className }: BlockedSearchNoticeProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-8 py-16 text-center', className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <ShieldX className="size-6 text-destructive" />
      </div>
      <div className="max-w-sm space-y-2">
        <h2 className="text-lg font-semibold">
          <FormattedMessage id="blockedSearch.title" defaultMessage="Search blocked" />
        </h2>
        <p className="text-sm text-muted-foreground">
          <FormattedMessage
            id="blockedSearch.description"
            defaultMessage="Child sexual abuse material is illegal and causes real harm to children. Ditto doesn't allow searching for it."
          />
        </p>
      </div>
    </div>
  );
}
