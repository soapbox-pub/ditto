import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { TestApp } from '@/test/TestApp';
import { MentionAutocomplete } from './MentionAutocomplete';
import { useInsertText } from '@/hooks/useInsertText';
import { ABILITIES, type AbilityInfo } from '@/lib/abilities';
import type { SearchProfile } from '@/hooks/useSearchProfiles';

// Shared mutable state for the useSearchProfiles mock. vi.hoisted keeps it
// referenceable from the vi.mock factory below.
const mockState = vi.hoisted(() => ({
  profiles: [] as SearchProfile[],
}));

vi.mock('@/hooks/useSearchProfiles', () => ({
  useSearchProfiles: () => ({
    data: mockState.profiles,
    followedPubkeys: new Set<string>(),
  }),
}));

// MentionItem renders NIP-05 verification state; stub it out so no network
// request fires during tests.
vi.mock('@/hooks/useNip05Verify', () => ({
  useNip05Verify: () => ({ data: false }),
}));

const profileFixture: SearchProfile = {
  pubkey: '14c0d76aef07b990e4c7ebdc5d7d5a03e953857cc85f2d094673be85fc9caf63',
  metadata: {
    name: 'John Doe',
    display_name: 'John',
    about: '',
    picture: '',
  },
  event: {
    id: '795f3fd71250c9f99af51b270b917814dbf8c340b1f1e06bb6ac77ec14a6e02a',
    pubkey: '14c0d76aef07b990e4c7ebdc5d7d5a03e953857cc85f2d094673be85fc9caf63',
    created_at: 1700000000,
    kind: 0,
    tags: [],
    content: '{"name":"John Doe","display_name":"John"}',
    sig: 'f3553778f9c259272f880ef25f4a363e68267d825d1e219f81286c95e7320dbda4ad01f1829e7a814a3593df25b6bb1d27ab731e61015e4520e43a6123cf26bd',
  },
};

/**
 * Minimal host that wires MentionAutocomplete exactly like ComposeBox and
 * AIChatPage: a controlled textarea plus the shared useInsertText handler.
 */
function Harness({ abilities }: { abilities?: readonly AbilityInfo[] }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [content, setContent] = useState('');
  const { insertAtCursor } = useInsertText(textareaRef, setContent);

  return (
    <div>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a message"
        data-testid="message-input"
      />
      <MentionAutocomplete
        textareaRef={textareaRef}
        content={content}
        onInsertMention={insertAtCursor}
        abilities={abilities}
      />
    </div>
  );
}

/** Set the textarea value and caret, then fire the native input event. */
function setValue(textarea: HTMLTextAreaElement, value: string) {
  textarea.value = value;
  textarea.setSelectionRange(value.length, value.length);
  fireEvent.input(textarea);
}

/**
 * TestApp mounts the real NostrProvider/AppProvider/NostrLoginProvider tree,
 * not lightweight stubs. Their own async settling (config/auth/relay-list
 * loads) can still be in flight moments after `render()` returns, and an
 * ancestor re-render that lands at the same instant as our first fake
 * keystroke can race MentionAutocomplete's local isOpen/mentionQuery state.
 * Give the tree one real tick to settle before driving any interaction.
 */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('MentionAutocomplete', () => {
  beforeEach(() => {
    mockState.profiles = [];
  });

  it('shows abilities matching the mention query and hides them on a non-match', async () => {
    render(
      <TestApp>
        <Harness abilities={ABILITIES} />
      </TestApp>,
    );

    const textarea = (await screen.findByTestId('message-input')) as HTMLTextAreaElement;
    await settle();
    setValue(textarea, '@no');

    expect(await screen.findByText('Nostr Lookup')).toBeInTheDocument();

    // A query matching neither label nor description hides the ability.
    setValue(textarea, '@zzz');
    await waitFor(() => {
      expect(screen.queryByText('Nostr Lookup')).not.toBeInTheDocument();
    });
  });

  it('inserts an ability as plain text, not a nostr mention', async () => {
    render(
      <TestApp>
        <Harness abilities={ABILITIES} />
      </TestApp>,
    );

    const textarea = (await screen.findByTestId('message-input')) as HTMLTextAreaElement;
    await settle();
    setValue(textarea, '@no');

    const abilityItem = await screen.findByText('Nostr Lookup');
    fireEvent.pointerDown(abilityItem);

    await waitFor(() => {
      expect(textarea).toHaveValue('@Nostr Lookup ');
    });
    expect(textarea.value).not.toContain('nostr:');
  });

  it('keeps people mention behavior when the abilities prop is omitted', async () => {
    mockState.profiles = [profileFixture];

    render(
      <TestApp>
        <Harness />
      </TestApp>,
    );

    const textarea = (await screen.findByTestId('message-input')) as HTMLTextAreaElement;
    await settle();
    setValue(textarea, '@jo');

    const personItem = await screen.findByText('John Doe');
    fireEvent.pointerDown(personItem);

    await waitFor(() => {
      expect(textarea.value).toMatch(/^nostr:npub1/);
    });
  });

  it('lists people and abilities together in one dropdown', async () => {
    mockState.profiles = [profileFixture];

    render(
      <TestApp>
        <Harness abilities={ABILITIES} />
      </TestApp>,
    );

    const textarea = (await screen.findByTestId('message-input')) as HTMLTextAreaElement;
    await settle();
    setValue(textarea, '@o');

    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Nostr Lookup')).toBeInTheDocument();
  });

  it('removes combobox ARIA attributes from the textarea after unmount', async () => {
    const { unmount } = render(
      <TestApp>
        <Harness abilities={ABILITIES} />
      </TestApp>,
    );

    const textarea = (await screen.findByTestId('message-input')) as HTMLTextAreaElement;
    await settle();
    setValue(textarea, '@no');
    await screen.findByText('Nostr Lookup');

    // Dropdown open: all four attributes are on the textarea.
    expect(textarea).toHaveAttribute('role', 'combobox');
    expect(textarea).toHaveAttribute('aria-controls');
    expect(textarea).toHaveAttribute('aria-expanded', 'true');
    expect(textarea).toHaveAttribute('aria-activedescendant');

    unmount();

    expect(textarea).not.toHaveAttribute('role');
    expect(textarea).not.toHaveAttribute('aria-controls');
    expect(textarea).not.toHaveAttribute('aria-expanded');
    expect(textarea).not.toHaveAttribute('aria-activedescendant');
  });

  it('keeps aria-controls off the textarea while the dropdown is closed', async () => {
    render(
      <TestApp>
        <Harness abilities={ABILITIES} />
      </TestApp>,
    );

    const textarea = (await screen.findByTestId('message-input')) as HTMLTextAreaElement;
    await settle();

    expect(textarea).toHaveAttribute('role', 'combobox');
    expect(textarea).toHaveAttribute('aria-expanded', 'false');
    expect(textarea).not.toHaveAttribute('aria-controls');
    expect(textarea).not.toHaveAttribute('aria-activedescendant');
  });
});
