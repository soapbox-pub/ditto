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
} from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

// --- Helpers ---

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getAllTags(tags: string[][], name: string): string[][] {
  return tags.filter(([n]) => n === name);
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
        month: 'long', day: 'numeric', year: 'numeric',
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
    month: 'long', day: 'numeric', year: 'numeric',
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
  const name = metadata?.display_name || metadata?.name || genUserName(pubkey);
  const profileUrl = useProfileUrl(pubkey, metadata);
  const avatarCls = size === 'sm' ? 'size-8' : 'size-10';
  const fallbackCls = size === 'sm' ? 'text-xs' : '';

  return (
    <Link to={profileUrl} className="flex items-center gap-3 group">
      <Avatar className={cn(avatarCls, 'ring-2 ring-background')}>
        <AvatarImage src={metadata?.picture} />
        <AvatarFallback className={cn('bg-muted text-muted-foreground', fallbackCls)}>
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium truncate group-hover:underline', size === 'sm' && 'text-sm')}>{name}</p>
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
  const location = getTag(event.tags, 'location');
  const summary = getTag(event.tags, 'summary');
  const hashtags = getAllTags(event.tags, 't').map(([, v]) => v).filter(Boolean);
  const links = getAllTags(event.tags, 'r').map(([, v]) => v).filter(Boolean);

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
    <div className="max-w-2xl mx-auto pb-12">
      {/* Back button */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>

      {/* Cover image */}
      {image ? (
        <div className="aspect-video w-full overflow-hidden">
          <img src={image} alt={title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-video w-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <CalendarDays className="size-16 text-primary/30" />
        </div>
      )}

      <div className="px-4 space-y-6 mt-6">
        {/* Title + share */}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          <Button variant="outline" size="icon" className="shrink-0" onClick={handleShare}>
            <Share2 className="size-4" />
          </Button>
        </div>

        {/* Host */}
        <PersonRow pubkey={event.pubkey} />

        {/* Date/Time */}
        <div className="flex items-start gap-3 text-sm">
          <Clock className="size-4 text-muted-foreground mt-0.5 shrink-0" />
          <span>{dateStr}</span>
        </div>

        {/* Location */}
        {location && (
          <div className="flex items-start gap-3 text-sm">
            <MapPin className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <span>{location}</span>
          </div>
        )}

        {/* Description */}
        {(event.content || summary) && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {event.content ? (
              <NoteContent event={event} className="text-sm leading-relaxed" />
            ) : (
              <p className="text-sm text-muted-foreground">{summary}</p>
            )}
          </div>
        )}

        {/* Participants */}
        {participantsByRole.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users className="size-4" /> Participants
            </h2>
            <div className="space-y-2">
              {participantsByRole.map(([role, pubkeys]) =>
                pubkeys.map((pk) => <PersonRow key={pk} pubkey={pk} label={role} size="sm" />),
              )}
            </div>
          </section>
        )}

        {/* RSVP section */}
        {showRSVP && (
          <section className="space-y-3 rounded-lg border p-4">
            <h2 className="text-sm font-semibold">Your RSVP</h2>

            {myRsvp.status && !selectedStatus && (
              <Badge
                variant="outline"
                className={cn(
                  'mb-2',
                  myRsvp.status === 'accepted' && 'border-green-500 text-green-600',
                  myRsvp.status === 'tentative' && 'border-amber-500 text-amber-600',
                  myRsvp.status === 'declined' && 'border-destructive text-destructive',
                )}
              >
                {myRsvp.status === 'accepted' ? 'Going' : myRsvp.status === 'tentative' ? 'Maybe' : "Can't Go"}
              </Badge>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={activeStatus === 'accepted' ? 'default' : 'outline'}
                className={cn(activeStatus === 'accepted' && 'bg-green-600 hover:bg-green-700 text-white')}
                onClick={() => setSelectedStatus('accepted')}
              >
                <Check className="size-3.5 mr-1" /> Going
              </Button>
              <Button
                size="sm"
                variant={activeStatus === 'tentative' ? 'default' : 'outline'}
                className={cn(activeStatus === 'tentative' && 'bg-amber-500 hover:bg-amber-600 text-white')}
                onClick={() => setSelectedStatus('tentative')}
              >
                <HelpCircle className="size-3.5 mr-1" /> Maybe
              </Button>
              <Button
                size="sm"
                variant={activeStatus === 'declined' ? 'default' : 'outline'}
                className={cn(activeStatus === 'declined' && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground')}
                onClick={() => setSelectedStatus('declined')}
              >
                <XIcon className="size-3.5 mr-1" /> Can't Go
              </Button>
            </div>

            {activeStatus && (
              <Textarea
                placeholder="Add a note (optional)"
                value={rsvpNote}
                onChange={(e) => setRsvpNote(e.target.value)}
                className="mt-2 resize-none"
                rows={2}
              />
            )}

            {(hasChanged || (activeStatus && !myRsvp.status)) && (
              <Button
                size="sm"
                onClick={handleRSVP}
                disabled={publishRSVP.isPending}
                className="mt-1"
              >
                {publishRSVP.isPending ? 'Updating...' : myRsvp.status ? 'Update RSVP' : 'Submit RSVP'}
              </Button>
            )}
          </section>
        )}

        {/* Attendees */}
        {rsvps.total > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users className="size-4" /> Attendees
            </h2>
            {([
              ['Going', rsvps.accepted, 'border-green-500 text-green-600'],
              ['Maybe', rsvps.tentative, 'border-amber-500 text-amber-600'],
              ["Can't Go", rsvps.declined, 'border-muted-foreground text-muted-foreground'],
            ] as const).map(([label, pks, cls]) => pks.length > 0 && (
              <div key={label} className="flex items-center gap-3">
                <Badge variant="outline" className={cn(cls, 'shrink-0')}>{label} ({pks.length})</Badge>
                <RSVPAvatars pubkeys={pks} maxVisible={8} size="sm" />
              </div>
            ))}
          </section>
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {hashtags.map((tag) => (
              <Link key={tag} to={`/t/${tag}`}><Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">#{tag}</Badge></Link>
            ))}
          </div>
        )}

        {/* External links */}
        {links.length > 0 && (
          <section className="space-y-2">
            {links.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <ExternalLink className="size-3.5 shrink-0" /><span className="truncate">{url}</span>
              </a>
            ))}
          </section>
        )}

        {/* Zap */}
        <ZapDialog target={event}>
          <Button variant="outline" size="sm" className="gap-1.5">
            Zap
          </Button>
        </ZapDialog>
      </div>
    </div>
  );
}
