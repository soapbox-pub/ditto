import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { extractFirstUrl } from '@/lib/shareText';

/**
 * Landing route for content shared into Ditto from another app's Share button.
 * Reached two ways:
 *
 *   - Android share targets (native app) — see `AndroidManifest.xml` and
 *     `MainActivity.java`. The raw shared text arrives URL-encoded in the
 *     `text` param, and the launched activity-alias sets `mode`.
 *   - Web Share Target (installed PWA) — see `share_target` in
 *     `public/manifest.webmanifest`. The browser delivers `title`, `text`,
 *     and `url` as separate params (which of them are populated varies by
 *     source app) and no `mode`, so PWA shares default to `post`.
 *
 * Two modes, selected by the `mode` query param:
 *
 *   - `view` — "View in Ditto". Extract the first URL from the shared text and
 *     redirect to the external-content comment page (`/i/<url>`). If no URL is
 *     present, fall through to `post` so the share is never a dead end.
 *   - `post` — "Post on Ditto". Open the composer prefilled with the shared
 *     text to create a new note.
 */
export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const mode = params.get('mode') === 'view' ? 'view' : 'post';
  const rawText = params.get('text') ?? '';
  const title = params.get('title') ?? '';
  const url = params.get('url') ?? '';

  // Merge the Web Share Target's separate title/text/url params into a single
  // text blob, skipping parts already contained in the text (some apps put the
  // URL in `text`, others in `url`, others in both). Native Android shares
  // only populate `text`, so this is a no-op for them.
  const text = useMemo(() => {
    const parts: string[] = [];
    if (title && !rawText.includes(title)) parts.push(title);
    if (rawText) parts.push(rawText);
    if (url && !rawText.includes(url)) parts.push(url);
    return parts.join('\n');
  }, [title, rawText, url]);

  // For `view` mode, try to extract a URL up front so we can decide whether to
  // redirect to the comment page or fall back to composing a post.
  const extractedUrl = useMemo(
    () => (mode === 'view' ? extractFirstUrl(text) : undefined),
    [mode, text],
  );

  const shouldRedirectToComments = mode === 'view' && !!extractedUrl;

  // Open the composer for `post` mode, or for `view` mode when no URL was found.
  const [composeOpen, setComposeOpen] = useState(!shouldRedirectToComments);

  useEffect(() => {
    if (shouldRedirectToComments && extractedUrl) {
      navigate(`/i/${encodeURIComponent(extractedUrl)}`, { replace: true });
    }
  }, [shouldRedirectToComments, extractedUrl, navigate]);

  // While redirecting to the comment page, render nothing.
  if (shouldRedirectToComments) {
    return null;
  }

  return (
    <ReplyComposeModal
      open={composeOpen}
      onOpenChange={(open) => {
        setComposeOpen(open);
        if (!open) {
          // Closing the composer (cancel or after a successful post) returns
          // the user to the home feed rather than a blank /share route.
          navigate('/', { replace: true });
        }
      }}
      initialContent={text}
    />
  );
}

export default SharePage;
