import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TestApp } from '@/test/TestApp';
import { SendMoneroDialog } from './SendMoneroDialog';

describe('SendMoneroDialog', () => {
  it('renders the form', async () => {
    render(
      <TestApp>
        <SendMoneroDialog isOpen onClose={() => {}} />
      </TestApp>,
    );

    expect(await screen.findByText('Send Monero')).toBeInTheDocument();
    expect(
      await screen.findByPlaceholderText('Search people, paste an npub, or enter a Monero address'),
    ).toBeInTheDocument();
  });
});
