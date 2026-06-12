import { describe, it, expect } from "vitest";
import { normalizeRelayUrl, dedupeRelays, sanitizeUntrustedRelays } from "./relays";

describe("normalizeRelayUrl", () => {
  it("accepts ws and wss URLs", () => {
    expect(normalizeRelayUrl("wss://relay.example.com")).toBe("wss://relay.example.com");
    expect(normalizeRelayUrl("ws://relay.example.com")).toBe("ws://relay.example.com");
  });

  it("rejects non-websocket schemes", () => {
    expect(normalizeRelayUrl("https://relay.example.com")).toBeNull();
    expect(normalizeRelayUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeRelayUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(normalizeRelayUrl("")).toBeNull();
    expect(normalizeRelayUrl("not a url")).toBeNull();
    expect(normalizeRelayUrl(42)).toBeNull();
    expect(normalizeRelayUrl(null)).toBeNull();
  });

  it("normalizes trailing slash, case, and default ports", () => {
    expect(normalizeRelayUrl("wss://Relay.Example.COM/")).toBe("wss://relay.example.com");
    expect(normalizeRelayUrl("wss://relay.example.com:443")).toBe("wss://relay.example.com");
    expect(normalizeRelayUrl("ws://relay.example.com:80")).toBe("ws://relay.example.com");
    expect(normalizeRelayUrl("wss://relay.example.com?foo=1#bar")).toBe("wss://relay.example.com");
  });
});

describe("dedupeRelays", () => {
  it("merges lists, drops invalid entries and duplicates", () => {
    expect(
      dedupeRelays(
        ["wss://a.com", "wss://b.com/"],
        ["wss://b.com", "https://nope.com", null],
      ),
    ).toEqual(["wss://a.com", "wss://b.com"]);
  });
});

describe("sanitizeUntrustedRelays", () => {
  it("keeps valid public relay URLs", () => {
    expect(sanitizeUntrustedRelays(["wss://relay.example.com"])).toEqual([
      "wss://relay.example.com",
    ]);
  });

  it("drops invalid entries", () => {
    expect(sanitizeUntrustedRelays(["https://x.com", "garbage", 7])).toEqual([]);
    expect(sanitizeUntrustedRelays(undefined)).toEqual([]);
    expect(sanitizeUntrustedRelays(null)).toEqual([]);
  });

  // In dev/test builds private hosts are allowed (import.meta.env.DEV is true
  // under vitest), so the production-only private-host filtering cannot be
  // asserted here. Verify the dev passthrough instead.
  it("allows local relays in dev builds", () => {
    expect(sanitizeUntrustedRelays(["ws://localhost:7777"])).toEqual([
      "ws://localhost:7777",
    ]);
  });
});
