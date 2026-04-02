import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Clock, Globe, Image, Languages, MessageSquareOff, Radio, Search, SortDesc, Terminal, Users, Video, WandSparkles } from 'lucide-react';

/** Parse a spell timestamp value into human-readable text. */
function formatTimestamp(value: string): string {
  const units: Record<string, string> = {
    s: 'second', m: 'minute', h: 'hour', d: 'day',
    w: 'week', mo: 'month', y: 'year',
  };

  if (value === 'now') return 'now';

  const match = value.match(/^(\d+)(s|m|h|d|w|mo|y)$/);
  if (match) {
    const [, num, unit] = match;
    const label = units[unit] ?? unit;
    return `last ${num} ${label}${parseInt(num) !== 1 ? 's' : ''}`;
  }

  // Absolute timestamp
  const ts = parseInt(value);
  if (!isNaN(ts)) {
    return new Date(ts * 1000).toLocaleDateString();
  }

  return value;
}

interface SpellContentProps {
  event: NostrEvent;
}

export function SpellContent({ event }: SpellContentProps) {
  const navigate = useNavigate();
  const { tags } = event;

  const neventId = nip19.neventEncode({ id: event.id, author: event.pubkey });

  const handleRun = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/spells/run/${neventId}`);
  };

  const name = tags.find(([t]) => t === 'name')?.[1];
  const cmd = tags.find(([t]) => t === 'cmd')?.[1];
  const kinds = tags.filter(([t]) => t === 'k').map(([, v]) => v);
  const authors = tags.find(([t]) => t === 'authors')?.slice(1) ?? [];
  const search = tags.find(([t]) => t === 'search')?.[1];
  const since = tags.find(([t]) => t === 'since')?.[1];
  const until = tags.find(([t]) => t === 'until')?.[1];
  const limit = tags.find(([t]) => t === 'limit')?.[1];
  const relays = tags.find(([t]) => t === 'relays')?.slice(1) ?? [];
  const tagFilters = tags.filter(([t]) => t === 'tag');
  const closeOnEose = tags.some(([t]) => t === 'close-on-eose');

  // Client-hint tags (NIP-50 extensions)
  const media = tags.find(([t]) => t === 'media')?.[1];
  const language = tags.find(([t]) => t === 'language')?.[1];
  const platform = tags.find(([t]) => t === 'platform')?.[1];
  const sort = tags.find(([t]) => t === 'sort')?.[1];
  const includeReplies = tags.find(([t]) => t === 'include-replies')?.[1];

  return (
    <div className="space-y-3">
      {/* Spell name — clickable to run the spell */}
      {name && (
        <button
          type="button"
          onClick={handleRun}
          className="flex items-center gap-2 group cursor-pointer"
        >
          <WandSparkles className="size-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
          <span className="font-semibold text-sm group-hover:text-primary transition-colors">{name}</span>
        </button>
      )}

      {/* Description from content */}
      {event.content && (
        <p className="text-sm text-muted-foreground">{event.content}</p>
      )}

      {/* Badge row */}
      <div className="flex flex-wrap gap-1.5">
        {cmd && (
          <Badge variant="secondary" className="gap-1 text-xs font-mono">
            <Terminal className="size-3" />
            {cmd}
          </Badge>
        )}
        {kinds.map((k) => (
          <Badge key={k} variant="outline" className="text-xs font-mono">
            kind:{k}
          </Badge>
        ))}
        {authors
          .filter((a) => a.startsWith('$'))
          .map((a) => (
            <Badge key={a} variant="secondary" className="gap-1 text-xs">
              <Users className="size-3" />
              {a}
            </Badge>
          ))}
        {search && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Search className="size-3" />
            {search}
          </Badge>
        )}
        {since && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Clock className="size-3" />
            {formatTimestamp(since)}
          </Badge>
        )}
        {until && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Clock className="size-3" />
            until {formatTimestamp(until)}
          </Badge>
        )}
        {limit && (
          <Badge variant="outline" className="text-xs font-mono">
            limit:{limit}
          </Badge>
        )}
        {closeOnEose && (
          <Badge variant="outline" className="text-xs">
            one-shot
          </Badge>
        )}
        {media && media !== 'all' && (
          <Badge variant="secondary" className="gap-1 text-xs">
            {media === 'images' ? <Image className="size-3" /> : media === 'videos' || media === 'vines' ? <Video className="size-3" /> : null}
            {media}
          </Badge>
        )}
        {language && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Languages className="size-3" />
            {language}
          </Badge>
        )}
        {platform && platform !== 'nostr' && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Globe className="size-3" />
            {platform}
          </Badge>
        )}
        {sort && sort !== 'recent' && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <SortDesc className="size-3" />
            {sort}
          </Badge>
        )}
        {includeReplies === 'false' && (
          <Badge variant="outline" className="gap-1 text-xs">
            <MessageSquareOff className="size-3" />
            no replies
          </Badge>
        )}
      </div>

      {/* Tag filters */}
      {tagFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tagFilters.map(([, letter, ...values], i) => (
            <Badge key={i} variant="secondary" className="text-xs font-mono">
              #{letter}: {values.join(', ')}
            </Badge>
          ))}
        </div>
      )}

      {/* Target relays */}
      {relays.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {relays.map((r) => (
            <Badge key={r} variant="outline" className="gap-1 text-xs">
              <Radio className="size-3" />
              {r.replace('wss://', '')}
            </Badge>
          ))}
        </div>
      )}

    </div>
  );
}
