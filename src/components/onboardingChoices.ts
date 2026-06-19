/**
 * Shared, non-component onboarding constants and types.
 *
 * Extracted from `InitialSyncGate.tsx` so they can be imported by both the
 * onboarding flow and the dev-only playground without tripping
 * `react-refresh/only-export-components` (which wants component files to export
 * only components). Pure data/types — no React, no side effects.
 */

// Steps for signup (includes welcome + keygen + profile) vs. settings-only (existing login)
export type SignupStep = "welcome" | "keygen" | "download" | "profile";
export type SettingsStep = "theme" | "follows" | "outro";
export type Step = SignupStep | SettingsStep;
