import { describe, it, expect } from "vitest";
import type { NostrEvent } from "@nostrify/nostrify";
import {
  getRoomATag,
  getRoomTitle,
  getRoomStatus,
  getRoomColor,
  getRoomStarts,
  getRoomDTag,
  getRoomRelays,
  getRoomParticipants,
  getRoomNamespace,
  getRoomThemeRef,
  buildRoomNaddr,
} from "./room";
import { NESTS_ROOM_KIND } from "./const";

const PUBKEY = "a".repeat(64);

function makeRoom(tags: string[][]): NostrEvent {
  return {
    id: "0".repeat(64),
    pubkey: PUBKEY,
    created_at: 1700000000,
    kind: NESTS_ROOM_KIND,
    tags,
    content: "",
    sig: "f".repeat(128),
  };
}

describe("room tag accessors", () => {
  const room = makeRoom([
    ["d", "room-123"],
    ["title", "Bitcoin Talk"],
    ["status", "live"],
    ["color", "gradient-3"],
    ["starts", "1700000100"],
    ["relays", "wss://relay.one", "wss://relay.two"],
    ["p", "b".repeat(64), "", "admin"],
    ["p", "c".repeat(64), "wss://relay.one", "speaker"],
    ["a", `36767:${PUBKEY}:my-theme`],
  ]);

  it("builds the room a-tag", () => {
    expect(getRoomATag(room)).toBe(`${NESTS_ROOM_KIND}:${PUBKEY}:room-123`);
  });

  it("reads title, status, color, starts, d-tag", () => {
    expect(getRoomTitle(room)).toBe("Bitcoin Talk");
    expect(getRoomStatus(room)).toBe("live");
    expect(getRoomColor(room)).toBe("gradient-3");
    expect(getRoomStarts(room)).toBe(1700000100);
    expect(getRoomDTag(room)).toBe("room-123");
  });

  it("falls back for missing tags", () => {
    const empty = makeRoom([["d", "x"]]);
    expect(getRoomTitle(empty)).toBe("Untitled Room");
    expect(getRoomStatus(empty)).toBe("live");
    expect(getRoomColor(empty)).toBe("gradient-1");
    expect(getRoomStarts(empty)).toBeUndefined();
  });

  it("treats unknown status as live, recognizes planned/ended", () => {
    expect(getRoomStatus(makeRoom([["status", "bogus"]]))).toBe("live");
    expect(getRoomStatus(makeRoom([["status", "planned"]]))).toBe("planned");
    expect(getRoomStatus(makeRoom([["status", "ended"]]))).toBe("ended");
  });

  it("reads the relays tag as a list", () => {
    expect(getRoomRelays(room)).toEqual(["wss://relay.one", "wss://relay.two"]);
    expect(getRoomRelays(makeRoom([]))).toEqual([]);
  });

  it("reads participants with roles", () => {
    expect(getRoomParticipants(room)).toEqual([
      { pubkey: "b".repeat(64), relay: "", role: "admin" },
      { pubkey: "c".repeat(64), relay: "wss://relay.one", role: "speaker" },
    ]);
  });

  it("builds the MoQ namespace", () => {
    expect(getRoomNamespace(room)).toBe(`nests/${NESTS_ROOM_KIND}:${PUBKEY}:room-123`);
  });

  it("finds the Ditto theme reference", () => {
    expect(getRoomThemeRef(room)).toBe(`36767:${PUBKEY}:my-theme`);
    expect(getRoomThemeRef(makeRoom([["a", "30311:xyz:other"]]))).toBeUndefined();
  });

  it("builds a decodable naddr", async () => {
    const naddr = buildRoomNaddr(room);
    expect(naddr.startsWith("naddr1")).toBe(true);
    const { nip19 } = await import("nostr-tools");
    const decoded = nip19.decode(naddr);
    expect(decoded.type).toBe("naddr");
    if (decoded.type === "naddr") {
      expect(decoded.data.kind).toBe(NESTS_ROOM_KIND);
      expect(decoded.data.pubkey).toBe(PUBKEY);
      expect(decoded.data.identifier).toBe("room-123");
    }
  });
});
