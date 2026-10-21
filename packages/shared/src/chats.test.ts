import { describe, expect, it } from "vitest";
import { isNote, messagePreview } from "./chats";

describe("chat messages", () => {
  it("knows which messages are notes", () => {
    expect(isNote("left")).toBe(true);
    expect(isNote("rejoined")).toBe(true);
    expect(isNote("removed")).toBe(true);
    expect(isNote("message")).toBe(false);
    expect(isNote("photo")).toBe(false);
  });

  it("previews a message in a line (the pinned bar)", () => {
    expect(messagePreview({ kind: "message", body: "Doors at 7", deleted: false })).toBe("Doors at 7");
    expect(messagePreview({ kind: "photo", body: "Sent a photo", deleted: false })).toBe("Photo");
    expect(messagePreview({ kind: "video", body: "Sent a video", deleted: false })).toBe("Video");
    expect(messagePreview({ kind: "event", body: "Shared an event: Poker Night https://studentfunction.com/e/1", deleted: false })).toBe("Event: Poker Night");
    expect(messagePreview({ kind: "message", body: "", deleted: true })).toBe("Message deleted");
  });
});
