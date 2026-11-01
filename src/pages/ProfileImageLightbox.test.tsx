import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { TestApp } from '@/test/TestApp';
import { ProfileImageLightbox } from './ProfilePage';

const openUrl = vi.fn(async (_url: string) => true);
vi.mock('@/lib/downloadFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/downloadFile')>()),
  openUrl: (url: string) => openUrl(url),
}));

describe('ProfileImageLightbox', () => {
  beforeEach(() => {
    openUrl.mockClear();
  });

  it('opens an https picture URL', async () => {
    render(
      <TestApp>
        <ProfileImageLightbox imageUrl="https://example.com/me.png" onClose={() => {}} />
      </TestApp>,
    );

    fireEvent.click(await screen.findByTitle('Open original'));
    expect(openUrl).toHaveBeenCalledWith('https://example.com/me.png');
  });

  it('does not hand a non-https picture URL to openUrl', async () => {
    render(
      <TestApp>
        <ProfileImageLightbox imageUrl="magnet:?xt=urn:btih:abc" onClose={() => {}} />
      </TestApp>,
    );

    fireEvent.click(await screen.findByTitle('Open original'));
    expect(openUrl).not.toHaveBeenCalled();
  });
});
