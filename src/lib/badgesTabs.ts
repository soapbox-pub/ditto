/**
 * The tabs on `/badges`, and how a link asks for one of them.
 *
 * The page's tab is a session preference: `useFeedTab` remembers the last one
 * and otherwise defaults to Follows. That is right for someone opening Badges
 * from the sidebar, and wrong for a link that means something specific — the
 * "Open Badges" action at the end of the Ditto Explorer reward flow means *take
 * me to my badges*, and it was landing on whichever tab the session happened to
 * be on.
 *
 * So a link can name a tab, in the URL, the same way `/search` does. The stable
 * identifier (`mine`) is what travels, never the visible label ("My Badges"),
 * which is free to change without breaking any link.
 */

/** Stable tab identifiers, independent of the labels the page displays. */
export type BadgesTab = 'mine' | 'follows';

export const BADGES_TABS: readonly BadgesTab[] = ['mine', 'follows'];

/** The query parameter `/badges` reads a requested tab from. Mirrors `/search`. */
export const BADGES_TAB_PARAM = 'tab';

/** A requested tab, or `undefined` for anything the page does not offer. */
export function parseBadgesTab(raw: string | null | undefined): BadgesTab | undefined {
  return BADGES_TABS.includes(raw as BadgesTab) ? (raw as BadgesTab) : undefined;
}

/**
 * Which tab `/badges` shows: a tab named in the URL beats the session
 * preference, and anything else leaves the preference alone.
 */
export function resolveBadgesTab(
  requested: string | null | undefined,
  stored: BadgesTab,
): BadgesTab {
  return parseBadgesTab(requested) ?? stored;
}

/** A link to `/badges` with `tab` explicitly selected. */
export function badgesPath(tab: BadgesTab): string {
  return `/badges?${BADGES_TAB_PARAM}=${tab}`;
}

/**
 * Where every "Open Badges" action in the Ditto Explorer reward flow goes.
 *
 * Shared by the reward panel and the ceremony's closing action so the two
 * cannot disagree. It promises a destination and nothing more: the badge is
 * claimed, not necessarily issued yet, and the copy beside these buttons says
 * so. Nothing here selects a badge, asserts ownership, or waits on the issuer.
 */
export const DITTO_EXPLORER_BADGES_DESTINATION = badgesPath('mine');
