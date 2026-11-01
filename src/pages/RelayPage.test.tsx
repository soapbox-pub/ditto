import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { LayoutStore, LayoutStoreContext } from '@/contexts/LayoutContext';
import { TestApp } from '@/test/TestApp';
import { RelayPage } from './RelayPage';

describe('RelayPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('asks before contacting a relay on the local network', async () => {
    const fetchSpy = vi.fn(async (_url: string) => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);
    const sockets: string[] = [];
    vi.stubGlobal('WebSocket', class {
      constructor(url: string) {
        sockets.push(String(url));
        throw new Error('blocked in test');
      }
    });
    const contacted = () => [...fetchSpy.mock.calls.map(([url]) => String(url)), ...sockets]
      .filter((url) => url.includes('192.168.1.1'));

    window.history.pushState({}, '', `/r/${encodeURIComponent('wss://192.168.1.1:8080')}`);
    render(
      <TestApp>
        <LayoutStoreContext.Provider value={new LayoutStore()}>
          <Routes>
            <Route path="/r/*" element={<RelayPage />} />
          </Routes>
        </LayoutStoreContext.Provider>
      </TestApp>,
    );

    const connect = await screen.findByRole('button', { name: 'Connect anyway' }, { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(contacted()).toEqual([]);

    fireEvent.click(connect);
    await waitFor(() => expect(contacted()).not.toEqual([]));
  });
});
