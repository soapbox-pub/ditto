import { useMemo } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';
import { CalendarDays, MapPin, Clock, Users } from 'lucide-react';

import { cn } from '@/lib/utils';
import { NoteContent } from '@/components/NoteContent';
import { Badge } from '@/components/ui/badge';

interface CalendarEventContentProps {
  event: NostrEvent;
  /** When true, limits the description to 2 lines for compact feed display. */
  compact?: boolean;
  className?: string;
}

/** Extract the first value for a given tag name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Collect all values for a repeated tag name. */
function getAllTags(tags: string[][], name: string): string[][] {
  return tags.filter(([n]) => n === name);
}

/** Date-only formatter: "Jan 15, 2026" */
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** Date+time formatter: "Jan 15, 2026 at 3:00 PM" */
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Time-only formatter: "3:00 PM" */
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

/** Check if two dates fall on the same calendar day. */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Format the date/time display for a NIP-52 calendar event.
 *
 * Kind 31922 (date-based): "Jan 15, 2026" or "Jan 15 - Jan 17, 2026"
 * Kind 31923 (time-based): "Jan 15, 2026 at 3:00 PM" or time ranges
 */
function formatEventDate(event: NostrEvent): string {
  const start = getTag(event.tags, 'start');
  if (!start) return '';

  if (event.kind === 31922) {
    // Date-based: start/end are YYYY-MM-DD strings
    // Parse as UTC to avoid timezone shifting the date
    const startDate = new Date(start + 'T00:00:00Z');
    if (isNaN(startDate.getTime())) return start;

    const end = getTag(event.tags, 'end');
    if (end) {
      const endDate = new Date(end + 'T00:00:00Z');
      if (!isNaN(endDate.getTime()) && endDate > startDate) {
        // Multi-day range: "Jan 15 - Jan 17, 2026"
        // NIP-52: end date is exclusive, so display the last inclusive day
        const lastDay = new Date(endDate.getTime() - 86400000);
        if (lastDay > startDate) {
          const startParts = dateFormatter.formatToParts(startDate);
          const startStr = startParts
            .filter((p) => p.type !== 'year' && p.type !== 'literal' || p.value === ' ')
            .map((p) => (p.type === 'literal' && p.value.includes(',') ? '' : p.value))
            .join('')
            .trim();
          return `${startStr} – ${dateFormatter.format(lastDay)}`;
        }
      }
    }

    return dateFormatter.format(startDate);
  }

  if (event.kind === 31923) {
    // Time-based: start/end are Unix timestamps
    const startTs = parseInt(start, 10);
    if (isNaN(startTs)) return start;
    const startDate = new Date(startTs * 1000);

    const end = getTag(event.tags, 'end');
    if (end) {
      const endTs = parseInt(end, 10);
      if (!isNaN(endTs) && endTs > startTs) {
        const endDate = new Date(endTs * 1000);

        if (isSameDay(startDate, endDate)) {
          // Same day: "Jan 15, 2026 at 3:00 PM – 5:00 PM"
          return `${dateTimeFormatter.format(startDate)} – ${timeFormatter.format(endDate)}`;
        }
        // Different days: "Jan 15, 2026 at 3:00 PM – Jan 16, 2026 at 5:00 PM"
        return `${dateTimeFormatter.format(startDate)} – ${dateTimeFormatter.format(endDate)}`;
      }
    }

    return dateTimeFormatter.format(startDate);
  }

  return start;
}

/** Renders NIP-52 calendar event content (kind 31922 and 31923). */
export function CalendarEventContent({ event, compact, className }: CalendarEventContentProps) {
  const title = useMemo(() => getTag(event.tags, 'title'), [event.tags]);
  const image = useMemo(() => getTag(event.tags, 'image'), [event.tags]);
  const location = useMemo(() => getTag(event.tags, 'location'), [event.tags]);
  const dateDisplay = useMemo(() => formatEventDate(event), [event]);
  const hashtags = useMemo(() => getAllTags(event.tags, 't').map(([, v]) => v).filter(Boolean), [event.tags]);
  const participants = useMemo(() => getAllTags(event.tags, 'p'), [event.tags]);
  const hasContent = event.content.trim().length > 0;
  const summary = useMemo(() => getTag(event.tags, 'summary'), [event.tags]);

  return (
    <div className={cn('mt-2 rounded-xl border border-border overflow-hidden', className)}>
      {/* Cover image or gradient header */}
      {image ? (
        <div className="aspect-video rounded-lg overflow-hidden">
          <img
            src={image}
            alt={title ?? 'Calendar event'}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent py-8">
          <CalendarDays className="h-10 w-10 text-primary/30" />
        </div>
      )}

      {/* Event details */}
      <div className="space-y-2 p-3">
        {/* Title */}
        {title && (
          <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>
        )}

        {/* Date/time */}
        {dateDisplay && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{dateDisplay}</span>
          </div>
        )}

        {/* Location */}
        {location && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>{location}</span>
          </div>
        )}

        {/* Participants count */}
        {participants.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>
              {participants.length} {participants.length === 1 ? 'participant' : 'participants'}
            </span>
          </div>
        )}

        {/* Summary (brief description from tag) */}
        {summary && !hasContent && (
          <p className={cn('text-sm text-muted-foreground', compact && 'line-clamp-2')}>
            {summary}
          </p>
        )}

        {/* Description (event.content) via NoteContent */}
        {hasContent && (
          <div className={cn(compact && 'line-clamp-2')}>
            <NoteContent event={event} className="text-sm" />
          </div>
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {hashtags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px] px-2 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
