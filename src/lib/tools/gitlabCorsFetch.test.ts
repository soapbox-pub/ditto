import { describe, it, expect, vi } from 'vitest';

import { createCorsFriendlyGitLabFetch } from './gitlabCorsFetch';

/**
 * Contract tests for createCorsFriendlyGitLabFetch in gitlabCorsFetch.
 *
 * The devkit fetcher builds raw-file URLs of the form
 * https://gitlab.com/soapbox-pub/nostr-canvas/-/raw/{ref}/{path} and calls its
 * fetchImpl with the URL as a plain string. The wrapper under test rewrites
 * that shape to GitLab's API v4 form, which sends CORS headers. It must call
 * the delegate with a string, not a URL object.
 */

const DEFAULT_RESPONSE = { ok: true, status: 200 };

const RAW_URL_TOP_LEVEL = 'https://gitlab.com/soapbox-pub/nostr-canvas/-/raw/v0.14.6/PHILOSOPHY.md';
const REWRITTEN_TOP_LEVEL =
  'https://gitlab.com/api/v4/projects/soapbox-pub%2Fnostr-canvas/repository/files/PHILOSOPHY.md/raw?ref=v0.14.6';

const RAW_URL_NESTED =
  'https://gitlab.com/soapbox-pub/nostr-canvas/-/raw/v0.14.6/tips/TIP-01-tile-definition-and-registration.md';
const REWRITTEN_NESTED =
  'https://gitlab.com/api/v4/projects/soapbox-pub%2Fnostr-canvas/repository/files/tips%2FTIP-01-tile-definition-and-registration.md/raw?ref=v0.14.6';

describe('createCorsFriendlyGitLabFetch', () => {
  it('rewrites a top-level raw file URL to the CORS-friendly API v4 form', async () => {
    const delegate = vi.fn().mockResolvedValue(DEFAULT_RESPONSE);
    const wrapped = createCorsFriendlyGitLabFetch(delegate);

    await wrapped(RAW_URL_TOP_LEVEL);

    expect(delegate).toHaveBeenCalledTimes(1);
    expect(delegate).toHaveBeenCalledWith(REWRITTEN_TOP_LEVEL);
  });

  it('percent-encodes the slash inside a nested file path', async () => {
    const delegate = vi.fn().mockResolvedValue(DEFAULT_RESPONSE);
    const wrapped = createCorsFriendlyGitLabFetch(delegate);

    await wrapped(RAW_URL_NESTED);

    expect(delegate).toHaveBeenCalledWith(REWRITTEN_NESTED);
  });

  it('preserves a non-semver ref such as main in the query param', async () => {
    const delegate = vi.fn().mockResolvedValue(DEFAULT_RESPONSE);
    const wrapped = createCorsFriendlyGitLabFetch(delegate);

    await wrapped('https://gitlab.com/soapbox-pub/nostr-canvas/-/raw/main/tips/TIP-01-tile-definition-and-registration.md');

    expect(delegate).toHaveBeenCalledWith(
      'https://gitlab.com/api/v4/projects/soapbox-pub%2Fnostr-canvas/repository/files/tips%2FTIP-01-tile-definition-and-registration.md/raw?ref=main',
    );
  });

  it('passes the delegate return value through unchanged', async () => {
    const distinctive = { ok: true, status: 200 };
    const delegate = vi.fn().mockResolvedValue(distinctive);
    const wrapped = createCorsFriendlyGitLabFetch(delegate);

    const result = await wrapped(RAW_URL_TOP_LEVEL);

    expect(result).toBe(distinctive);
  });

  it('passes a non-matching URL to the delegate unchanged', async () => {
    const delegate = vi.fn().mockResolvedValue(DEFAULT_RESPONSE);
    const wrapped = createCorsFriendlyGitLabFetch(delegate);
    const url = 'https://example.com/foo';

    await wrapped(url);

    expect(delegate).toHaveBeenCalledWith(url);
  });

  it('defaults the delegate to the global fetch', async () => {
    const globalFetch = vi.fn().mockResolvedValue(DEFAULT_RESPONSE);
    vi.stubGlobal('fetch', globalFetch);
    try {
      const wrapped = createCorsFriendlyGitLabFetch();

      expect(wrapped).toBeTypeOf('function');

      const url = 'https://example.com/foo';
      await wrapped(url);

      expect(globalFetch).toHaveBeenCalledWith(url);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
