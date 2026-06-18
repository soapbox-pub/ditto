import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAppContext } from "@/hooks/useAppContext";
import { ONBOARDING_SEARCH_KEY } from "@/lib/onboardingHandoff";
import { getStorageKey } from "@/lib/storageKey";

/**
 * Reads the one-shot onboarding Search handoff written by the conversations
 * intent's topics step. When a just-onboarded user picked first-explore topics,
 * `SetupQuestionnaire` seeds a search query into sessionStorage on completion;
 * this component (rendered inside the router, where `useNavigate` is available)
 * consumes that key exactly once and routes the user to the Search experience
 * for those topics.
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
    let query: string | null = null;
    try {
      query = sessionStorage.getItem(key);
      if (query) sessionStorage.removeItem(key);
    } catch {
      // sessionStorage unavailable — nothing to hand off.
      return;
    }

    handled.current = true;

    const trimmed = query?.trim();
    if (!trimmed) return;

    // Only steer the just-onboarded user from the landing route. If they've
    // already navigated elsewhere by the time this mounts, leave them be.
    if (location.pathname !== "/") return;

    navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true });
  }, [config.appId, navigate, location.pathname]);

  return null;
}
