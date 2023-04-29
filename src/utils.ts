import { Context, getPublicKey } from '@/deps.ts';
import { type Event } from '@/event.ts';

/** Get the current time in Nostr format. */
const nostrNow = () => Math.floor(new Date().getTime() / 1000);

/** Pass to sort() to sort events by date. */
const eventDateComparator = (a: Event, b: Event) => b.created_at - a.created_at;

function getKeys(c: Context) {
  const auth = c.req.headers.get('Authorization') || '';

  if (auth.startsWith('Bearer ')) {
    const privatekey = auth.split('Bearer ')[1];
    const pubkey = getPublicKey(privatekey);

    return {
      privatekey,
      pubkey,
    };
  }
}

export { eventDateComparator, getKeys, nostrNow };
