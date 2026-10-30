import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { thisMachine } from "../providers/fixtures";
import { Providers } from "../providers/Providers";
import { providerAsserts, readCards } from "./providers";

const FAKE = "/Users/me/.bun/bin/codex";

describe("readCards", () => {
  test("reads each provider card with its rejected binaries as shown", () => {
    const { container } = render(<Providers checks={thisMachine} />);
    const cards = readCards(container);
    expect(cards.map((c) => c.name)).toEqual(["Claude Code", "Codex"]);
    expect(cards[0]?.rejected).toEqual([]);
    expect(cards[1]?.rejected).toEqual([{ path: FAKE, says: expect.stringContaining("0.2.3") }]);
  });
});

describe("providerAsserts", () => {
  test("pass when the fake codex is rejected with what it printed", () => {
    const { container } = render(<Providers checks={thisMachine} />);
    const got = providerAsserts(readCards(container), { path: FAKE, prints: "0.2.3" });
    expect(got.every((a) => a.pass)).toBe(true);
  });

  test("fail when the fake is not among the rejected", () => {
    const { container } = render(<Providers checks={thisMachine} />);
    const got = providerAsserts(readCards(container), {
      path: "/elsewhere/codex",
      prints: "0.2.3",
    });
    expect(got.find((a) => a.name.includes("rejected"))?.pass).toBe(false);
  });
});
