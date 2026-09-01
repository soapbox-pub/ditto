/**
 * A one-slot buffer for the theme a user picks during the signup flow.
 *
 * The signup questionnaire shows its theme step FIRST — before the new key is
 * generated, and (in the "add another account" flow) while a previously-logged-
 * in account is still active. If `useTheme` persisted those picks the way it
 * normally does, it would sign a kind-30078 settings event and a kind-16767
 * profile-theme event with the CURRENTLY active account's signer — prompting the
 * user's extension to overwrite the theme on an account they aren't setting up.
 *
 * While capture is active, `useTheme` records the pick here instead of writing
 * or publishing anything. Once the new account is logged in, the signup flow
 * takes the draft and applies it to that account, where persistence and profile
 * publishing sign with the right key.
 *
 * A plain module-level buffer (not React state/context) because the write site
 * (`useTheme`, deep inside the theme grid) and the apply site (the signup flow,
 * after the account switch) live in different subtrees, and the flag has to be
 * readable synchronously at the moment a theme is tapped.
 */

import type { Theme } from "@/contexts/AppContext";
import type { ThemeConfig } from "@/themes";

/** The subset of a theme selection we need to reapply to the new account. */
export interface SignupThemeDraft {
  theme?: Theme;
  customTheme?: ThemeConfig;
}

let capturing = false;
let draft: SignupThemeDraft | null = null;

/** Start buffering theme picks instead of persisting them. Clears any old draft. */
export function beginSignupThemeCapture(): void {
  capturing = true;
  draft = null;
}

/** Stop buffering. Does not clear the draft — the caller still needs to take it. */
export function endSignupThemeCapture(): void {
  capturing = false;
}

/** Whether theme picks should be buffered rather than persisted right now. */
export function isCapturingSignupTheme(): boolean {
  return capturing;
}

/** Merge a theme pick into the pending draft. */
export function recordSignupThemeDraft(patch: SignupThemeDraft): void {
  draft = { ...draft, ...patch };
}

/** Return and clear the pending draft (null if the user never picked a theme). */
export function takeSignupThemeDraft(): SignupThemeDraft | null {
  const taken = draft;
  draft = null;
  return taken;
}
