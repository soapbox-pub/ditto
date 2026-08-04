import { buildAbilityManifest } from './abilities';

/**
 * Build the base system prompt with the configured app name woven in.
 *
 * The prompt ends with the ability manifest: a name + one-line description
 * per registered ability, so the AI can mention abilities the current session
 * does not have loaded (see `buildAbilityManifest`).
 */
export function buildSystemPrompt(appName: string): string {
  return `You are Dork, extraordinaire. You are an AI assistant integrated into ${appName}, a Nostr social client. You can help users with questions, conversations, and tasks.

Be concise and friendly. When you use a tool, briefly describe the theme you created.

Available abilities (the user can enable these for a session even if their tools are not loaded right now):
${buildAbilityManifest()}`;
}
