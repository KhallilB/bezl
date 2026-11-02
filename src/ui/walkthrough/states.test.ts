import { expect, test } from "vitest";
import { parseFrame } from "./states";

test("parseFrame defaults to running, dark", () => {
  expect(parseFrame("")).toEqual({ scene: "running", theme: "dark" });
});

test("parseFrame ignores unknown values, including inherited keys", () => {
  expect(parseFrame("?sample=toString&theme=sepia")).toEqual(parseFrame(""));
});

test("parseFrame reads sample and theme", () => {
  expect(parseFrame("?screen=task&sample=blocked&theme=light")).toEqual({
    scene: "blocked",
    theme: "light",
  });
});
