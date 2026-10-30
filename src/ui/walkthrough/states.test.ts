import { expect, test } from "vitest";
import { frameSrc, parseFrame } from "./states";

test("parseFrame defaults to running, dark", () => {
  expect(parseFrame("")).toEqual({ scene: "running", theme: "dark" });
});

test("parseFrame ignores unknown values, including inherited keys", () => {
  expect(parseFrame("?sample=toString&theme=sepia")).toEqual(parseFrame(""));
});

test("frameSrc round-trips through parseFrame", () => {
  expect(parseFrame(frameSrc("blocked", "light"))).toEqual({ scene: "blocked", theme: "light" });
});
