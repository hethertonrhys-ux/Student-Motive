import { describe, expect, it } from "vitest";
import { CHAT_MEDIA, chatMediaPath, formatDuration, mediaProblem, shrinkTo } from "./chat-media";

describe("chat media", () => {
  it("formats video lengths", () => {
    expect(formatDuration(15_000)).toBe("0:15");
    expect(formatDuration(60_000)).toBe("1:00");
    expect(formatDuration(null)).toBe("0:00");
  });

  it("refuses videos over a minute and files over 50 MB", () => {
    expect(mediaProblem("video", { durationMs: 59_000, bytes: 10_000_000, mimeType: "video/mp4" })).toBeNull();
    expect(mediaProblem("video", { durationMs: 95_000 })).toBe("That video is 1:35 long. Videos can be up to 60 seconds.");
    expect(mediaProblem("video", { bytes: CHAT_MEDIA.maxBytes + 1 })).toMatch(/too big/);
    expect(mediaProblem("photo", { bytes: CHAT_MEDIA.maxBytes + 1 })).toMatch(/photo is too big/);
  });

  it("refuses file types the bucket won't take", () => {
    expect(mediaProblem("photo", { mimeType: "image/gif" })).toMatch(/JPEG or PNG/);
    expect(mediaProblem("video", { mimeType: "video/x-msvideo" })).toMatch(/MP4/);
    expect(mediaProblem("photo", { mimeType: "image/heic" })).toBeNull();
  });

  it("shrinks photos to 1280px on the longest side, never enlarging", () => {
    expect(shrinkTo(4032, 3024)).toEqual({ width: 1280, height: 960 });
    expect(shrinkTo(3024, 4032)).toEqual({ width: 960, height: 1280 });
    expect(shrinkTo(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("puts files in the chat's folder under the sender", () => {
    const path = chatMediaPath("t1", "u1", "JPG");
    expect(path).toMatch(/^t1\/u1\/[a-z0-9-]+\.jpg$/i);
    expect(path.split("/")).toHaveLength(3);
  });
});
