import { useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Clock,
  Users,
  Check,
  X as XIcon,
  HelpCircle,
  Share2,
  ExternalLink,
  Zap,
  Link as LinkIcon,
} from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { NoteContent } from '@/components/NoteContent';
import { RSVPAvatars } from '@/components/RSVPAvatars';
import { ZapDialog } from '@/components/ZapDialog';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventRSVPs } from '@/hooks/useEventRSVPs';
import { useMyRSVP } from '@/hooks/useMyRSVP';
import { usePublishRSVP } from '@/hooks/usePublishRSVP';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

// --- Helpers ---

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getAllTags(tags: string[][], name: string): string[][] {
  return tags.filter(([n]) => n === name);
}

function parseLocation(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return raw;
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj.description === 'string' && obj.description) return obj.description;
    if (typeof obj.name === 'string' && obj.name) return obj.name;
    if (typeof obj.address === 'string' && obj.address) return obj.address;
  } catch {
    // not JSON, return as-is
  }
  return raw;
}

function getEventCoord(event: NostrEvent): string {
  const d = getTag(event.tags, 'd') ?? '';
  return `${event.kind}:${event.pubkey}:${d}`;
}

function formatDetailDate(event: NostrEvent): string {
  const startRaw = getTag(event.tags, 'start');
  const endRaw = getTag(event.tags, 'end');
  if (!startRaw) return 'Date not specified';

  if (event.kind === 31922) {
    const fmt = (d: string) => {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day).toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });
    };
    if (endRaw && endRaw !== startRaw) return `${fmt(startRaw)} - ${fmt(endRaw)}`;
    return fmt(startRaw);
  }

  // kind 31923 — unix timestamps
  const startTs = parseInt(startRaw, 10) * 1000;
  const endTs = endRaw ? parseInt(endRaw, 10) * 1000 : undefined;
  const startTzid = getTag(event.tags, 'start_tzid');

  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    ...(startTzid ? { timeZone: startTzid } : {}),
  };

  const dateFmt = new Intl.DateTimeFormat('en-US', opts);
  const startStr = dateFmt.format(new Date(startTs));

  if (endTs) {
    const sameDay = new Date(startTs).toDateString() === new Date(endTs).toDateString();
    if (sameDay) {
      const timeFmt = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit',
        ...(startTzid ? { timeZone: startTzid } : {}),
      });
      return `${startStr} - ${timeFmt.format(new Date(endTs))}`;
    }
    return `${startStr} - ${dateFmt.format(new Date(endTs))}`;
  }
  return startStr;
}

const ROLE_ORDER = ['host', 'speaker', 'moderator', 'participant'];
function roleSort(a: string, b: string): number {
  const ai = ROLE_ORDER.indexOf(a.toLowerCase());
  const bi = ROLE_ORDER.indexOf(b.toLowerCase());
  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
}

// --- Sub-components ---

function PersonRow({ pubkey, label, size = 'md' }: { pubkey: string; label?: string; size?: 'sm' | 'md' }) {
  const { data } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const avatarCls = size === 'sm' ? 'size-8' : 'size-11';
  const fallbackCls = size === 'sm' ? 'text-xs' : '';

  return (
    <Link to={profileUrl} className="flex items-center gap-3 group">
      <Avatar shape={avatarShape} className={cn(avatarCls, 'ring-2 ring-background')}>
        <AvatarImage src={metadata?.picture} />
        <AvatarFallback className={cn('bg-muted text-muted-foreground', fallbackCls)}>
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold truncate group-hover:underline', size === 'sm' ? 'text-sm' : 'text-[15px]')}>{name}</p>
        {!label && size === 'md' && <p className="text-xs text-muted-foreground">Organizer</p>}
      </div>
      {label && (
        <Badge variant="secondary" className="ml-auto capitalize text-xs shrink-0">{label}</Badge>
      )}
    </Link>
  );
}

// --- Main Component ---

