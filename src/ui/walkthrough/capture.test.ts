import { describe, expect, test } from "vitest";
import { manifest, parseArgs, shots, videoFile } from "./capture";
import { themes } from "./states";
import { parseTour, steps } from "./tour";

describe("shots", () => {
  test("cover every step in both themes, in tour order", () => {
    const list = shots();
    expect(list).toHaveLength(steps.length * themes.length);
    expect(list.map((s) => s.id)).toEqual(steps.flatMap((s) => themes.map(() => s.id)));
    for (const s of list) expect(s.title).toBe(steps[s.step - 1]?.title);
  });

  test("each opens its own step and theme", () => {
    for (const s of shots())
      expect(parseTour(s.search)).toEqual({ index: s.step - 1, theme: s.theme });
  });

  test("file names are unique and sort in tour order", () => {
    const files = shots().map((s) => s.file);
    expect(new Set(files).size).toBe(files.length);
    expect([...files].sort()).toEqual(files);
    expect(files.slice(0, 2)).toEqual([
      `01-${steps[0]?.id}-dark.png`,
      `01-${steps[0]?.id}-light.png`,
    ]);
  });
});

test("manifest names the video and every shot", () => {
  const list = shots();
  const m = manifest(list);
  expect(m.video).toBe(videoFile);
  expect(m.shots[0]).toEqual({
    step: 1,
    chapter: steps[0]?.chapter,
    title: steps[0]?.title,
    theme: "dark",
    file: list[0]?.file,
  });
  expect(m.shots.map((s) => s.file)).toEqual(list.map((s) => s.file));
});

describe("parseArgs", () => {
  test("defaults to WebKit and a temp directory", () => {
    expect(parseArgs([])).toEqual({ out: null, browser: "webkit" });
  });

  test("reads the out dir and --browser in either order", () => {
    expect(parseArgs(["shots", "--browser", "chromium"])).toEqual({
      out: "shots",
      browser: "chromium",
    });
    expect(parseArgs(["--browser=chromium", "shots"])).toEqual({
      out: "shots",
      browser: "chromium",
    });
  });

  test("refuses unknown browsers, flags and extra args", () => {
    expect(() => parseArgs(["--browser", "firefox"])).toThrow(/webkit\|chromium/);
    expect(() => parseArgs(["--browser"])).toThrow(/webkit\|chromium/);
    expect(() => parseArgs(["--fast"])).toThrow(/--fast/);
    expect(() => parseArgs(["a", "b"])).toThrow(/b/);
  });
});
