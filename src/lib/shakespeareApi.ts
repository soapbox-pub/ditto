import type { NUser } from '@nostrify/react/login';

export const SHAKESPEARE_API_URL = 'https://ai.shakespeare.diy/v1';

/**
 * Create a NIP-98 auth token for Shakespeare AI requests.
 *
 * Shared between `useShakespeare`'s hand-rolled fetch calls and the OpenAI
 * SDK client that `AgentSession` uses, so every request to the endpoint is
 * signed the same way.
 */
export async function createNIP98Token(
  method: string,
  url: string,
  body?: unknown,
  user?: NUser,
): Promise<string> {
  if (!user?.signer) {
    throw new Error('User signer is required for NIP-98 authentication');
  }

  const tags: string[][] = [
    ['u', url],
    ['method', method],
  ];

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    const bodyString = JSON.stringify(body);
    const encoder = new TextEncoder();
    const data = encoder.encode(bodyString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const payloadHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    tags.push(['payload', payloadHash]);
  }

  const event = await user.signer.signEvent({
    kind: 27235,
    content: '',
    tags,
    created_at: Math.floor(Date.now() / 1000),
  });

  return btoa(JSON.stringify(event));
}
