import { describe, it, expect, beforeEach } from "vitest";
import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { NostrLoginProvider, useNostrLogin } from "@nostrify/react/login";
import { AppProvider } from "@/components/AppProvider";
import { ActiveAccountSync } from "@/components/ActiveAccountSync";
import { useAppContext } from "@/hooks/useAppContext";
import {
  APP_CONFIG_STORAGE_KEY,
  accountScopedKey,
  setActivePubkey,
} from "@/lib/activeAccount";
import type { AppConfig } from "@/contexts/AppContext";

const A = "a".repeat(64);
const B = "b".repeat(64);

function ThemeProbe() {
  const { config } = useAppContext();
  return <div data-testid="theme">{config.theme}</div>;
}

// Minimal config — only `theme` matters for this test; the rest is cast away.
const defaultConfig = { theme: "system" } as AppConfig;

describe("AppProvider per-account theme swap", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePubkey(null);
  });

  it("swaps the active config's theme when the account marker changes (switch/logout)", () => {
    localStorage.setItem(
      accountScopedKey(APP_CONFIG_STORAGE_KEY, A),
      JSON.stringify({ theme: "dark" }),
    );
    localStorage.setItem(
      accountScopedKey(APP_CONFIG_STORAGE_KEY, B),
      JSON.stringify({ theme: "light" }),
    );

    act(() => setActivePubkey(A));

    const { getByTestId } = render(
      <AppProvider storageKey={APP_CONFIG_STORAGE_KEY} defaultConfig={defaultConfig}>
        <ThemeProbe />
      </AppProvider>,
    );

    expect(getByTestId("theme").textContent).toBe("dark");

    // Simulates ActiveAccountSync mirroring logins[0] after a switch or a
    // logout that leaves another account active.
    act(() => setActivePubkey(B));

    expect(getByTestId("theme").textContent).toBe("light");
  });

  it("swaps the theme on logout when another account remains (full chain)", async () => {
    localStorage.setItem(
      accountScopedKey(APP_CONFIG_STORAGE_KEY, A),
      JSON.stringify({ theme: "dark" }),
    );
    localStorage.setItem(
      accountScopedKey(APP_CONFIG_STORAGE_KEY, B),
      JSON.stringify({ theme: "light" }),
    );
    // Two logged-in accounts, A active (logins[0]).
    localStorage.setItem(
      "test-login",
      JSON.stringify([
        { id: "A", type: "nsec", pubkey: A, data: { nsec: "nsec1a" } },
        { id: "B", type: "nsec", pubkey: B, data: { nsec: "nsec1b" } },
      ]),
    );

    let logoutActive: () => void = () => {};

    function Harness() {
      const { config } = useAppContext();
      const { logins, removeLogin } = useNostrLogin();
      logoutActive = () => removeLogin(logins[0].id);
      return <div data-testid="theme">{config.theme}</div>;
    }

    const { getByTestId } = render(
      <AppProvider storageKey={APP_CONFIG_STORAGE_KEY} defaultConfig={defaultConfig}>
        <NostrLoginProvider storageKey="test-login" storage={localStorage}>
          <ActiveAccountSync />
          <Harness />
        </NostrLoginProvider>
      </AppProvider>,
    );

    // NostrLoginProvider resolves its logins asynchronously; wait for A active.
    await waitFor(() => expect(getByTestId("theme").textContent).toBe("dark"));

    // Log out of A — B should become active and its theme should apply.
    act(() => logoutActive());

    await waitFor(() => expect(getByTestId("theme").textContent).toBe("light"));
  });

  it("does not write the new account's theme into the previous account's scope during a switch", async () => {
    localStorage.setItem(
      accountScopedKey(APP_CONFIG_STORAGE_KEY, A),
      JSON.stringify({ theme: "dark" }),
    );
    localStorage.setItem(
      accountScopedKey(APP_CONFIG_STORAGE_KEY, B),
      JSON.stringify({ theme: "light" }),
    );
    localStorage.setItem(
      "test-login",
      JSON.stringify([
        { id: "A", type: "nsec", pubkey: A, data: { nsec: "nsec1a" } },
        { id: "B", type: "nsec", pubkey: B, data: { nsec: "nsec1b" } },
      ]),
    );

    // Stand-in for NostrSync: whenever the active user changes, apply THAT
    // user's own theme to the shared config via updateConfig — exactly the
    // write that lands in the wrong account's scope if AppProvider's marker
    // hasn't caught up yet.
    function FakeNostrSync() {
      const { updateConfig } = useAppContext();
      const { logins } = useNostrLogin();
      const pubkey = logins[0]?.pubkey;
      useEffect(() => {
        if (!pubkey) return;
        const theme = pubkey === A ? "dark" : "light";
        updateConfig((c) => (c.theme === theme ? c : { ...c, theme }));
      }, [pubkey, updateConfig]);
      return null;
    }

    let switchTo: (id: string) => void = () => {};
    function Harness() {
      const { config } = useAppContext();
      const { setLogin } = useNostrLogin();
      switchTo = setLogin;
      return <div data-testid="theme">{config.theme}</div>;
    }

    const { getByTestId } = render(
      <AppProvider storageKey={APP_CONFIG_STORAGE_KEY} defaultConfig={defaultConfig}>
        <NostrLoginProvider storageKey="test-login" storage={localStorage}>
          <ActiveAccountSync />
          <FakeNostrSync />
          <Harness />
        </NostrLoginProvider>
      </AppProvider>,
    );

    await waitFor(() => expect(getByTestId("theme").textContent).toBe("dark"));

    // Switch A -> B, then B -> A (the direction that would corrupt B's scope).
    act(() => switchTo("B"));
    await waitFor(() => expect(getByTestId("theme").textContent).toBe("light"));
    act(() => switchTo("A"));
    await waitFor(() => expect(getByTestId("theme").textContent).toBe("dark"));

    // B's own stored theme must be untouched. If the marker lagged, FakeNostrSync
    // wrote A's "dark" into B's scope while switching back to A.
    const bStored = JSON.parse(
      localStorage.getItem(accountScopedKey(APP_CONFIG_STORAGE_KEY, B)) ?? "{}",
    );
    expect(bStored.theme).toBe("light");
  });
});
