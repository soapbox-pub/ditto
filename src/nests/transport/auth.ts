import type { NostrSigner } from "@nostrify/nostrify";

/**
 * Authenticate with a moq-auth service using NIP-98.
 *
 * @param authUrl - The moq-auth service URL (e.g., "https://moq-auth.example.com")
 * @param signer - Nostrify-compatible Nostr event signer
 * @param namespace - MoQ namespace to request access to
 * @param publish - Whether to request publish rights
 * @returns JWT token for moq-relay
 */
export async function authenticateWithMoqRelay(
  authUrl: string,
  signer: NostrSigner,
  namespace: string,
  publish: boolean,
): Promise<string> {
  const url = `${authUrl}/auth`;

  // Build NIP-98 auth event (kind 27235)
  const event = await signer.signEvent({
    kind: 27235,
    content: "",
    tags: [
      ["u", url],
      ["method", "POST"],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  const authHeader = `Nostr ${btoa(JSON.stringify(event))}`;

  // In dev, route the default nostrnests auth server through the Vite proxy
  // (see vite.config.ts) — its CORS policy only allows the nostrnests.com
  // origin. The `u` tag above still signs the real URL; the server compares
  // host+path from the proxied request, so validation passes. Other auth
  // servers are fetched directly (self-hosted dev servers default to
  // permissive CORS).
  let fetchUrl = url;
  if (import.meta.env.DEV) {
    try {
      if (new URL(authUrl).hostname === "moq-auth.nostrnests.com") {
        fetchUrl = "/moq-auth/auth";
      }
    } catch {
      // keep direct URL
    }
  }

  const response = await fetch(fetchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      namespace,
      publish,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`moq-auth failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}
