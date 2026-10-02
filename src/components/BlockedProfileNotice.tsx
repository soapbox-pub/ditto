import { FormattedMessage } from 'react-intl';
import { ShieldX } from 'lucide-react';

/**
 * Replaces a profile that `isBlockedProfile` flagged. Unlike a content warning,
 * there is no way to reveal what's behind it.
 */
export function BlockedProfileNotice() {
  return (
    <div className="flex flex-col items-center gap-4 px-8 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <ShieldX className="size-6 text-destructive" />
      </div>
      <div className="max-w-sm space-y-2">
        <h1 className="text-lg font-semibold">
          <FormattedMessage id="blockedProfile.title" defaultMessage="This profile is unavailable" />
        </h1>
        <p className="text-sm text-muted-foreground">
          <FormattedMessage
            id="blockedProfile.description"
            defaultMessage="This account appears to promote sexual exploitation, so its profile and posts are hidden."
          />
        </p>
      </div>
    </div>
  );
}
