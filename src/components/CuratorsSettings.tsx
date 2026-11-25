import { List, Plus, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { getAvatarShape } from '@/lib/avatarShape';
import { curatorEntry, curatorKey, parseCurator, type DiscoverCurator } from '@/lib/discoverCurators';
import { profileName } from '@/lib/getDisplayName';
import { tryNaddrEncode, tryNpubEncode } from '@/lib/safeNip19';

/** A shortened npub, for a profile with no name. */
function shortKey(pubkey: string): string {
  const npub = tryNpubEncode(pubkey);
  return npub ? `${npub.slice(0, 12)}…` : pubkey.slice(0, 8);
}

/** A pubkey's name, linked to their profile. */
function CuratorName({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = profileName(author.data?.metadata) ?? shortKey(pubkey);
  const npub = tryNpubEncode(pubkey);
  return npub
    ? <Link to={`/${npub}`} className="font-medium text-foreground hover:underline">{name}</Link>
    : <span className="font-medium text-foreground">{name}</span>;
}

function CuratorAvatar({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const name = profileName(metadata) ?? shortKey(pubkey);
  return (
    <Avatar shape={getAvatarShape(metadata)} className="size-8 shrink-0">
      <AvatarImage src={metadata?.picture} imeta={author.data?.imeta?.picture} alt={name} />
      <AvatarFallback className="bg-primary/20 text-primary text-xs">{name[0]?.toUpperCase() ?? '?'}</AvatarFallback>
    </Avatar>
  );
}

/** One curator: who they are, and what of theirs the feeds read. */
function CuratorRow({ curator, entry, onRemove }: { curator?: DiscoverCurator; entry: string; onRemove: () => void }) {
  const intl = useIntl();
  let art;
  let body;
  if (curator?.type === 'follows') {
    art = <CuratorAvatar pubkey={curator.pubkey} />;
    body = (
      <>
        <p className="text-sm break-words"><CuratorName pubkey={curator.pubkey} /></p>
        <p className="text-xs text-muted-foreground">
          <FormattedMessage id="settings.feed.curatorFollows" defaultMessage="And everyone they follow" />
        </p>
      </>
    );
  } else if (curator?.type === 'list') {
    const naddr = tryNaddrEncode({ kind: curator.kind, pubkey: curator.pubkey, identifier: curator.identifier });
    art = (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        <List className="size-4" />
      </span>
    );
    body = (
      <p className="text-sm break-words">
        <FormattedMessage
          id="settings.feed.curatorList"
          defaultMessage="<link>A list</link> by {name}"
          values={{
            name: <CuratorName pubkey={curator.pubkey} />,
            link: (chunks) => naddr
              ? <Link to={`/${naddr}`} className="font-medium text-foreground hover:underline">{chunks}</Link>
              : <>{chunks}</>,
          }}
        />
      </p>
    );
  } else {
    art = <span className="size-8 shrink-0" />;
    body = (
      <>
        <p className="font-mono text-xs break-all">{entry}</p>
        <p className="text-xs text-muted-foreground">
          <FormattedMessage id="settings.feed.curatorUnreadable" defaultMessage="Couldn't read this one" />
        </p>
      </>
    );
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      {art}
      <div className="min-w-0 flex-1">{body}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground"
        aria-label={intl.formatMessage({ id: 'settings.feed.curatorRemove', defaultMessage: 'Remove curator' })}
        onClick={onRemove}
      >
        <X className="size-4" />
      </Button>
    </li>
  );
}

/**
 * Who picks what fills the Ditto feed, and Discover until the viewer follows
 * someone (`lib/discoverCurators.ts`). Changes only what this client reads.
 */
export function CuratorsSettings() {
  const intl = useIntl();
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { updateSettings } = useEncryptedSettings();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<MessageDescriptor | null>(null);

  const overridden = config.curators !== undefined;
  const entries = config.curators ?? config.defaultCurators;
  const rows = entries.map((entry) => {
    const parsed = parseCurator(entry);
    return { entry, curator: parsed.ok ? parsed.curator : undefined };
  });

  /** Save the user's curators, or go back to the default with `undefined`. */
  const save = (curators: string[] | undefined) => {
    updateConfig((current) => ({ ...current, curators }));
    if (user) updateSettings.mutate({ curators: curators ?? null });
  };

  const add = () => {
    const seen = new Set(rows.flatMap(({ curator }) => (curator ? [curatorKey(curator)] : [])));
    const added: string[] = [];
    for (const input of draft.split(/[\s,]+/).filter(Boolean)) {
      const parsed = parseCurator(input);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      const key = curatorKey(parsed.curator);
      if (seen.has(key)) continue;
      seen.add(key);
      added.push(curatorEntry(parsed.curator));
    }
    if (added.length) save([...entries, ...added]);
    setDraft('');
    setError(null);
  };

  return (
    <div className="px-3 py-4 space-y-3 border-b border-border">
      <div>
        <Label className="text-sm font-medium">
          <FormattedMessage id="settings.feed.curators" defaultMessage="Curators" />
        </Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          <FormattedMessage
            id="settings.feed.curatorsDescription"
            defaultMessage="The {appName} feed shows posts from your curators, the people they pick, and who those people follow. So does Discover, until you follow people. Add a person to pick everyone they follow, or a list to pick its members."
            values={{ appName: config.appName }}
          />
        </p>
      </div>

      {rows.length > 0 ? (
        <ul className="inset-well divide-y divide-border-subtle">
          {rows.map(({ entry, curator }, i) => (
            <CuratorRow
              key={`${i}:${entry}`}
              entry={entry}
              curator={curator}
              onRemove={() => save(entries.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          <FormattedMessage
            id="settings.feed.curatorsEmpty"
            defaultMessage="No curators. The {appName} feed stays empty, and so does Discover until you follow people."
            values={{ appName: config.appName }}
          />
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          placeholder={intl.formatMessage({ id: 'settings.feed.curatorsPlaceholder', defaultMessage: 'npub1… or naddr1…' })}
          aria-label={intl.formatMessage({ id: 'settings.feed.curatorsAddLabel', defaultMessage: 'Add a curator' })}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          spellCheck={false}
          className="h-9 font-mono text-base md:text-sm"
        />
        <Button type="submit" size="sm" className="h-9 shrink-0" disabled={!draft.trim()}>
          <Plus className="size-4 mr-1" />
          <FormattedMessage id="settings.feed.curatorsAdd" defaultMessage="Add" />
        </Button>
      </form>
      {error && <p className="text-xs text-destructive"><FormattedMessage {...error} /></p>}

      {overridden && (
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => save(undefined)}>
          <RotateCcw className="size-3.5 mr-1.5" />
          <FormattedMessage id="settings.feed.curatorsReset" defaultMessage="Reset to default" />
        </Button>
      )}
    </div>
  );
}
