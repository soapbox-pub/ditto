import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MeetPeopleStep } from '@/components/onboarding/MeetPeopleStep';
import type { WelcomePerson, WelcomeSection } from '@/hooks/useWelcomePeople';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { clearThemePreview, startThemePreview, useThemePreview, type ThemePreview } from '@/lib/themePreview';
import { TestApp } from '@/test/TestApp';

const ME = 'f'.repeat(64);
const pk = (i: number) => i.toString(16).padStart(64, '0');

const state = vi.hoisted(() => ({
  welcome: { data: undefined as WelcomeSection[] | undefined, isPending: true, isError: false },
  authors: { data: new Map<string, { metadata: NostrMetadata }>(), isFetched: true },
  theme: 'light',
}));

const publish = vi.fn(async () => ({}));
const setTheme = vi.fn();
const applyCustomTheme = vi.fn();
const store = { query: vi.fn(async () => []) };

vi.mock('@/hooks/useWelcomePeople', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useWelcomePeople')>()),
  useWelcomePeople: () => state.welcome,
}));
vi.mock('@/hooks/useAuthors', () => ({ useAuthors: () => state.authors }));
vi.mock('@/hooks/useAuthor', () => ({ useAuthor: () => ({ data: { metadata: { name: 'Someone' } } }) }));
vi.mock('@/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ user: { pubkey: ME } }) }));
vi.mock('@/hooks/useNostrPublish', () => ({ useNostrPublish: () => ({ mutateAsync: publish }) }));
vi.mock('@/hooks/useNostrStorage', () => ({ useNostrStorage: () => ({ store }) }));
vi.mock('@/lib/fetchFreshEvent', () => ({ fetchFreshEvent: vi.fn(async () => null) }));
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: state.theme, customTheme: undefined, setTheme, applyCustomTheme, displayTheme: state.theme }),
}));

const event = (pubkey: string): NostrEvent => ({ id: pubkey, pubkey, kind: 1, created_at: 0, tags: [], content: '', sig: '' });

const talker = (i: number): WelcomePerson => ({
  pubkey: pk(i),
  preview: { type: 'talk', works: [{ event: event(pk(i)), text: `note ${i}` }] },
});
const photographer = (i: number): WelcomePerson => ({
  pubkey: pk(i),
  preview: { type: 'photos', works: [{ event: event(pk(i)), image: { url: `https://example.com/${i}.jpg`, dim: '10x10' } }] },
});

const section = (id: string, people: WelcomePerson[]): WelcomeSection => ({ id, label: { id: `test.${id}`, defaultMessage: id }, people });

const themes = section('themes', [1, 2, 3, 4].map(talker));
const cooks = section('cooks', [11, 12, 13, 14].map(photographer));
const writers = section('makers', [21, 22, 23, 24, 25].map(talker));

function withPictures(people: number[]) {
  return new Map(people.map((i) => [pk(i), { metadata: { name: `P${i}`, picture: `https://example.com/p${i}.png` } }]));
}

const ALL = [1, 2, 3, 4, 11, 12, 13, 14, 21, 22, 23, 24, 25];

let preview: ThemePreview | null = null;
function PreviewProbe() {
  preview = useThemePreview();
  return null;
}

function renderStep(props: Partial<Parameters<typeof MeetPeopleStep>[0]> = {}) {
  const onNext = vi.fn();
  const onBack = vi.fn();
  const ui = () => <TestApp><PreviewProbe /><MeetPeopleStep onNext={onNext} onBack={onBack} {...props} /></TestApp>;
  const view = render(ui());
  return { onNext, onBack, rerender: () => view.rerender(ui()) };
}

const tryOnTheme = () => act(() => startThemePreview({ title: 'Dusk', colors: { background: '0 0% 0%', text: '0 0% 100%', primary: '200 80% 50%' } }));

beforeEach(() => {
  state.welcome = { data: [themes, cooks, writers], isPending: false, isError: false };
  state.authors = { data: withPictures(ALL), isFetched: true };
  state.theme = 'light';
});

afterEach(() => {
  vi.clearAllMocks();
  act(() => clearThemePreview());
  preview = null;
});

describe('MeetPeopleStep', () => {
  it('says so when discovery failed, instead of loading forever', async () => {
    state.welcome = { data: undefined, isPending: false, isError: true };
    renderStep();
    expect(await screen.findByText(/no one to suggest/i)).toBeInTheDocument();
  });

  it('says so when every suggestion was filtered out', async () => {
    state.authors = { data: new Map(), isFetched: true };
    renderStep();
    expect(await screen.findByText(/no one to suggest/i)).toBeInTheDocument();
  });

  it.each(['Skip for now', 'Back'])('ends a tried-on theme on %s', async (button) => {
    renderStep();
    await screen.findByText('themes');
    tryOnTheme();
    expect(preview).not.toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: button }));
    await waitFor(() => expect(preview).toBeNull());
  });

  it("doesn't re-save the theme when Reset only ends a preview", async () => {
    renderStep();
    tryOnTheme();
    fireEvent.click(await screen.findByRole('button', { name: /reset theme/i }));
    expect(preview).toBeNull();
    expect(setTheme).not.toHaveBeenCalled();
    expect(applyCustomTheme).not.toHaveBeenCalled();
  });

  it('resets to the theme the step opened with, even after the themes section remounts', async () => {
    const { rerender } = renderStep();
    await screen.findByText('themes');
    state.welcome = { ...state.welcome, data: [cooks, writers] };
    rerender();
    state.theme = 'dark';
    rerender();
    state.welcome = { ...state.welcome, data: [themes, cooks, writers] };
    rerender();
    fireEvent.click(await screen.findByRole('button', { name: /reset theme/i }));
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it("Follow all leaves out people whose work didn't load", async () => {
    const io = globalThis.IntersectionObserver;
    // @ts-expect-error: no observer means every tile counts as near the screen.
    delete globalThis.IntersectionObserver;
    try {
      state.welcome = { ...state.welcome, data: [cooks] };
      renderStep();
      const img = await waitFor(() => {
        const found = document.querySelector('img[src="https://example.com/11.jpg"]');
        expect(found).not.toBeNull();
        return found!;
      });
      fireEvent.error(img);
      fireEvent.click(await screen.findByRole('button', { name: 'Follow all 3' }));
      fireEvent.click(screen.getByRole('button', { name: /follow 3/i }));
      await waitFor(() => expect(publish).toHaveBeenCalled());
      const tags = (publish.mock.calls[0] as unknown as [{ tags: string[][] }])[0].tags;
      expect(tags.map(([, p]) => p)).toEqual([pk(12), pk(13), pk(14)]);
    } finally {
      globalThis.IntersectionObserver = io;
    }
  });

  it("doesn't follow a pick that was filtered out once profiles loaded", async () => {
    state.welcome = { ...state.welcome, data: [writers] };
    state.authors = { data: new Map(), isFetched: false };
    const { rerender } = renderStep();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Follow' }))[0]);
    state.authors = { data: withPictures([22, 23, 24, 25]), isFetched: true };
    rerender();
    fireEvent.click(await screen.findByRole('button', { name: /skip for now/i }));
    expect(publish).not.toHaveBeenCalled();
  });

  it('reads the follow list with the local store as a floor', async () => {
    renderStep();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Follow' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: /follow 1/i }));
    await waitFor(() => expect(publish).toHaveBeenCalled());
    expect(fetchFreshEvent).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ store }));
  });
});
