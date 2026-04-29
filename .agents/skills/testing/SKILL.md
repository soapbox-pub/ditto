---
name: testing
description: Write Vitest unit tests for React components and hooks using the project's `TestApp` wrapper, jsdom environment, and pre-mocked browser APIs (localStorage, matchMedia, scrollTo, IntersectionObserver, ResizeObserver). Also covers the project policy on when to create new test files.
---

# Testing

Load this skill when the user asks you to write a test, diagnose a bug with a test, or add coverage for a component/hook. Running the existing test script is a standing requirement (see `AGENTS.md` → *Validating Your Changes*) and doesn't require this skill.

## Policy: when to create new test files

**Do not create new test files unless one of these applies:**

1. The user explicitly asks for tests.
2. The user describes a specific bug and asks for tests to diagnose it.
3. The user says a problem persists after you tried to fix it.

Never write tests because tool results show failures, because you think tests would be helpful, or because you added a new feature. The request must come from the user.

If none of the above apply, stop — don't create a test file. Keep running the existing test script as usual.

## Test setup

The project uses **Vitest + jsdom** with **React Testing Library** and **jest-dom** matchers. Global setup lives in `src/test/setup.ts` and mocks these browser APIs that jsdom doesn't provide (or that Node's built-ins conflict with):

- `localStorage` — a Map-backed mock, because Node 22's built-in `localStorage` lacks the Web Storage API surface jsdom expects
- `window.matchMedia`
- `window.scrollTo`
- `IntersectionObserver`
- `ResizeObserver`

If your component needs another browser API, extend `src/test/setup.ts` rather than mocking per-file.

## Writing a component test

Wrap rendered components in `TestApp` (`src/test/TestApp.tsx`) so all context providers — `UnheadProvider`, `AppProvider`, `QueryClientProvider`, `NostrLoginProvider`, `NostrProvider`, `BrowserRouter`, etc. — are available. Without it, hooks like `useQuery`, `useNostr`, `useAppContext`, or `useNavigate` will throw.

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<TestApp><MyComponent /></TestApp>);
    expect(screen.getByText('Expected text')).toBeInTheDocument();
  });
});
```

## Writing a hook test

Use `renderHook` from `@testing-library/react` and pass `TestApp` as the `wrapper`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { useMyHook } from './useMyHook';

describe('useMyHook', () => {
  it('returns expected data', async () => {
    const { result } = renderHook(() => useMyHook(), { wrapper: TestApp });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });
});
```

Files placed next to the code under test with the `.test.ts` / `.test.tsx` suffix are picked up automatically. For reference, see `src/test/ErrorBoundary.test.tsx`.

## Running tests

The `npm test` script runs `tsc --noEmit`, `eslint`, `vitest run`, and `vite build` in sequence. Always run it after changes — a passing test file alone doesn't mean your task is done.

For fast iteration, run just Vitest:

```bash
npx vitest run
```

Or in watch mode while editing:

```bash
npx vitest
```
