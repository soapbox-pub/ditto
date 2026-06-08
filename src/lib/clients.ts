/** Known client tag values tracked by the client metrics charts. */
export interface ClientDef {
  /** The exact value(s) of the `client` tag on Nostr events. Multiple values are OR'd in the filter. */
  tags: string[];
  /** Display label. */
  label: string;
  /** Chart/UI color. */
  color: string;
}

export const CLIENTS: ClientDef[] = [
  { tags: ['Ditto'], label: 'Ditto', color: 'hsl(221, 83%, 53%)' },
  { tags: ['Agora'], label: 'Agora', color: 'hsl(25, 95%, 53%)' },
  {
    tags: [
      'diVine',
      'divine-web',
      'divine-web/1.0',
      'divine-mobile/1.0',
      'diVine_bug_report',
      'divine.video',
      'openvine',
    ],
    label: 'diVine',
    color: 'hsl(280, 68%, 55%)',
  },
  { tags: ['Amethyst'], label: 'Amethyst', color: 'hsl(258, 70%, 55%)' },
  { tags: ['Primal Web', 'Primal Android'], label: 'Primal', color: 'hsl(348, 83%, 47%)' },
  { tags: ['Wisp'], label: 'Wisp', color: 'hsl(170, 75%, 42%)' },
];

/**
 * Build the `/client/:name` link for a client, preserving all of its `#client`
 * tags. The first tag becomes the path segment; any additional tags are
 * appended as `client` query parameters, e.g.
 * `/client/Primal%20Web?client=Primal%20Android`.
 */
export function clientPath(tags: string[]): string {
  const [first, ...rest] = tags;
  if (!first) return '/client';
  const base = `/client/${encodeURIComponent(first)}`;
  if (rest.length === 0) return base;
  const params = rest.map((t) => `client=${encodeURIComponent(t)}`).join('&');
  return `${base}?${params}`;
}
