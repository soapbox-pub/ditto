/**
 * Welcome tour step definitions — declarative array consumed by WelcomeTourFlow.
 *
 * Each step renders inside a WelcomeTourCard with:
 *   - the user's actual Blobbi at small size (emotion overridden per step)
 *   - a typewriter speech bubble (`blobbiSpeech`)
 *   - the per-step `preview` slot (illustration/mini-component)
 *   - title + description body copy
 *   - optional `tryIt` deep-link
 */

import type { ReactNode } from 'react';

import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotion-types';

import {
  BadgesPreview,
  BlobbiHubPreview,
  EmojiPacksPreview,
  FirstPostPreview,
  FollowHashtagsPreview,
  FollowPeoplePreview,
  LettersPreview,
  MoreSidebarPreview,
  ThemesPreview,
  WelcomePreview,
} from './welcome-tour-previews';

export interface WelcomeTourStep {
  id: string;
  emotion: BlobbiEmotion;
  title: string;
  blobbiSpeech: string;
  description: string;
  preview: ReactNode;
  /** If set, the card renders a "Try it" button that closes the tour and navigates to `route`. */
  tryIt?: { label: string; route: string };
  /** Entry card — uses the "Show me around" / "Let's go" button pair instead of "Next" / "Skip". */
  isEntry?: boolean;
  /** Last card — primary button reads "Finish". */
  isFinal?: boolean;
}

export const WELCOME_TOUR_STEPS: WelcomeTourStep[] = [
  {
    id: 'welcome',
    emotion: 'excited',
    title: 'Welcome to Ditto!',
    blobbiSpeech: "I'm your Blobbi! Let me show you around the cool stuff.",
    description:
      "There's a whole weird world in here — Letters, Badges, Themes, custom Emoji packs, daily quests, and more. Ready?",
    preview: <WelcomePreview />,
    isEntry: true,
  },
  {
    id: 'blobbi',
    emotion: 'curious',
    title: 'Meet Blobbi',
    blobbiSpeech: "Feed me. Sing to me. Send me on quests. I'll grow with you.",
    description:
      "I'm your Nostr-native companion. I have stats, daily missions, and evolution quests. Visit my page anytime to play, feed, clean, or sing.",
    preview: <BlobbiHubPreview />,
    tryIt: { label: 'Visit Blobbi', route: '/blobbi' },
  },
  {
    id: 'themes',
    emotion: 'adoring',
    title: 'Themes',
    blobbiSpeech: 'Make Ditto look how YOU want!',
    description:
      'Pick a theme, tweak the colors, change the fonts, even set a background image. Or design your own from scratch and publish it for others to use.',
    preview: <ThemesPreview />,
    tryIt: { label: 'Browse themes', route: '/themes' },
  },
  {
    id: 'emoji-packs',
    emotion: 'excitedB',
    title: 'Emoji Packs',
    blobbiSpeech: 'Custom emoji! Build packs. Share them. Use them everywhere.',
    description:
      "Create your own emoji pack with images and shortcodes, publish it, and use it across Nostr. Subscribe to other people's packs too.",
    preview: <EmojiPacksPreview />,
    tryIt: { label: 'Open emoji packs', route: '/emojis' },
  },
  {
    id: 'letters',
    emotion: 'happy',
    title: 'Letters',
    blobbiSpeech: 'Send a sealed letter to a friend. Cozy.',
    description:
      'Long-form encrypted letters with stationery, wax seals, and your avatar. Like Wii Mail for Nostr.',
    preview: <LettersPreview />,
    tryIt: { label: 'Compose a letter', route: '/letters/compose' },
  },
  {
    id: 'badges',
    emotion: 'mischievous',
    title: 'Badges',
    blobbiSpeech: 'Shiny things! Collect them. Give them to friends.',
    description:
      'Earn achievement badges, award them to others, and show off the ones you collect on your profile.',
    preview: <BadgesPreview />,
    tryIt: { label: 'See badges', route: '/badges' },
  },
  {
    id: 'follow-people',
    emotion: 'curious',
    title: 'Follow people',
    blobbiSpeech: 'Find your people. Build your feed.',
    description:
      'Your home feed shows posts from accounts you follow. Tap a profile to follow them — or browse suggestions on the feed.',
    preview: <FollowPeoplePreview />,
    tryIt: { label: 'Go to feed', route: '/' },
  },
  {
    id: 'follow-hashtags',
    emotion: 'excited',
    title: 'Follow topics',
    blobbiSpeech: '#nostr, #photography, #bitcoin… follow whatever you love.',
    description:
      'Subscribe to hashtags to make them part of your interests. Tap any hashtag to view its feed and follow.',
    preview: <FollowHashtagsPreview />,
    tryIt: { label: 'Try #nostr', route: '/t/nostr' },
  },
  {
    id: 'more-sidebar',
    emotion: 'surprised',
    title: 'There is so much More',
    blobbiSpeech: 'Pssst — more stuff lives in the More menu.',
    description:
      'Videos, podcasts, music, polls, the World map, color moments, decks, treasures… the More menu in your sidebar surfaces everything that’s not on the main nav.',
    preview: <MoreSidebarPreview />,
  },
  {
    id: 'first-post',
    emotion: 'adoring',
    title: 'Make your first post',
    blobbiSpeech: 'Tap the + button and say hi to the world!',
    description:
      "You're ready! Head back to the feed, hit the floating + button, and write your first note. Welcome to Ditto.",
    preview: <FirstPostPreview />,
    isFinal: true,
  },
];
