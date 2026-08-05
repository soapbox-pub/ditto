import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import type { ReactElement } from 'react';

import { WidgetSidebar } from './WidgetSidebar';

/**
 * Where the desktop mission surface is allowed to appear.
 *
 * Two rules matter, and both were previously wrong:
 *  1. It must appear on Home. The old guard suppressed `/` and `/feed` on the
 *     assumption that `/` renders the feed — but `/` renders whatever the user
 *     chose as their homepage, so anyone with a different homepage got no
 *     desktop mission surface at all.
 *  2. It must *not* appear on `/missions`, which renders the mission in full in
 *     the centre column — the one route where the widget genuinely duplicates.
 */

vi.mock('@/components/MissionsWidget', () => ({
  MissionsWidget: () => <div data-testid="mission-widget" />,
}));
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appId: 'ditto', sidebarWidgets: [] } }),
}));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: null }) }));
vi.mock('@/hooks/useEncryptedSettings', () => ({
  useEncryptedSettings: () => ({ settings: undefined, updateSettings: { mutateAsync: vi.fn() } }),
}));

function renderAt(path: string): ReactElement {
  return (
    <IntlProvider locale="en">
      <MemoryRouter initialEntries={[path]}>
        <WidgetSidebar />
      </MemoryRouter>
    </IntlProvider>
  );
}

describe('mission widget placement in the widget sidebar', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['/', '/feed', '/search', '/trends', '/notifications', '/themes'])(
    'renders the mission widget on %s',
    (path) => {
      render(renderAt(path));
      expect(screen.getByTestId('mission-widget')).toBeInTheDocument();
    },
  );

  it('does not render the widget on /missions', () => {
    render(renderAt('/missions'));
    expect(screen.queryByTestId('mission-widget')).not.toBeInTheDocument();
  });

  it('renders exactly one mission surface per route', () => {
    for (const path of ['/', '/search', '/trends']) {
      const { unmount } = render(renderAt(path));
      expect(screen.getAllByTestId('mission-widget')).toHaveLength(1);
      unmount();
    }
  });
});
