import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL, SUPPORT_SUBJECT, supportMailto } from "../../shared/contact.ts";

/**
 * The support address is written twice, once per language, and has to be the same address.
 *
 * A Swift build cannot see `shared/contact.ts`, so nothing but diligence keeps the app's *Get
 * help* row pointing where the website's privacy page points. The cost of drift is the worst kind
 * of bug on this particular string: somebody writes in and is simply never answered, which looks
 * exactly like being ignored.
 */
const swift = readFileSync(new URL("../../ios/TallyKit/Sources/TallyKit/Rules/Contact.swift", import.meta.url), "utf8");

function swiftString(name: string): string | undefined {
  return swift.match(new RegExp(`static let ${name} = "([^"]+)"`))?.[1];
}

describe("the support contact is the same on both surfaces", () => {
  it("is the same address", () => {
    expect(swiftString("supportEmail"), "Contact.swift should define supportEmail").toBeDefined();
    expect(swiftString("supportEmail")).toBe(SUPPORT_EMAIL);
  });

  it("arrives with the same subject line, so one inbox rule catches both", () => {
    expect(swiftString("supportSubject")).toBe(SUPPORT_SUBJECT);
  });

  it("builds a mailto the mail app will accept", () => {
    expect(supportMailto()).toBe(`mailto:${SUPPORT_EMAIL}?subject=Tally%20support`);
    expect(supportMailto("Something else")).toContain("subject=Something%20else");
  });

  /** An address with no `@` is not one, and is the kind of typo a test is for. */
  it("looks like an address at all", () => {
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
