import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { extractFirstUrl } from '@/lib/shareText';

/**
 * Landing route for content shared into Ditto from another app's Share button
 * (Android share targets — see `AndroidManifest.xml` and `MainActivity.java`).
 *
 * Two modes, selected by the `mode` query param (set by the launched
 * activity-alias):
 *
 *   - `view` — "View in Ditto". Extract the first URL from the shared text and
 *     redirect to the external-content comment page (`/i/<url>`). If no URL is
 *     present, fall through to `post` so the share is never a dead end.
 *   - `post` — "Post on Ditto". Open the composer prefilled with the shared
 *     text to create a new note.
 *
 * The raw shared text arrives URL-encoded in the `text` param.
 */
export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const mode = params.get('mode') === 'view' ? 'view' : 'post';
  const text = params.get('text') ?? '';

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
