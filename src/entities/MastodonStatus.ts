import { MastodonAccount } from '@/entities/MastodonAccount.ts';
import { PreviewCard } from '@/entities/PreviewCard.ts';

export interface MastodonStatus {
  id: string;
  account: MastodonAccount;
  card: PreviewCard | null;
  content: string;
  created_at: string;
  in_reply_to_id: string | null;
  in_reply_to_account_id: string | null;
  sensitive: boolean;
  spoiler_text: string;
  visibility: string;
  language: string | null;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  zaps_amount: number;
  favourited: boolean;
  reblogged: boolean;
  muted: boolean;
  bookmarked: boolean;
  pinned: boolean;
  reblog: MastodonStatus | null;
  application: unknown;
  media_attachments: unknown[];
  mentions: unknown[];
  tags: unknown[];
  emojis: unknown[];
  poll: unknown;
  quote?: MastodonStatus | null;
  quote_id: string | null;
  uri: string;
  url: string;
  zapped: boolean;
  pleroma: {
    emoji_reactions: { name: string; count: number; me: boolean }[];
    expires_at?: string;
    quotes_count: number;
  };
}