export function CalendarEventDetailPage({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { toast } = useToast();

  const title = getTag(event.tags, 'title') ?? 'Untitled Event';
  const image = getTag(event.tags, 'image');
  const locationRaw = getTag(event.tags, 'location');
  const location = locationRaw ? parseLocation(locationRaw) : undefined;
  const summary = getTag(event.tags, 'summary');
  const hashtags = getAllTags(event.tags, 't').map(([, v]) => v).filter(Boolean);
  const links = getAllTags(event.tags, 'r').map(([, v]) => sanitizeUrl(v)).filter((v): v is string => !!v);

  const eventCoord = useMemo(() => getEventCoord(event), [event]);
  const dateStr = useMemo(() => formatDetailDate(event), [event]);

  // Participants grouped by role
  const participantsByRole = useMemo(() => {
    const pTags = getAllTags(event.tags, 'p');
    const groups = new Map<string, string[]>();
    for (const tag of pTags) {
      const pubkey = tag[1];
      const role = tag[3] || 'Participant';
      if (!pubkey) continue;
      const list = groups.get(role) ?? [];
      list.push(pubkey);
      groups.set(role, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => roleSort(a, b));
  }, [event.tags]);

  // RSVP state
  const rsvps = useEventRSVPs(eventCoord);
  const myRsvp = useMyRSVP(eventCoord);
  const publishRSVP = usePublishRSVP();

  const [selectedStatus, setSelectedStatus] = useState<'accepted' | 'declined' | 'tentative' | null>(null);
  const [rsvpNote, setRsvpNote] = useState('');

  const activeStatus = selectedStatus ?? myRsvp.status;
  const hasChanged = selectedStatus !== null && selectedStatus !== myRsvp.status;

  const handleRSVP = useCallback(async () => {
    if (!activeStatus) return;
    try {
      await publishRSVP.mutateAsync({
        eventCoord,
        eventAuthorPubkey: event.pubkey,
        status: activeStatus,
        note: rsvpNote || undefined,
      });
      setSelectedStatus(null);
      setRsvpNote('');
      toast({ title: 'RSVP updated' });
    } catch {
      toast({ title: 'Failed to update RSVP', variant: 'destructive' });
    }
  }, [activeStatus, eventCoord, event.pubkey, rsvpNote, publishRSVP, toast]);

  const handleShare = useCallback(async () => {
    const d = getTag(event.tags, 'd') ?? '';
    const naddr = nip19.naddrEncode({
      kind: event.kind,
      pubkey: event.pubkey,
      identifier: d,
    });
    const url = `${window.location.origin}/${naddr}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied to clipboard' });
    } catch {
      toast({ title: 'Failed to copy link', variant: 'destructive' });
    }
  }, [event, toast]);

  const isAuthor = user?.pubkey === event.pubkey;
  const showRSVP = !!user && !isAuthor;

  return (
    <div className="max-w-2xl mx-auto pb-16">
      {/* ── Standard top bar ── */}
      <div className="flex items-center gap-4 px-4 pt-4 pb-5">
        <button
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold flex-1">Event Details</h1>
      </div>

      {/* ── Cover image ── */}
      {image ? (
        <div className="aspect-[2/1] w-full overflow-hidden">
          <img src={image} alt={title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-[3/1] w-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
          <CalendarDays className="size-20 text-primary/20" />
        </div>
      )}

      {/* ── Content ── */}
      <div className="px-5 mt-5 space-y-5">
        {/* Title */}
        <h2 className="text-2xl font-bold leading-tight tracking-tight">{title}</h2>
        {/* Organizer row + actions */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <PersonRow pubkey={event.pubkey} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ZapDialog target={event}>
              <button className="p-2 rounded-full hover:bg-secondary/60 transition-colors" aria-label="Zap">
                <Zap className="size-5" />
              </button>
            </ZapDialog>
            <button
              className="p-2 rounded-full hover:bg-secondary/60 transition-colors"
              onClick={handleShare}
              aria-label="Share"
            >
              <Share2 className="size-5" />
            </button>
          </div>
        </div>

        {/* Date & Location — sidebar-style pills */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-4 px-3 py-3 rounded-full bg-background/85">
            <Clock className="size-5 text-primary shrink-0" />
            <span className="text-sm">{dateStr}</span>
          </div>
          {location && (
            <div className="flex items-center gap-4 px-3 py-3 rounded-full bg-background/85">
              <MapPin className="size-5 text-primary shrink-0" />
              <span className="text-sm">{location}</span>
            </div>
          )}
        </div>

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {hashtags.map((tag) => (
              <Link key={tag} to={`/t/${tag}`}>
                <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80 text-xs px-2.5 py-0.5">
                  #{tag}
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {/* Description */}
        {(event.content || summary) && (
          <>
            <Separator />
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">About</h2>
              {event.content ? (
                <NoteContent event={event} className="text-sm leading-relaxed text-foreground" hideEmbedImages={!!image} />
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
              )}
            </section>
          </>
        )}

        {/* External links */}
        {links.length > 0 && (
          <div className="flex flex-col gap-0.5">
            {links.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 px-3 py-3 rounded-full bg-background/85 hover:bg-secondary/60 transition-colors"
              >
                <LinkIcon className="size-5 text-primary shrink-0" />
                <span className="text-sm truncate flex-1">{url.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="size-4 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* Participants */}
        {participantsByRole.length > 0 && (
          <>
            <Separator />
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Users className="size-4" /> Participants
              </h2>
              <div className="space-y-2">
                {participantsByRole.map(([role, pubkeys]) =>
                  pubkeys.map((pk) => <PersonRow key={pk} pubkey={pk} label={role} size="sm" />),
                )}
              </div>
            </section>
          </>
        )}

        {/* RSVP section */}
        {showRSVP && (
          <div className="rounded-[1.25rem] bg-background/85 p-4 space-y-3">
            <h2 className="text-sm font-semibold px-1">Your RSVP</h2>

            {myRsvp.status && !selectedStatus && (
              <div className="px-1">
                <Badge
                  variant="outline"
                  className={cn(
                    myRsvp.status === 'accepted' && 'border-green-500 text-green-600',
                    myRsvp.status === 'tentative' && 'border-amber-500 text-amber-600',
                    myRsvp.status === 'declined' && 'border-destructive text-destructive',
                  )}
                >
                  {myRsvp.status === 'accepted' ? 'Going' : myRsvp.status === 'tentative' ? 'Maybe' : "Can't Go"}
                </Badge>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={activeStatus === 'accepted' ? 'default' : 'outline'}
                className={cn('flex-1 rounded-full', activeStatus === 'accepted' && 'bg-green-600 hover:bg-green-700 text-white')}
                onClick={() => setSelectedStatus('accepted')}
              >
                <Check className="size-3.5 mr-1.5" /> Going
              </Button>
              <Button
                size="sm"
                variant={activeStatus === 'tentative' ? 'default' : 'outline'}
                className={cn('flex-1 rounded-full', activeStatus === 'tentative' && 'bg-amber-500 hover:bg-amber-600 text-white')}
                onClick={() => setSelectedStatus('tentative')}
              >
                <HelpCircle className="size-3.5 mr-1.5" /> Maybe
              </Button>
              <Button
                size="sm"
                variant={activeStatus === 'declined' ? 'default' : 'outline'}
                className={cn('flex-1 rounded-full', activeStatus === 'declined' && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground')}
                onClick={() => setSelectedStatus('declined')}
              >
                <XIcon className="size-3.5 mr-1.5" /> Can't Go
              </Button>
            </div>

            {activeStatus && (
              <Textarea
                placeholder="Add a note (optional)"
                value={rsvpNote}
                onChange={(e) => setRsvpNote(e.target.value)}
                className="mt-1 resize-none rounded-xl"
                rows={2}
              />
            )}

            {(hasChanged || (activeStatus && !myRsvp.status)) && (
              <Button
                size="sm"
                onClick={handleRSVP}
                disabled={publishRSVP.isPending}
                className="w-full mt-1 rounded-full"
              >
                {publishRSVP.isPending ? 'Updating...' : myRsvp.status ? 'Update RSVP' : 'Submit RSVP'}
              </Button>
            )}
          </div>
        )}

        {/* Attendees */}
        {rsvps.total > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Users className="size-4" /> Attendees
            </h2>
            <div className="space-y-2.5">
              {([
                ['Going', rsvps.accepted, 'border-green-500/50 bg-green-500/5 text-green-600'],
                ['Maybe', rsvps.tentative, 'border-amber-500/50 bg-amber-500/5 text-amber-600'],
                ["Can't Go", rsvps.declined, 'border-muted-foreground/30 bg-muted/30 text-muted-foreground'],
              ] as const).map(([label, pks, cls]) => pks.length > 0 && (
                <div key={label} className="flex items-center gap-3">
                  <Badge variant="outline" className={cn(cls, 'shrink-0 text-xs')}>{label} ({pks.length})</Badge>
                  <RSVPAvatars pubkeys={pks} maxVisible={8} size="sm" />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
