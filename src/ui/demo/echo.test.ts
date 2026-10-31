import { describe, expect, test } from "vitest";
import { EchoTimer } from "./echo";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("EchoTimer", () => {
  test("times a token from typing to its drawn echo, across chunks", async () => {
    let now = 0;
    const echo = new EchoTimer(() => now);
    const typed: string[] = [];
    const timed = echo.time("<e1>", (t) => {
      typed.push(t);
      now = 5;
      echo.drawn(bytes("<e"));
      now = 9;
      echo.drawn(bytes("1>"));
    });
    await expect(timed).resolves.toBe(9);
    expect(typed).toEqual(["<e1>"]);
  });

  test("an earlier token's echo does not end a later one", async () => {
    let now = 0;
    const echo = new EchoTimer(() => now);
    await echo.time("<e1>", () => echo.drawn(bytes("<e1>")));
    let done = false;
    const timed = echo.time("<e2>", () => echo.drawn(bytes("<e1>"))).then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    now = 7;
    echo.drawn(bytes("<e2>"));
    await timed;
    expect(done).toBe(true);
  });
});
