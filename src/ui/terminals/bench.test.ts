import { describe, expect, test } from "vitest";
import { fnv1a, StreamCheck } from "./bench";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("fnv1a", () => {
  test("matches the published FNV-1a 32-bit vectors", () => {
    expect(fnv1a(bytes(""))).toBe(0x811c9dc5);
    expect(fnv1a(bytes("a"))).toBe(0xe40c292c);
    expect(fnv1a(bytes("foobar"))).toBe(0xbf9cf968);
  });

  test("continues from a previous hash", () => {
    expect(fnv1a(bytes("bar"), fnv1a(bytes("foo")))).toBe(fnv1a(bytes("foobar")));
  });
});

describe("StreamCheck", () => {
  test("hashes the stream across chunk boundaries", () => {
    const c = new StreamCheck();
    c.push(bytes("hel"));
    c.push(bytes("lo\r\n"));
    expect(c.result()).toEqual({ bytes: 7, retriedCr: 0, hash: fnv1a(bytes("hello\r\n")) });
  });

  test("drops CRs the tty re-sent before a CRLF, even split across chunks", () => {
    const c = new StreamCheck();
    c.push(bytes("a\r"));
    c.push(bytes("\r"));
    c.push(bytes("\nb\r\r\r\n"));
    expect(c.result()).toEqual({ bytes: 9, retriedCr: 3, hash: fnv1a(bytes("a\r\nb\r\n")) });
  });

  test("keeps CRs that are not before a CRLF", () => {
    const c = new StreamCheck();
    c.push(bytes("a\r\rb\r"));
    expect(c.result()).toEqual({ bytes: 5, retriedCr: 0, hash: fnv1a(bytes("a\r\rb\r")) });
  });

  test("a lost byte changes the hash", () => {
    const whole = new StreamCheck();
    whole.push(bytes("abc\r\n"));
    const short = new StreamCheck();
    short.push(bytes("ac\r\n"));
    expect(short.result().hash).not.toBe(whole.result().hash);
  });
});
