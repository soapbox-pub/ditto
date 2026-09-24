import { useState, type ReactNode } from 'react';
import { defineMessage, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { Ban, Lock, Plus, X } from 'lucide-react';

import { ListNotice } from '@/components/ListNotice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppContext } from '@/hooks/useAppContext';
import { useBlockedRelays } from '@/hooks/useBlockedRelays';
import { useListErrorMessage } from '@/hooks/useListErrorMessage';
import { useToast } from '@/hooks/useToast';
import { renderRelayUrl } from '@/lib/relayList';
import { DEFAULT_RELAY_AUTH_POLICY, normalizeRelayUrl, type RelayAuthPolicy } from '@/lib/relayPolicy';

const AUTH_POLICY_OPTIONS: { value: RelayAuthPolicy; label: MessageDescriptor; description: MessageDescriptor }[] = [
  {
    value: 'never',
    label: defineMessage({ id: 'settings.network.relayAuth.never', defaultMessage: 'Never' }),
    description: defineMessage({ id: 'settings.network.relayAuth.neverDescription', defaultMessage: "Don't sign in to relays. You'll only be asked when you open a relay's page and it requires sign-in." }),
  },
  {
    value: 'mine',
    label: defineMessage({ id: 'settings.network.relayAuth.mine', defaultMessage: 'My relays' }),
    description: defineMessage({ id: 'settings.network.relayAuth.mineDescription', defaultMessage: 'Sign in to your relays and the app’s relays. Other relays ask when you open their page.' }),
  },
  {
    value: 'ask',
    label: defineMessage({ id: 'settings.network.relayAuth.ask', defaultMessage: 'Ask' }),
    description: defineMessage({ id: 'settings.network.relayAuth.askDescription', defaultMessage: 'Sign in to your relays, and ask before signing in to any other relay.' }),
  },
  {
    value: 'always',
    label: defineMessage({ id: 'settings.network.relayAuth.always', defaultMessage: 'Any relay' }),
    description: defineMessage({ id: 'settings.network.relayAuth.alwaysDescription', defaultMessage: 'Sign in to every relay that asks, including ones found through links and other people’s relay lists.' }),
  },
];

/** A removable relay URL row. */
function RelayRow({ url, onRemove, removeLabel, disabled, badge }: {
  url: string;
  onRemove: () => void;
  removeLabel: string;
  disabled?: boolean;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="min-w-0 flex-1 truncate font-mono text-sm" title={url}>{renderRelayUrl(url)}</span>
      {badge}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel}
        className="size-7 shrink-0 text-muted-foreground hover:bg-transparent hover:text-destructive"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

/**
 * Settings → Network: when to sign in to relays (NIP-42 AUTH), relays the
 * user always signs in to, and relays they've blocked (NIP-51 kind 10006).
 */
export function RelayAccessSettings() {
  const intl = useIntl();
  const { toast } = useToast();
  const listErrorMessage = useListErrorMessage();
  const { config, updateConfig } = useAppContext();
  const { blockedRelays, blockRelay, unblockRelay, makePrivate, isPublic, unreadable, isUpdating } = useBlockedRelays();
  const [newBlocked, setNewBlocked] = useState('');

  const policy = config.relayAuthPolicy ?? DEFAULT_RELAY_AUTH_POLICY;
  const selected = AUTH_POLICY_OPTIONS.find((option) => option.value === policy);
  const allowed = config.relayAuthAllowed ?? [];
  const denied = config.relayAuthDenied ?? [];

  const forget = (key: 'relayAuthAllowed' | 'relayAuthDenied', url: string) => {
    updateConfig((current) => ({
      ...current,
      [key]: (current[key] ?? []).filter((u) => u !== url),
    }));
  };

  const handleBlockDenied = async (url: string) => {
    try {
      await blockRelay(url);
      forget('relayAuthDenied', url);
    } catch (error) {
      toast({
        title: intl.formatMessage({ id: 'settings.network.blockedRelays.failed', defaultMessage: 'Could not update blocked relays' }),
        description: listErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleBlock = async () => {
    const url = normalizeRelayUrl(newBlocked);
    if (!url) {
      toast({
        title: intl.formatMessage({ id: 'settings.network.blockedRelays.invalid', defaultMessage: 'Invalid relay URL' }),
        description: intl.formatMessage({ id: 'settings.network.blockedRelays.invalidDescription', defaultMessage: 'Enter a relay URL starting with wss:// or ws://' }),
        variant: 'destructive',
      });
      return;
    }
    try {
      await blockRelay(url);
      setNewBlocked('');
    } catch (error) {
      toast({
        title: intl.formatMessage({ id: 'settings.network.blockedRelays.failed', defaultMessage: 'Could not update blocked relays' }),
        description: listErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleMakePrivate = async () => {
    try {
      await makePrivate();
    } catch (error) {
      toast({
        title: intl.formatMessage({ id: 'settings.network.blockedRelays.failed', defaultMessage: 'Could not update blocked relays' }),
        description: listErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleUnblock = async (url: string) => {
    try {
      await unblockRelay(url);
    } catch (error) {
      toast({
        title: intl.formatMessage({ id: 'settings.network.blockedRelays.failed', defaultMessage: 'Could not update blocked relays' }),
        description: listErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 px-3">
      {/* AUTH policy */}
      <div className="space-y-2">
        <Label htmlFor="relay-auth-policy" className="text-sm font-medium">
          <FormattedMessage id="settings.network.relayAuth.label" defaultMessage="Sign in to relays" />
        </Label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <FormattedMessage
            id="settings.network.relayAuth.description"
            defaultMessage="Some relays ask who you are (NIP-42). Signing in lets that relay see your account while you're connected."
          />
        </p>
        <Select
          value={policy}
          onValueChange={(value) => updateConfig((current) => ({ ...current, relayAuthPolicy: value as RelayAuthPolicy }))}
        >
          <SelectTrigger id="relay-auth-policy" className="h-9 w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUTH_POLICY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <FormattedMessage {...option.label} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...selected.description} />
          </p>
        )}

        {allowed.length > 0 && (
          <div className="pt-2">
            <p className="pb-1 text-xs font-medium text-muted-foreground">
              <FormattedMessage id="settings.network.relayAuth.allowedList" defaultMessage="Always signed in to" />
            </p>
            <div className="divide-y rounded-lg border">
              {allowed.map((url) => (
                <RelayRow
                  key={url}
                  url={url}
                  onRemove={() => forget('relayAuthAllowed', url)}
                  removeLabel={intl.formatMessage({ id: 'settings.network.relayAuth.removeAllowed', defaultMessage: 'Stop signing in to {relay}' }, { relay: renderRelayUrl(url) })}
                />
              ))}
            </div>
          </div>
        )}

        {denied.length > 0 && (
          <div className="pt-2">
            <p className="pb-1 text-xs font-medium text-muted-foreground">
              <FormattedMessage id="settings.network.relayAuth.deniedList" defaultMessage="Never signed in to" />
            </p>
            <div className="divide-y rounded-lg border">
              {denied.map((url) => (
                <RelayRow
                  key={url}
                  url={url}
                  onRemove={() => forget('relayAuthDenied', url)}
                  removeLabel={intl.formatMessage({ id: 'settings.network.relayAuth.removeDenied', defaultMessage: 'Ask again about {relay}' }, { relay: renderRelayUrl(url) })}
                  badge={(
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => void handleBlockDenied(url)}
                      disabled={isUpdating}
                    >
                      <Ban className="mr-1 size-3" aria-hidden />
                      <FormattedMessage id="settings.network.blockedRelays.block" defaultMessage="Block" />
                    </Button>
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Blocked relays */}
      <div className="space-y-2">
        <Label htmlFor="blocked-relay-url" className="flex items-center gap-1.5 text-sm font-medium">
          <Ban className="size-3.5" aria-hidden />
          <FormattedMessage id="settings.network.blockedRelays.label" defaultMessage="Blocked relays" />
        </Label>
        <p className="text-xs leading-relaxed text-muted-foreground">
          <FormattedMessage
            id="settings.network.blockedRelays.description"
            defaultMessage="{appName} never connects to these relays, even when a link or someone's relay list points to them. The list is saved to your account (NIP-51)."
            values={{ appName: config.appName }}
          />
        </p>

        {unreadable && (
          <ListNotice>
            <FormattedMessage
              id="settings.network.blockedRelays.unreadable"
              defaultMessage="Couldn't read the private part of your list, so only public entries are shown. Changes to private entries are paused until it can be read."
            />
          </ListNotice>
        )}

        {isPublic && (
          <ListNotice
            action={(
              <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => void handleMakePrivate()} disabled={isUpdating}>
                <Lock className="mr-1.5 size-3" aria-hidden />
                <FormattedMessage id="common.makePrivate" defaultMessage="Make private" />
              </Button>
            )}
          >
            <FormattedMessage
              id="settings.network.blockedRelays.public"
              defaultMessage="This list is public, so anyone can see it. Making it private hides it from others and from apps that can't read private lists."
            />
          </ListNotice>
        )}

        {blockedRelays && blockedRelays.length > 0 && (
          <div className="divide-y rounded-lg border">
            {blockedRelays.map((url) => (
              <RelayRow
                key={url}
                url={url}
                onRemove={() => handleUnblock(url)}
                disabled={isUpdating}
                removeLabel={intl.formatMessage({ id: 'settings.network.blockedRelays.unblock', defaultMessage: 'Unblock {relay}' }, { relay: renderRelayUrl(url) })}
              />
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            id="blocked-relay-url"
            placeholder="wss://relay.example.com"
            value={newBlocked}
            onChange={(e) => setNewBlocked(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleBlock();
            }}
            className="h-9 flex-1 text-base md:text-sm"
          />
          <Button
            onClick={() => void handleBlock()}
            disabled={!newBlocked.trim() || isUpdating}
            variant="outline"
            size="sm"
            className="h-9 shrink-0 text-xs"
          >
            <Plus className="mr-1.5 size-3.5" />
            <FormattedMessage id="settings.network.blockedRelays.block" defaultMessage="Block" />
          </Button>
        </div>
      </div>
    </div>
  );
}
