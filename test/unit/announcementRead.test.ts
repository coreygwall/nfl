import { describe, expect, it } from "vitest";
import { countUnread } from "../../src/lib/announcementRead.ts";

const messages = [{ id: "newest" }, { id: "middle" }, { id: "oldest" }];

describe("announcement unread count", () => {
  it("treats every message as new before the feed has been viewed", () => {
    expect(countUnread(messages, null)).toBe(3);
  });

  it("counts only messages newer than the last viewed one", () => {
    expect(countUnread(messages, "middle")).toBe(1);
    expect(countUnread(messages, "newest")).toBe(0);
  });

  it("recovers when the previously seen message has fallen out of the feed", () => {
    expect(countUnread(messages, "missing")).toBe(3);
  });
});
