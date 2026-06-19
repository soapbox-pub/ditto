/**
 * Shared, non-component onboarding constants and types.
 *
 * Extracted from `InitialSyncGate.tsx` so they can be imported by both the
 * onboarding flow and the dev-only playground without tripping
 * `react-refresh/only-export-components` (which wants component files to export
 * only components). Pure data/types — no React, no side effects.
 */

// Steps for signup (includes welcome + keygen + profile) vs. settings-only (existing login)
export type SignupStep =
  | "welcome"
  | "keygen"
  | "download"
  | "profile"
  | "topics";
export type SettingsStep = "theme" | "follows" | "outro";
export type Step = SignupStep | SettingsStep;

/**
 * Lightweight, non-technical welcome-card choices. The selected ids lightly
 * shape the copy/framing of later onboarding steps. Onboarding-local only —
 * never persisted to local storage or Nostr.
 */
export const WELCOME_CHOICES: { id: string; emoji: string; label: string }[] = [
  { id: "personal", emoji: "🪴", label: "Feel more like my space" },
  { id: "control", emoji: "🎛️", label: "Give me more control" },
  { id: "conversations", emoji: "💬", label: "Show better conversations" },
  { id: "fun", emoji: "✨", label: "Make posting fun again" },
  { id: "weird", emoji: "🧪", label: "Try weird internet things" },
  { id: "fresh", emoji: "🌱", label: "Give me a fresh start" },
];

/**
 * The id of a welcome card. The user can pick several; the rest of the flow
 * only ever acts on a single *primary* intent.
 */
export type WelcomeIntent =
  | "conversations"
  | "fun"
  | "personal"
  | "control"
  | "weird"
  | "fresh";

/**
 * Suggested first-explore topics, shown only to users whose primary welcome
 * intent is "conversations". The step is single-select: the user picks one of
 * these (or types their own). Ordering is intentional: more general/normal
 * interests lead, and the more Nostr/Bitcoin/Open-Source-specific topics sit
 * toward the end so the step feels welcoming rather than crypto-forward.
 *
 * Selections are onboarding-local only — never persisted to Nostr.
 */
export const TOPIC_CHOICES: { id: string; label: string }[] = [
  { id: "music", label: "Music" },
  { id: "art", label: "Art" },
  { id: "games", label: "Games" },
  { id: "photography", label: "Photography" },
  { id: "writing", label: "Writing" },
  { id: "design", label: "Design" },
  { id: "memes", label: "Memes" },
  { id: "books", label: "Books" },
  { id: "movies", label: "Movies" },
  { id: "tech", label: "Tech" },
  { id: "indieweb", label: "Indie Web" },
  { id: "opensource", label: "Open Source" },
  { id: "bitcoin", label: "Bitcoin" },
  { id: "nostr", label: "Nostr" },
];

/**
 * A selected topic. Preset topics carry their stable id (so the chip toggles
 * correctly); custom topics are id-less and identified by their label. The
 * `label` is what the user sees and what feeds the Search query / outro copy.
 * `isHashtag` is true when a custom topic was typed with a leading `#`.
 *
 * The conversations-intent topics step is single-select — at most one topic is
 * ever chosen — because the post-onboarding handoff can only route to one place.
 */
export interface SelectedTopic {
  /** Stable id for preset topics; absent for user-added custom topics. */
  id?: string;
  /** Display label (and the term used for search / outro copy). */
  label: string;
  /** Custom topics typed with a leading `#` are treated as hashtags. */
  isHashtag?: boolean;
}
