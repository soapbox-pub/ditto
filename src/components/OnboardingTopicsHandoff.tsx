import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAppContext } from "@/hooks/useAppContext";
import {
  ONBOARDING_SEARCH_KEY,
  resolveHandoffDestination,
} from "@/lib/onboardingHandoff";
import { getStorageKey } from "@/lib/storageKey";

/**
 * Reads the one-shot onboarding Search handoff written by the conversations
 * intent's topics step. When a just-onboarded user picked first-explore topics,
 * `SetupQuestionnaire` seeds a structured payload into sessionStorage on
 * completion; this component (rendered inside the router, where `useNavigate` is
 * available) consumes that key exactly once and routes the user to the best
 * existing experience for those topics.
 *
 * Routing (see `resolveHandoffDestination`): a hashtag topic goes to the indexed
 * `/t/:tag` hashtag feed; a plain topic goes to single-term `/search?q=`.
 * Multiple topics collapse to the first one, because Search can't OR several
 * terms into a useful query today — so we hand over one clear, working view
 * rather than a space-joined phrase that matches nothing.
 *
 * Why sessionStorage instead of a direct navigate(): `InitialSyncGate` wraps
 * `AppRouter`, so it lives *outside* the `<BrowserRouter>` and can't call
 * `useNavigate`. A sessionStorage handoff bridges the two without coupling them.
 *
 * Fallback: if there's no key (no topics, or a non-conversations intent), this
 * is a no-op and the user keeps the normal Ditto feed landing. Onboarding-local
 * only — nothing here touches Nostr.
 *
 * Must be rendered inside a `<BrowserRouter>`.
 */
export function OnboardingTopicsHandoff() {
  const navigate = useNavigate();
  const location = useLocation();
  const { config } = useAppContext();
  // Guard so we navigate at most once per app session.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    const key = getStorageKey(config.appId, ONBOARDING_SEARCH_KEY);
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(key);
      if (raw) sessionStorage.removeItem(key);
    } catch {
      // sessionStorage unavailable — nothing to hand off.
      return;
    }

    handled.current = true;

    const destination = resolveHandoffDestination(raw);
    if (!destination) return;

    // Only steer the just-onboarded user from the landing route. If they've
    // already navigated elsewhere by the time this mounts, leave them be.
    if (location.pathname !== "/") return;

    navigate(destination.path, { replace: true });
  }, [config.appId, navigate, location.pathname]);

  return null;
}
