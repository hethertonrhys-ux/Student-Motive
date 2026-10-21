import { describe, expect, it } from "vitest";
import { profileIdFromScan, profileQrLink } from "./qr";

const ID = "3f2b1c4d-1111-4222-8333-444455556666";

describe("profile QR codes", () => {
  it("is just a link to the profile", () => {
    expect(profileQrLink("https://studentfunction.com", ID)).toBe(`https://studentfunction.com/u/${ID}`);
    expect(profileQrLink("https://studentfunction.com/", ID)).toBe(`https://studentfunction.com/u/${ID}`);
  });

  it("reads Function profile codes", () => {
    expect(profileIdFromScan(`https://studentfunction.com/u/${ID}`)).toBe(ID);
    expect(profileIdFromScan(`https://app.studentfunction.com/u/${ID}/`)).toBe(ID);
    expect(profileIdFromScan(`https://studentfunction.com/u/${ID.toUpperCase()}`)).toBe(ID);
    expect(profileIdFromScan(`function://u/${ID}`)).toBe(ID);
    expect(profileIdFromScan(`http://localhost:8081/u/${ID}`, "http://localhost:8081")).toBe(ID);
  });

  it("ignores anything else", () => {
    expect(profileIdFromScan("hello")).toBeNull();
    expect(profileIdFromScan(`https://evil.example/u/${ID}`)).toBeNull();
    expect(profileIdFromScan(`https://studentfunction.com.evil.example/u/${ID}`)).toBeNull();
    expect(profileIdFromScan(`https://studentfunction.com/e/${ID}`)).toBeNull();
    expect(profileIdFromScan(`https://studentfunction.com/u/not-an-id`)).toBeNull();
    expect(profileIdFromScan(`javascript://u/${ID}`)).toBeNull();
    expect(profileIdFromScan(`otherapp://u/${ID}`)).toBeNull();
  });
});
