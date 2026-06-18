/**
 * sessionStorage key suffix holding the search query the just-onboarded user
 * should land on. Written on signup completion by `SetupQuestionnaire` when the
 * conversations-intent topics step produced a query; read once by
 * `OnboardingTopicsHandoff` (inside the router), then cleared.
 *
 * Namespace it with `getStorageKey(config.appId, ONBOARDING_SEARCH_KEY)`.
 * Onboarding-local only — never written to Nostr.
 */
export const ONBOARDING_SEARCH_KEY = "onboarding:explore-search";
