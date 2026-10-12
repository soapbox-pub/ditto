import { defineMessages, type IntlShape } from 'react-intl';

const messages = defineMessages({
  seconds: { id: 'timeAgo.seconds', defaultMessage: '{count}s' },
  minutes: { id: 'timeAgo.minutes', defaultMessage: '{count}m' },
  hours: { id: 'timeAgo.hours', defaultMessage: '{count}h' },
  days: { id: 'timeAgo.days', defaultMessage: '{count}d' },
  weeks: { id: 'timeAgo.weeks', defaultMessage: '{count}w' },
});

/**
 * Returns a short, human-readable relative time string in the app locale.
 * `intl.formatDate` caches its Intl.DateTimeFormat instances, so calling this
 * from every feed card header stays cheap.
 */
export function timeAgo(timestamp: number, intl: IntlShape): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return intl.formatMessage(messages.seconds, { count: diff });
  if (diff < 3600) return intl.formatMessage(messages.minutes, { count: Math.floor(diff / 60) });
  if (diff < 86400) return intl.formatMessage(messages.hours, { count: Math.floor(diff / 3600) });
  if (diff < 604800) return intl.formatMessage(messages.days, { count: Math.floor(diff / 86400) });
  if (diff < 2592000) return intl.formatMessage(messages.weeks, { count: Math.floor(diff / 604800) });

  return intl.formatDate(new Date(timestamp * 1000), { month: 'short', day: 'numeric' });
}
