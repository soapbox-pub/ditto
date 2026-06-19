/**
 * sessionStorage key suffix holding the onboarding Search handoff for a
 * just-onboarded user. Written on signup completion by `SetupQuestionnaire`
 * when the conversations-intent topics step produced selections; read once by
 * `OnboardingTopicsHandoff` (inside the router), then cleared.
 *
 * Namespace it with `getStorageKey(config.appId, ONBOARDING_SEARCH_KEY)`.
 * Onboarding-local only — never written to Nostr.
 */
export const ONBOARDING_SEARCH_KEY = "onboarding:explore-search";

/**
 * A single topic chosen during onboarding, reduced to just what the handoff
 * needs to route. `label` is the bare term (no leading `#`); `isHashtag` marks
 * topics the user typed with a `#`.
 */
export interface HandoffTopic {
  label: string;
  isHashtag?: boolean;
}

/** Structured payload stored in sessionStorage for the Search handoff. */
export interface OnboardingHandoffPayload {
  /** Schema marker so we can distinguish this from a legacy plain string. */
  v: 1;
  topics: HandoffTopic[];
}

/**
 * The route the handoff should send the user to.
 *
 * Ditto's Search (`/search?q=`) passes the raw query straight to the relay's
 * NIP-50 `search` field with no tokenization — so a space-joined multi-topic
 * string (`"Music Games Design"`) is treated as one phrase and effectively
 * never matches. Hashtags fare even worse there: Search has no `#`-awareness,
 * whereas Ditto already has a dedicated, indexed hashtag feed at `/t/:tag`.
 *
 * So we route each case to the *best existing* experience rather than to a
 * broken phrase query:
 *
 *   - a hashtag topic  → `/t/:tag`        (the indexed hashtag feed)
 *   - a plain topic    → `/search?q=term` (single-term full-text search)
 *
 * Multiple topics degrade gracefully to the first/primary one, because Search
 * genuinely can't OR several terms together today.
 */
export type HandoffDestination =
  | { kind: "hashtag"; tag: string; path: string }
  | { kind: "search"; query: string; path: string }
  | null;

function normalizeTag(label: string): string {
  return label.trim().toLowerCase().replace(/^#+/, "");
}

/** Build the destination for a single topic, or `null` if it's empty. */
function topicDestination(topic: HandoffTopic): HandoffDestination {
  const label = topic.label.trim();
  if (!label) return null;

  if (topic.isHashtag) {
    const tag = normalizeTag(label);
    if (!tag) return null;
    return { kind: "hashtag", tag, path: `/t/${encodeURIComponent(tag)}` };
  }

  return {
    kind: "search",
    query: label,
    path: `/search?q=${encodeURIComponent(label)}`,
  };
}

/**
 * Resolve the stored handoff value (either the structured JSON payload or a
 * legacy plain query string) into a single destination.
 *
 * Multiple topics intentionally collapse to the first one: Search can't combine
 * terms, so we hand the user one clear, working experience instead of a phrase
 * query that matches nothing. Returns `null` when there's nothing to route to.
 */
export function resolveHandoffDestination(raw: string | null): HandoffDestination {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Structured payload (current format).
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<OnboardingHandoffPayload>;
      if (parsed && Array.isArray(parsed.topics)) {
        for (const topic of parsed.topics) {
          if (!topic || typeof topic.label !== "string") continue;
          const dest = topicDestination({
            label: topic.label,
            isHashtag: topic.isHashtag === true,
          });
          if (dest) return dest;
        }
        return null;
      }
    } catch {
      // Fall through to legacy plain-string handling.
    }
  }

  // Legacy / manual plain-string format: take the first whitespace-separated
  // token so a multi-word value doesn't become a broken phrase search.
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  if (!firstToken) return null;
  if (firstToken.startsWith("#")) {
    return topicDestination({ label: firstToken.slice(1), isHashtag: true });
  }
  return topicDestination({ label: firstToken });
}

/**
 * Serialize selected onboarding topics into the structured handoff payload, or
 * `null` when nothing routable was selected. Stored verbatim in sessionStorage.
 */
export function buildHandoffPayload(topics: HandoffTopic[]): string | null {
  const cleaned = topics
    .map((t) => ({ label: t.label.trim(), isHashtag: t.isHashtag === true }))
    .filter((t) => t.label.length > 0);
  if (cleaned.length === 0) return null;
  const payload: OnboardingHandoffPayload = { v: 1, topics: cleaned };
  return JSON.stringify(payload);
}
