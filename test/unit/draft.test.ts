import { beforeEach, describe, expect, it } from "vitest";
import { clearDraft, emptyDraft, loadDraft, saveDraft } from "../../src/lib/draft.ts";

// The unit project runs in node, and this is the whole of the browser API the draft store touches.
// A real map rather than a mock, so the tests exercise the actual read-back path.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

/**
 * The draft is the only place a week's picks live before they are saved, so the rule that matters
 * is that it never lies about having one.
 */
describe("the draft on this device", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a draft in progress", () => {
    const draft = { selections: { a: "KC" as const }, order: ["a"] };
    saveDraft("p", 3, draft);
    expect(loadDraft("p", 3)).toEqual(draft);
    clearDraft("p", 3);
    expect(loadDraft("p", 3)).toBeNull();
  });

  it("reads an empty draft back as no draft", () => {
    // The iOS regression this mirrors: locking in resets the draft to empty, and that reset is
    // itself a change the screen writes back. An empty draft that persists is then preferred over
    // the picks already saved on the server, and the tray comes back empty.
    saveDraft("p", 3, { selections: { a: "KC" }, order: ["a"] });
    expect(loadDraft("p", 3)).not.toBeNull();

    saveDraft("p", 3, emptyDraft());
    expect(loadDraft("p", 3)).toBeNull();
  });

  it("treats selections with no order as nothing to restore", () => {
    saveDraft("p", 3, { selections: { a: "KC" }, order: [] });
    expect(loadDraft("p", 3)).toBeNull();
  });

  it("keeps each player and week apart", () => {
    saveDraft("p", 3, { selections: { a: "KC" }, order: ["a"] });
    expect(loadDraft("p", 4)).toBeNull();
    expect(loadDraft("other", 3)).toBeNull();
  });
});
