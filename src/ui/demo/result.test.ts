import { describe, expect, test } from "vitest";
import { Asserts } from "./result";

describe("Asserts", () => {
  test("passes only when every check passed", () => {
    const a = new Asserts("providers");
    a.check("cards shown", true, "2 cards");
    expect(a.result().pass).toBe(true);
    a.check("fake rejected", false, "no entry");
    expect(a.result()).toMatchObject({
      scenario: "providers",
      pass: false,
      asserts: [
        { name: "cards shown", pass: true, detail: "2 cards" },
        { name: "fake rejected", pass: false, detail: "no entry" },
      ],
    });
  });

  test("a run that checked nothing does not pass", () => {
    expect(new Asserts("terminals").result().pass).toBe(false);
  });

  test("a script that threw fails with its error, keeping the frames it took", () => {
    const a = new Asserts("terminals");
    a.frame("/out/01-streaming.png");
    a.check("echo under 100 ms", true, "max 12 ms");
    a.threw(new Error("viewer never opened"));
    expect(a.result()).toMatchObject({
      pass: false,
      frames: ["/out/01-streaming.png"],
      asserts: [{ pass: true }, { name: "script", pass: false, detail: "viewer never opened" }],
    });
  });
});
