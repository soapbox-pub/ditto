import type { LanguageCode } from 'iso-639-1';

/** https://docs.joinmastodon.org/entities/Translation/ */
export interface MastodonTranslation {
  /** HTML-encoded translated content of the status. */
  content: string;
  /** The translated spoiler warning of the status. */
  spoiler_text: string;
  /** The translated media descriptions of the status. */
  media_attachments: { id: string; description: string }[];
  /** The translated poll of the status. */
  poll: { id: string; options: { title: string }[] } | null;
  //** The language of the source text, as auto-detected by the machine translation provider. */
  detected_source_language: LanguageCode;
  /** The service that provided the machine translation. */
  provider: string;
}
