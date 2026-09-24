import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Ban, Check, MoreVertical, Server, X } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useBlockedRelays } from '@/hooks/useBlockedRelays';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useRelayInfo } from '@/hooks/useRelayInfo';
import { useListErrorMessage } from '@/hooks/useListErrorMessage';
import { useToast } from '@/hooks/useToast';
import { renderRelayUrl } from '@/lib/relayList';
import {
  answerRelayAuth,
  getBlockedRelays,
  getPendingRelayAuth,
  setBlockedRelays,
  subscribeRelayAuth,
} from '@/lib/relayPolicy';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

/**
 * Asks whether a relay may authenticate the user (NIP-42), when the relay
 * sign-in policy is "Ask". A bottom sheet on mobile and a corner card on
 * desktop; non-modal, so the app stays usable while relays connect.
 */
export function RelayAuthPrompt() {
  const pending = useSyncExternalStore(subscribeRelayAuth, getPendingRelayAuth);
  if (!pending) return null;
  // Keyed per relay so the "Remember" checkbox resets between prompts.
  return <RelayAuthCard key={pending.url} url={pending.url} waiting={pending.total - 1} />;
}

interface RelayAuthCardProps {
  url: string;
  /** Other relays waiting after this one (floating card only). */
  waiting?: number;
  /** `inline` renders in the page flow, e.g. in place of a relay's feed. */
  variant?: 'floating' | 'inline';
  /** Called after the user answers or blocks the relay. */
  onAnswered?: () => void;
}

export function RelayAuthCard({ url, waiting = 0, variant = 'floating', onAnswered }: RelayAuthCardProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const listErrorMessage = useListErrorMessage();
  const [remember, setRemember] = useState(false);
  // Unique ids: the inline card and a floating card can be on screen together.
  const titleId = useId();
  const descriptionId = useId();
  const rememberId = useId();
  const { data: info } = useRelayInfo(url);
  const { blockRelay, isUpdating } = useBlockedRelays();
  const { user } = useCurrentUser();

  const host = renderRelayUrl(url);
  const name = info?.name?.trim() || host;
  const icon = useMemo(() => sanitizeUrl(info?.icon), [info?.icon]);

  const answer = (allowed: boolean) => {
    answerRelayAuth(url, { allowed, remember });
    onAnswered?.();
  };

  // Blocking declines this sign-in and adds the relay to the user's blocked
  // relays list, so Ditto stops connecting to it.
  const handleBlock = async () => {
    try {
      await blockRelay(url);
      answerRelayAuth(url, { allowed: false, remember: false });
      // Apply the block now rather than after the list is re-fetched. The
      // pool closes the open connection when the blocked set changes.
      setBlockedRelays(user?.pubkey, [...getBlockedRelays(), url]);
      onAnswered?.();
      toast({
        title: intl.formatMessage({ id: 'relayAuth.prompt.blocked', defaultMessage: 'Relay blocked' }),
        description: intl.formatMessage({ id: 'relayAuth.prompt.blockedDescription', defaultMessage: 'Manage blocked relays in Settings → Network.' }),
      });
    } catch (error) {
      toast({
        title: intl.formatMessage({ id: 'settings.network.blockedRelays.failed', defaultMessage: 'Could not update blocked relays' }),
        description: listErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <div
      // Non-modal: focus stays where it is, so this is a labelled region that
      // announces itself rather than an alertdialog, which implies a trap.
      role="region"
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        variant === 'floating'
          ? 'fixed inset-x-0 bottom-0 z-[100] rounded-t-2xl border-t bg-card p-4 pb-[calc(1rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))] shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 sidebar:inset-x-auto sidebar:bottom-6 sidebar:right-6 sidebar:w-96 sidebar:rounded-xl sidebar:border sidebar:pb-4'
          : 'mx-auto w-full max-w-sm p-4 motion-safe:animate-in motion-safe:fade-in',
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar className="size-10 shrink-0 border border-border/70">
          <AvatarImage src={icon} alt="" />
          <AvatarFallback>
            <Server className="size-5 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-sm font-semibold">
            {/* Truncate only the name, so the rest of the sentence stays visible. */}
            <FormattedMessage
              id="relayAuth.prompt.title"
              defaultMessage="{relay} wants you to sign in"
              values={{ relay: <span className="inline-block max-w-full truncate align-bottom" title={name}>{name}</span> }}
            />
          </p>
          {name !== host && <p className="truncate text-xs text-muted-foreground">{host}</p>}
        </div>
        {waiting > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <FormattedMessage id="relayAuth.prompt.waiting" defaultMessage="+{count} more" values={{ count: waiting }} />
          </span>
        )}
      </div>

      <p id={descriptionId} className="mt-3 text-xs leading-relaxed text-muted-foreground">
        <FormattedMessage
          id="relayAuth.prompt.description"
          defaultMessage="Signing in lets this relay see which account is connected."
        />
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Checkbox id={rememberId} checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} />
        <Label htmlFor={rememberId} className="cursor-pointer select-none text-xs text-muted-foreground">
          <FormattedMessage id="relayAuth.prompt.remember" defaultMessage="Remember for this relay" />
        </Label>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="flex-1 gap-1.5" onClick={() => answer(false)}>
          <X className="size-3.5" aria-hidden />
          <FormattedMessage id="relayAuth.prompt.deny" defaultMessage="Don't allow" />
        </Button>
        <Button className="flex-1 gap-1.5" onClick={() => answer(true)}>
          <Check className="size-3.5" aria-hidden />
          <FormattedMessage id="relayAuth.prompt.allow" defaultMessage="Allow" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground"
              aria-label={intl.formatMessage({ id: 'relayAuth.prompt.more', defaultMessage: 'More options' })}
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => void handleBlock()}
              disabled={isUpdating}
              className="text-destructive focus:text-destructive"
            >
              <Ban className="mr-2 size-4" aria-hidden />
              <FormattedMessage id="relayAuth.prompt.block" defaultMessage="Block relay" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
